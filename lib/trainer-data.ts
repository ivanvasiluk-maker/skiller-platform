import { systemPrompt, type CommunicationPreferences } from "@/lib/communication-preferences";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { getRawDb } from "@/db";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { ensureUser, recommendSkill, startAttempt, completeAttempt, completeOnboarding, loadDashboard, type SkillView } from "@/lib/skiller-data";
import { cacheIdempotentResponse, claimIdempotentRequest } from "@/lib/request-idempotency";
import { buildTrainerContinuity, type TrainerContinuity } from "@/lib/trainer-continuity";
import { produceFreeTalkReply } from "@/lib/free-talk";
import { ensureOpenLoopStorage, createOpenLoop, dueOpenLoop, markFollowUpShown, markFollowUpAnswered, resolveOpenLoop, openLoopForPlan, buildConversationContext, buildOrchestratorInstructions, topicFromText, saveSuccessFactor, saveInterventionMemory, createConversationFollowUp, pendingConversationFollowUp, completeConversationFollowUp, type OpenLoop, type ConversationFollowUp } from "@/lib/conversation-orchestrator";
import { classifyAttemptReport, concreteActionFromText, conversationIntent, missingLinkQuestion } from "@/lib/conversation-language";
import { advanceComplexAnalysis, applyBehavioralMemoryDraft, behavioralPatternById, buildWorkingHypothesis, chainEditPrompt, chooseChainEditField, clarificationQuestion, completeSituationAnalysis, complexAnalysisQuestion, createSituationAnalysis, dismissBehavioralMemory, ensureConversationAnalysisStorage, interventionPointPrompt, isBareRejection, isHypothesisConfirmed, moveToInterventionChoice, parseChainEditField, parseInterventionPoint, pendingSituationAnalysis, relevantBehavioralPattern, requestSituationCorrection, saveBehavioralPattern, saveInterventionPoint, saveSituationHypothesis, type BehavioralPattern, type InterventionPoint, type SituationAnalysisSession } from "@/lib/conversation-analysis";
import type { OutcomeReasonCode } from "@/lib/outcome-policy";
import { recordPilotEvent, type PilotEventPayload } from "@/lib/pilot-events";
import { skillCardVersion } from "@/lib/skill-card-versions";
import { persistTrainerSettings } from "@/lib/trainer-settings";
import { trainers, PRODUCT_VERSION, dayIndex, requiresSafetyRoute, safetyMessage, buildRecap, type TrainerId, type InteractionMode } from "@/lib/trainers";

export type TrainerProfile = CommunicationPreferences & { user_id: string; pseudonym: string; name: string; trainer_id: TrainerId; interaction_mode: InteractionMode; main_problem: string; consent_version: string; created_at: string; last_interaction_at: string; safety_flag: number };
export type TrainerMessage = { id: string; role: "user" | "assistant"; text: string; trainer_id: TrainerId; created_at: string };
export type TrainerPlan = { id: string; situation_id: string; skill_json: string; skill_title: string; entry_mode: string; intensity_before: number; intensity_after: number | null; attempt_id: string | null; result: "done" | "partial" | "failed" | "more" | null; completed_part?: string | null; stopping_point?: string | null; paused?: number | null; reported_result?: "done" | "partial" | "failed" | "more" | null; worsened?: number | null; helpfulness: number | null; decision_reason_code: OutcomeReasonCode; decision_version: string; created_at: string };
export type ContextualMemory = Pick<BehavioralPattern, "id" | "thought" | "urge" | "action" | "intervention_point" | "occurrence_count">;
export type TrainerState = { profile: TrainerProfile | null; day: number; messages: TrainerMessage[]; hasEarlierMessages?: boolean; plans: TrainerPlan[]; recap: ReturnType<typeof buildRecap>; engagedDays: number[]; continuity: TrainerContinuity; openLoops: OpenLoop[]; dueLoop: OpenLoop | null; pendingFollowUp: ConversationFollowUp | null; pendingSituationAnalysis: SituationAnalysisSession | null; contextualMemory: ContextualMemory | null };

const statements = [
  "CREATE TABLE IF NOT EXISTS trainer_communication_preferences (user_id TEXT PRIMARY KEY,address_form TEXT NOT NULL DEFAULT 'formal' CHECK(address_form IN ('formal','informal')),grammatical_gender TEXT NOT NULL DEFAULT 'neutral' CHECK(grammatical_gender IN ('neutral','masculine','feminine')),updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS trainer_performance_details (plan_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,completed_part TEXT NOT NULL DEFAULT '',stopping_point TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS trainer_plan_pauses (plan_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,paused INTEGER NOT NULL DEFAULT 0,loop_status TEXT,updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS trainer_outcome_reports (plan_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,reported_result TEXT NOT NULL,worsened INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS trainer_profiles (user_id TEXT PRIMARY KEY, pseudonym TEXT NOT NULL UNIQUE, name TEXT NOT NULL, trainer_id TEXT NOT NULL, interaction_mode TEXT NOT NULL DEFAULT 'explore', main_problem TEXT NOT NULL, consent_version TEXT NOT NULL, created_at TEXT NOT NULL, last_interaction_at TEXT NOT NULL, safety_flag INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS trainer_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, trainer_id TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS trainer_messages_user ON trainer_messages(user_id, created_at)",
  "CREATE TABLE IF NOT EXISTS trainer_plans (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, situation_id TEXT NOT NULL, skill_json TEXT NOT NULL, skill_title TEXT NOT NULL, entry_mode TEXT NOT NULL, intensity_before INTEGER NOT NULL, intensity_after INTEGER, attempt_id TEXT, result TEXT, helpfulness INTEGER, decision_reason_code TEXT NOT NULL DEFAULT 'first_try', decision_version TEXT NOT NULL DEFAULT 'outcome-policy-v2', created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS trainer_plans_user ON trainer_plans(user_id, created_at)",
  "CREATE TABLE IF NOT EXISTS pilot_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, trainer_id TEXT NOT NULL, day_index INTEGER NOT NULL, event_name TEXT NOT NULL, payload_json TEXT NOT NULL, product_version TEXT NOT NULL, created_at TEXT NOT NULL, exported_at TEXT)",
  "CREATE INDEX IF NOT EXISTS pilot_events_user ON pilot_events(user_id, day_index)",
  "CREATE TABLE IF NOT EXISTS pilot_feedback (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day_index INTEGER NOT NULL, helpfulness INTEGER NOT NULL, understood INTEGER NOT NULL, continue_intent INTEGER NOT NULL, helped TEXT NOT NULL, annoyed TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS trainer_requests (user_id TEXT NOT NULL, request_id TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL, PRIMARY KEY(user_id, request_id))",
  "CREATE TABLE IF NOT EXISTS cohorts (key TEXT PRIMARY KEY, product_version TEXT NOT NULL, starts_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS cohort_members (cohort_key TEXT NOT NULL, user_id TEXT NOT NULL, first_event_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cohort_key, user_id))",
  "CREATE TABLE IF NOT EXISTS export_queue (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS idx_export_queue_status_retry ON export_queue(status, retry_at)",
];
export async function ensureTrainerStorage() {
  const db = getRawDb();
  await db.batch(statements.map(s => db.prepare(s)));
  for (const statement of [
    "ALTER TABLE trainer_plans ADD decision_reason_code TEXT NOT NULL DEFAULT 'first_try'",
    "ALTER TABLE trainer_plans ADD decision_version TEXT NOT NULL DEFAULT 'outcome-policy-v2'",
  ]) {
    try {
      await db.prepare(statement).run();
    } catch {
      // Existing databases may already have the auditable decision columns.
    }
  }
}
async function profileFor(userId: string) {
  return getRawDb().prepare("SELECT p.*, COALESCE(c.address_form,'formal') AS address_form, COALESCE(c.grammatical_gender,'neutral') AS grammatical_gender FROM trainer_profiles p LEFT JOIN trainer_communication_preferences c ON c.user_id=p.user_id WHERE p.user_id=?").bind(userId).first<TrainerProfile>();
}
export async function trainerHistory(user: ChatGPTUser, beforeId: string) {
  if (!beforeId || beforeId.length > 160) throw new Error("Неверная точка истории.");
  await ensureTrainerStorage();
  const db = getRawDb();
  const cursor = await db.prepare("SELECT rowid AS message_order FROM trainer_messages WHERE id=? AND user_id=?").bind(beforeId,user.userId).first<{ message_order: number }>();
  if (!cursor) throw new Error("Точка истории не найдена.");
  const rows = await db.prepare("SELECT id,role,text,trainer_id,created_at FROM trainer_messages WHERE user_id=? AND rowid<? ORDER BY rowid DESC LIMIT 61").bind(user.userId,cursor.message_order).all<TrainerMessage>();
  return { messages: rows.results.slice(0,60).reverse(), hasEarlierMessages: rows.results.length > 60 };
}

export async function trainerState(user: ChatGPTUser): Promise<TrainerState> {
  await ensureUser(user);
  await ensureTrainerStorage();
  await ensureOpenLoopStorage();
  await ensureConversationAnalysisStorage();
  const db = getRawDb();
  const profile = await profileFor(user.userId);
  if (!profile) return { profile: null, day: 1, messages: [], plans: [], recap: buildRecap([]), engagedDays: [], continuity: buildTrainerContinuity([]), openLoops: [], dueLoop: null, pendingFollowUp: null, pendingSituationAnalysis: null, contextualMemory: null };
  const [messages, plans, days, loops, due, pendingFollowUp, pendingPreAnalysis] = await Promise.all([
    db.prepare("SELECT id,role,text,trainer_id,created_at FROM (SELECT rowid AS message_order,id,role,text,trainer_id,created_at FROM trainer_messages WHERE user_id=? ORDER BY rowid DESC LIMIT 61) ORDER BY message_order").bind(user.userId).all<TrainerMessage>(),
    db.prepare("SELECT p.*,r.reported_result,r.worsened,x.paused,d.completed_part,d.stopping_point FROM trainer_plans p LEFT JOIN trainer_outcome_reports r ON r.plan_id=p.id AND r.user_id=p.user_id LEFT JOIN trainer_plan_pauses x ON x.plan_id=p.id AND x.user_id=p.user_id LEFT JOIN trainer_performance_details d ON d.plan_id=p.id AND d.user_id=p.user_id WHERE p.user_id=? ORDER BY p.created_at DESC,p.rowid DESC LIMIT 100").bind(user.userId).all<TrainerPlan>(),
    db.prepare("SELECT DISTINCT day_index FROM pilot_events WHERE user_id=? AND event_name='engaged_return' ORDER BY day_index").bind(profile.pseudonym).all<{ day_index: number }>(),
    db.prepare("SELECT * FROM open_loops WHERE user_id=? AND status IN ('active','answered','paused') ORDER BY priority DESC, follow_up_due ASC").bind(user.userId).all<OpenLoop>(),
    dueOpenLoop(user.userId),
    pendingConversationFollowUp(user.userId),
    pendingSituationAnalysis(user.userId),
  ]);
  const day = dayIndex(profile.created_at);
  const engagedDays = days.results.map((entry) => entry.day_index);
  const memoryCanBeShown = pendingPreAnalysis?.analysis_depth === "complex" && !pendingPreAnalysis.memory_dismissed
    && pendingPreAnalysis.stage === "chain_trigger";
  const contextualMemory = memoryCanBeShown
    ? await behavioralPatternById(user.userId, pendingPreAnalysis.memory_pattern_id)
    : null;
  return {
    profile,
    day,
    messages: messages.results.slice(-60),
    hasEarlierMessages: messages.results.length > 60,
    plans: plans.results,
    recap: buildRecap(plans.results, engagedDays, profile.created_at),
    engagedDays,
    continuity: buildTrainerContinuity(plans.results.filter(plan => !plan.paused), {
      day,
      startedAt: profile.created_at,
      safetyAllowsPractice: !profile.safety_flag,
      engagedDays,
    }),
    openLoops: loops.results,
    dueLoop: due,
    pendingFollowUp,
    pendingSituationAnalysis: pendingPreAnalysis,
    contextualMemory,
  };
}
async function event(
  profile: TrainerProfile,
  session: string,
  name: string,
  key: string,
  payload: PilotEventPayload = {},
) {
  const skillId = typeof payload.skill_id === "string" ? payload.skill_id : null;
  const createdAt = new Date().toISOString();
  await recordPilotEvent(getRawDb(), {
    id: `${profile.pseudonym}:${name}:${key}`,
    userId: profile.pseudonym,
    sessionId: session,
    trainerId: profile.trainer_id,
    dayIndex: dayIndex(profile.created_at),
    eventName: name,
    payload,
    skillCardVersion: skillId ? skillCardVersion(skillId) : null,
    createdAt,
  });
}
async function engage(profile: TrainerProfile, session: string) {
  const day = dayIndex(profile.created_at);
  await event(profile, session, "engaged_return", String(day));
  if ([2, 3, 7].includes(day)) await event(profile, session, `return_D${day}`, String(day));
  await getRawDb().prepare("UPDATE trainer_profiles SET last_interaction_at=? WHERE user_id=?").bind(new Date().toISOString(), profile.user_id).run();
}
async function message(profile: TrainerProfile, role: "user" | "assistant", text: string, id: string) {
  await getRawDb().prepare("INSERT OR IGNORE INTO trainer_messages (id,user_id,role,text,trainer_id,created_at) VALUES (?,?,?,?,?,?)").bind(id, profile.user_id, role, text, profile.trainer_id, new Date().toISOString()).run();
}

async function createRecommendedPlan(input: {
  user: ChatGPTUser;
  profile: TrainerProfile;
  sessionId: string;
  key: string;
  text: string;
  mode: "practice" | "stuck" | "distress";
  kind: "stuck" | "emotion" | "conflict" | "other";
  signal: "thought" | "body" | "emotion" | "urge";
  urge: "avoid" | "distract" | "attack" | "withdraw";
  intensity: number;
  interventionPoint?: InterventionPoint;
}) {
  const recommendation = await recommendSkill(input.user, {
    kind: input.kind,
    description: input.text,
    firstSignal: input.signal,
    actionUrge: input.urge,
    desiredDirection: input.mode === "distress" ? "stabilize" : "goal",
    importantGoal: input.profile.main_problem,
    intensity: input.intensity,
    risk: "no",
    interventionPoint: input.interventionPoint,
  });
  if (!recommendation.skill) return;
  const skill = recommendation.skill;
  const concreteAction = input.mode === "distress" ? null : concreteActionFromText(input.text);
  const plannedAction = concreteAction ?? skill.title;
  await getRawDb().prepare("INSERT INTO trainer_plans (id,user_id,situation_id,skill_json,skill_title,entry_mode,intensity_before,decision_reason_code,decision_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(input.key, input.user.userId, recommendation.situationId, JSON.stringify(skill), skill.title, input.mode, input.intensity, recommendation.reasonCode ?? "first_try", recommendation.decisionVersion ?? "outcome-policy-v2", new Date().toISOString()).run();
  const reply = concreteAction
    ? `Сейчас не будем решать всё целиком. Сделайте один первый шаг: «${concreteAction}». После реальной попытки напишите: «сделал», «частично» или «не сделал».`
    : `Сейчас — только один следующий шаг: практика «${skill.title}». Выполните короткое действие из карточки и после реальной попытки напишите: «сделал», «частично» или «не сделал».`;
  await message(input.profile, "assistant", reply, `${input.key}:reply`);
  await event(input.profile, input.sessionId, "skill_recommended", input.key, { skill_id: skill.id, decision_reason_code: recommendation.reasonCode ?? "first_try", decision_version: recommendation.decisionVersion ?? "outcome-policy-v2" });
  if (recommendation.analysis) await event(input.profile, input.sessionId, "mechanism_generated", input.key);
  const loop = await createOpenLoop({
    userId: input.user.userId,
    planId: input.key,
    topic: topicFromText(input.text),
    plannedAction,
    entryMode: input.mode,
    expectedHours: 24,
  });
  await event(input.profile, input.sessionId, "open_loop_created", loop.id, { loop_id: loop.id, entry_mode: input.mode });
}

const bodySchema = z.object({
  action: z.enum(["onboard", "settings", "open", "message", "situation", "confirmMemory", "dismissMemory", "start", "outcome", "reject", "resize", "replace", "recap", "feedback", "safeAgain", "quickStop", "performance", "newSituation", "pause", "resume", "performanceDetails"]),
  requestId: z.string().uuid(), sessionId: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(), trainerId: z.enum(["marsha", "beck", "skinny"]).optional(),
  addressForm: z.enum(["formal", "informal"]).optional(), grammaticalGender: z.enum(["neutral", "masculine", "feminine"]).optional(),
  interactionMode: z.enum(["support", "explore", "direct"]).optional(), text: z.string().trim().max(1200).optional(), consent: z.boolean().optional(),
  mode: z.enum(["practice", "stuck", "distress", "talk"]).optional(), kind: z.enum(["stuck", "emotion", "conflict", "other"]).optional(),
  risk: z.enum(["no", "yes", "unknown"]).optional(), intensity: z.number().int().min(0).max(10).optional(),
  signal: z.enum(["thought", "body", "emotion", "urge"]).optional(), urge: z.enum(["avoid", "distract", "attack", "withdraw"]).optional(),
  analysisDepth: z.enum(["simple", "complex", "direct"]).optional(),
  planId: z.string().uuid().optional(), result: z.enum(["done", "failed", "more", "partial"]).optional(),
  completedPart: z.string().trim().max(800).optional(),
  stoppingPoint: z.string().trim().max(800).optional(),
  analysisId: z.string().uuid().optional(),
  worsened: z.boolean().optional(),
  helpfulness: z.number().int().min(0).max(10).optional(), understood: z.number().int().min(0).max(10).optional(), continueIntent: z.number().int().min(0).max(10).optional(),
  helped: z.string().max(800).optional(), annoyed: z.string().max(800).optional(), recapDay: z.union([z.literal(3), z.literal(7)]).optional(),
}).strict();

export async function trainerCommand(user: ChatGPTUser, raw: unknown) {
  const body = bodySchema.parse(raw);
  await ensureUser(user);
  await ensureTrainerStorage();
  const db = getRawDb();
  const claim = await claimIdempotentRequest<TrainerState>(db, user.userId, body.requestId);
  if (claim.state === "cached") return claim.response;
  if (claim.state === "in_flight") throw new Error("Запрос ещё выполняется. Обновите данные через несколько секунд.");
  try {
    let profile = await profileFor(user.userId);
    if (body.action === "onboard") {
      if (!body.name || !body.trainerId || !body.text || body.text.length < 5 || !body.consent) throw new Error("Укажите имя, тренера, ситуацию и согласие.");
      if (!profile) {
        const now = new Date().toISOString();
        await db.prepare("INSERT OR IGNORE INTO trainer_profiles (user_id,pseudonym,name,trainer_id,main_problem,consent_version,created_at,last_interaction_at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(user.userId, crypto.randomUUID(), body.name, body.trainerId, body.text, PRODUCT_VERSION, now, now).run();
        profile = (await profileFor(user.userId))!;
        await completeOnboarding(user, { focus: "start", goal: body.text, practiceStyle: "short", supportMode: "solo", safetyAcknowledged: true });
        for (const name of ["onboarding_started", "trainer_viewed", "trainer_selected", "onboarding_completed"]) await event(profile, body.sessionId, name, "onboarding");
        await message(profile, "assistant", trainers[profile.trainer_id].greeting, `${body.requestId}:welcome`);
      }
    }
    if (!profile) throw new Error("Сначала познакомьтесь с тренером.");
    const key = body.requestId;
    if (body.action === "pause" || body.action === "resume") {
      const current = await trainerState(user);
      const plan = current.plans.find(item => item.id === body.planId);
      if (!plan || plan.result) throw new Error("Незавершённая практика не найдена.");
      if (profile.safety_flag) throw new Error("Сначала вернитесь к вопросу безопасности.");
      if (current.pendingFollowUp || current.pendingSituationAnalysis) throw new Error("Сначала завершите текущий разбор.");
      const now = new Date().toISOString();
      if (body.action === "pause" && !plan.paused) {
        await db.batch([
          db.prepare("INSERT INTO trainer_plan_pauses (plan_id,user_id,paused,loop_status,updated_at) VALUES (?,?,1,(SELECT status FROM open_loops WHERE plan_id=? AND user_id=? AND status IN ('active','answered') LIMIT 1),?) ON CONFLICT(plan_id) DO UPDATE SET paused=1,loop_status=excluded.loop_status,updated_at=excluded.updated_at").bind(plan.id,user.userId,plan.id,user.userId,now),
          db.prepare("UPDATE open_loops SET status='paused' WHERE plan_id=? AND user_id=? AND status IN ('active','answered')").bind(plan.id,user.userId),
        ]);
        await message(profile, "assistant", "Практика на паузе. Результат и польза не проставлены автоматически. Можно начать другую ситуацию или позже вернуться к этому шагу.", `${key}:pause`);
      }
      if (body.action === "resume" && plan.paused) {
        if (current.plans.some(item => !item.result && !item.paused && item.id !== plan.id)) throw new Error("Сначала завершите или поставьте на паузу текущую практику.");
        await db.batch([
          db.prepare("UPDATE open_loops SET status=COALESCE((SELECT loop_status FROM trainer_plan_pauses WHERE plan_id=? AND user_id=?),'active') WHERE plan_id=? AND user_id=? AND status='paused'").bind(plan.id,user.userId,plan.id,user.userId),
          db.prepare("UPDATE trainer_plan_pauses SET paused=0,updated_at=? WHERE plan_id=? AND user_id=?").bind(now,plan.id,user.userId),
        ]);
        await message(profile, "assistant", plan.reported_result ? "Вернулись к практике. Ответ о выполнении уже сохранён; осталось отдельно оценить пользу." : systemPrompt(profile, "resume"), `${key}:resume`);
      }
    }
    if (body.action === "newSituation") {
      const current = await trainerState(user);
      if (profile.safety_flag) throw new Error("Сначала вернитесь к вопросу безопасности.");
      if (current.plans.some(plan => !plan.result && !plan.paused) || current.pendingFollowUp) throw new Error("Сначала отметьте результат текущей практики или завершите его обсуждение. Новый разбор не заменяет этот ответ.");
      const analysis = current.pendingSituationAnalysis;
      if ((analysis?.id ?? undefined) !== body.analysisId) throw new Error("Текущий разбор изменился. Обновите данные перед началом новой ситуации.");
      if (analysis) await completeSituationAnalysis(analysis.id);
      await message(profile, "assistant", "Начинаем отдельную ситуацию. Что сейчас трудно? Предыдущий разбор оставлен без результата; его сообщения сохранены.", `${key}:new-situation`);
    }
    if (body.action === "settings") {
      if (body.addressForm !== undefined || body.grammaticalGender !== undefined) {
        await db.prepare("INSERT INTO trainer_communication_preferences (user_id,address_form,grammatical_gender,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET address_form=COALESCE(?,address_form),grammatical_gender=COALESCE(?,grammatical_gender),updated_at=excluded.updated_at")
          .bind(profile.user_id, body.addressForm ?? "formal", body.grammaticalGender ?? "neutral", new Date().toISOString(), body.addressForm ?? null, body.grammaticalGender ?? null).run();
      }
      await persistTrainerSettings({
        db,
        profile,
        trainerId: body.trainerId,
        interactionMode: body.interactionMode,
        sessionId: body.sessionId,
        requestId: key,
        dayIndex: dayIndex(profile.created_at),
      });
      profile = (await profileFor(user.userId))!;
    }
    if (body.action === "open") await event(profile, body.sessionId, "app_open", body.sessionId);
    if (body.action === "safeAgain") {
      if (body.risk !== "no") throw new Error("Подтвердите отсутствие текущей опасности.");
      await db.prepare("UPDATE trainer_profiles SET safety_flag=0 WHERE user_id=?").bind(user.userId).run();
      await event(profile, body.sessionId, "safety_check_completed", key);
    }
    if (body.action === "dismissMemory") {
      const analysis = await pendingSituationAnalysis(user.userId);
      if (analysis?.memory_pattern_id) {
        await dismissBehavioralMemory(user.userId, analysis.id);
        await event(profile, body.sessionId, "behavioral_memory_dismissed", analysis.id);
      }
    }
    if (body.action === "confirmMemory") {
      const analysis = await pendingSituationAnalysis(user.userId);
      const pattern = analysis ? await behavioralPatternById(user.userId, analysis.memory_pattern_id) : null;
      if (!analysis || !pattern || analysis.memory_dismissed) throw new Error("Подходящее воспоминание для этого разбора не найдено.");
      const reply = await applyBehavioralMemoryDraft(analysis, pattern);
      await message(profile, "assistant", reply, `${key}:reply`);
      await event(profile, body.sessionId, "behavioral_memory_confirmed", analysis.id);
    }
    if (body.action === "quickStop") {
      if (!body.text || body.text.length < 3 || body.intensity === undefined || !body.risk) throw new Error("Укажите свою ситуацию, интенсивность и безопасность.");
      const current = await trainerState(user);
      if (current.plans.some(plan => !plan.result && !plan.paused) || current.pendingFollowUp || current.pendingSituationAnalysis) throw new Error("Сначала вернитесь к текущей практике или разбору.");
      await message(profile, "user", body.text, `${key}:user`);
      await event(profile, body.sessionId, "message_sent", key);
      await engage(profile, body.sessionId);
      if (profile.safety_flag || requiresSafetyRoute(body.text, body.risk)) {
        await db.prepare("UPDATE trainer_profiles SET safety_flag=1 WHERE user_id=?").bind(user.userId).run();
        await message(profile, "assistant", safetyMessage, `${key}:reply`);
        await event(profile, body.sessionId, "safety_flow_used", key);
      } else {
        await event(profile, body.sessionId, "distress_flow_started", key);
        await event(profile, body.sessionId, "situation_submitted", key);
        // User chooses a pause; the existing engine may resize or replace STOP
        // based on actual past outcomes. No attempt exists until explicit start.
        await createRecommendedPlan({ user, profile, sessionId: body.sessionId, key,
          text: body.text, mode: "distress", kind: "emotion", signal: "emotion",
          urge: body.urge ?? "withdraw", intensity: body.intensity });
      }
    }
    if (body.action === "message" || body.action === "situation") {
      if (!body.text || body.text.length < 3) throw new Error("Расскажите чуть подробнее.");
      await message(profile, "user", body.text, `${key}:user`);
      await event(profile, body.sessionId, "message_sent", key);
      await engage(profile, body.sessionId);
      const pendingAnalysis = await pendingConversationFollowUp(user.userId);
      const pendingPreAnalysis = await pendingSituationAnalysis(user.userId);
      // PATCH 1.1: при входе приоритет отдаём due open loop — продолжение вчерашнего разговора.
      const due = await dueOpenLoop(user.userId);
      if (due) {
        if (!due.follow_up_shown_at) {
          await markFollowUpShown(due.id);
          await event(profile, body.sessionId, "follow_up_shown", due.id, { loop_id: due.id });
        }
        await markFollowUpAnswered(due.id);
        await event(profile, body.sessionId, "follow_up_answered", due.id, { loop_id: due.id });
      }
      await event(profile, body.sessionId, "conversation_started", key);
      const unsafe = profile.safety_flag || requiresSafetyRoute(body.text, body.action === "situation" ? body.risk ?? "unknown" : "no");
      if (unsafe) {
        await db.prepare("UPDATE trainer_profiles SET safety_flag=1 WHERE user_id=?").bind(user.userId).run();
        await message(profile, "assistant", safetyMessage, `${key}:reply`);
        await event(profile, body.sessionId, "safety_flow_used", key);
      } else if (pendingAnalysis) {
        const answer = body.text.trim();
        if (pendingAnalysis.kind === "success") {
          await saveSuccessFactor({ userId: user.userId, loopId: pendingAnalysis.loop_id, factor: answer });
          await event(profile, body.sessionId, "success_factor_identified", pendingAnalysis.id, { loop_id: pendingAnalysis.loop_id ?? pendingAnalysis.plan_id });
          await message(profile, "assistant", `Сохранил: «${answer}». В похожей ситуации я напомню об этом как о том, что уже помогало.`, `${key}:reply`);
        } else if (pendingAnalysis.kind === "worsened") {
          await saveInterventionMemory({ userId: user.userId, skillId: pendingAnalysis.skill_id, loopId: pendingAnalysis.loop_id, outcome: "worsened", rejectionReason: answer });
          await message(profile, "assistant", "Сохранил, что стало хуже. Эту практику сейчас не повторяем. Можно сделать паузу или обсудить другой способ со специалистом.", `${key}:reply`);
        } else if (pendingAnalysis.kind === "chain") {
          await saveInterventionMemory({ userId: user.userId, skillId: pendingAnalysis.skill_id, loopId: pendingAnalysis.loop_id, outcome: "partial", chainBreakPoint: answer });
          await event(profile, body.sessionId, "chain_analysis_completed", pendingAnalysis.id, { loop_id: pendingAnalysis.loop_id ?? pendingAnalysis.plan_id });
          await message(profile, "assistant", `${systemPrompt(profile, "stoppedPrefix")} «${answer}». В следующий раз продолжим с этого места, а не будем начинать разбор заново.`, `${key}:reply`);
        } else if (pendingAnalysis.kind === "missing_link") {
          await saveInterventionMemory({ userId: user.userId, skillId: pendingAnalysis.skill_id, loopId: pendingAnalysis.loop_id, outcome: "not_done", missingLink: answer });
          await event(profile, body.sessionId, "missing_link_completed", pendingAnalysis.id, { loop_id: pendingAnalysis.loop_id ?? pendingAnalysis.plan_id });
          await message(profile, "assistant", `Сохранил, что помешало: «${answer}». Сначала учту это, и только потом предложу следующий шаг.`, `${key}:reply`);
        } else {
          await saveInterventionMemory({ userId: user.userId, skillId: pendingAnalysis.skill_id, loopId: pendingAnalysis.loop_id, outcome: "skill_rejected", rejectionReason: answer });
          await message(profile, "assistant", `Спасибо, причина понятна: «${answer}». Этот шаг не буду защищать или повторять без нового основания.`, `${key}:reply`);
        }
        await completeConversationFollowUp(pendingAnalysis.id, answer);
      } else if (pendingPreAnalysis) {
        const answer = body.text.trim();
        const isConfirmationStage = pendingPreAnalysis.stage === "confirm" || pendingPreAnalysis.stage === "chain_confirm";
        if (pendingPreAnalysis.stage === "chain_choose") {
          const interventionPoint = parseInterventionPoint(answer);
          if (!interventionPoint) {
            await message(profile, "assistant", `Не смог однозначно определить точку. ${interventionPointPrompt}`, `${key}:reply`);
          } else {
            const signal = await saveInterventionPoint(pendingPreAnalysis, interventionPoint);
            await saveBehavioralPattern(pendingPreAnalysis, interventionPoint);
            await completeSituationAnalysis(pendingPreAnalysis.id);
            await event(profile, body.sessionId, "analysis_intervention_selected", pendingPreAnalysis.id, { intervention_point: interventionPoint });
            await createRecommendedPlan({
              user,
              profile,
              sessionId: body.sessionId,
              key,
              text: pendingPreAnalysis.original_text,
              mode: pendingPreAnalysis.mode,
              kind: pendingPreAnalysis.kind,
              signal,
              urge: pendingPreAnalysis.urge,
              intensity: pendingPreAnalysis.intensity,
              interventionPoint,
            });
          }
        } else if (isConfirmationStage && isHypothesisConfirmed(answer) && pendingPreAnalysis.analysis_depth === "complex") {
          await moveToInterventionChoice(pendingPreAnalysis.id);
          await event(profile, body.sessionId, "analysis_hypothesis_confirmed", pendingPreAnalysis.id);
          await message(profile, "assistant", interventionPointPrompt, `${key}:reply`);
        } else if (pendingPreAnalysis.stage === "chain_edit_choose") {
          const editField = parseChainEditField(answer);
          const reply = editField
            ? await chooseChainEditField(pendingPreAnalysis, editField)
            : `Не смог однозначно определить звено. ${chainEditPrompt}`;
          await message(profile, "assistant", reply, `${key}:reply`);
        } else if (isConfirmationStage && isHypothesisConfirmed(answer)) {
          await completeSituationAnalysis(pendingPreAnalysis.id);
          await event(profile, body.sessionId, "analysis_hypothesis_confirmed", pendingPreAnalysis.id);
          await createRecommendedPlan({
            user,
            profile,
            sessionId: body.sessionId,
            key,
            text: pendingPreAnalysis.original_text,
            mode: pendingPreAnalysis.mode,
            kind: pendingPreAnalysis.kind,
            signal: pendingPreAnalysis.signal,
            urge: pendingPreAnalysis.urge,
            intensity: pendingPreAnalysis.intensity,
          });
        } else if (isConfirmationStage && isBareRejection(answer)) {
          await requestSituationCorrection(pendingPreAnalysis);
          await message(profile, "assistant", pendingPreAnalysis.analysis_depth === "complex" ? `Хорошо. Можно исправлять звенья по одному, пока цепочка не станет точной. ${chainEditPrompt}` : systemPrompt(profile, "reviseHypothesis"), `${key}:reply`);
        } else if (pendingPreAnalysis.analysis_depth === "complex") {
          const sessionForStep = isConfirmationStage ? { ...pendingPreAnalysis, stage: "chain_correct" as const } : pendingPreAnalysis;
          const reply = await advanceComplexAnalysis(sessionForStep, answer, profile);
          if (sessionForStep.stage === "chain_consequences" || sessionForStep.stage === "chain_correct") {
            await event(profile, body.sessionId, "analysis_hypothesis_shown", pendingPreAnalysis.id);
          }
          await message(profile, "assistant", reply, `${key}:reply`);
        } else {
          const hypothesis = buildWorkingHypothesis(pendingPreAnalysis, answer);
          await saveSituationHypothesis(pendingPreAnalysis.id, answer, hypothesis);
          await event(profile, body.sessionId, "analysis_hypothesis_shown", pendingPreAnalysis.id);
          await message(profile, "assistant", hypothesis, `${key}:reply`);
        }
      } else if (body.action === "message") {
        await event(profile, body.sessionId, "free_talk_started", body.sessionId);
        await event(profile, body.sessionId, "chat_started", body.sessionId);
        const state = await trainerState(user);
        const pendingPlan = state.plans.find((plan) => !plan.result && !plan.paused);
        const attemptReport = pendingPlan ? classifyAttemptReport(body.text) : "unknown";
        if (pendingPlan && !pendingPlan.reported_result && attemptReport === "not_done") {
          const skill = JSON.parse(pendingPlan.skill_json) as SkillView;
          const loop = state.openLoops.find((item) => item.plan_id === pendingPlan.id) ?? await openLoopForPlan(pendingPlan.id);
          const loopId = loop?.id ?? pendingPlan.id;
          await db.prepare("UPDATE trainer_plans SET result='failed' WHERE id=? AND user_id=? AND result IS NULL").bind(pendingPlan.id, user.userId).run();
          await event(profile, body.sessionId, "outcome_not_done", loopId, { loop_id: loopId });
          await event(profile, body.sessionId, "missing_link_started", loopId, { loop_id: loopId });
          if (loop) await resolveOpenLoop(loop.id, "not_done");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "not_done" });
          await createConversationFollowUp({ userId: user.userId, planId: pendingPlan.id, loopId: loop?.id ?? null, skillId: skill.id, kind: "missing_link" });
          await message(profile, "assistant", missingLinkQuestion(body.text, profile), `${key}:reply`);
          const nextState = await trainerState(user);
          await cacheIdempotentResponse(db, user.userId, key, nextState);
          return nextState;
        }
        const ctx = await buildConversationContext({
          userId: user.userId, profile, messages: state.messages.slice(-8), plans: state.plans, engagedDays: state.engagedDays,
          situation: { mode: body.mode ?? "talk" },
        });
        const replyText = pendingPlan?.reported_result
          ? `${pendingPlan.reported_result === "partial" && pendingPlan.completed_part ? `Вы сообщили, что удалось: «${pendingPlan.completed_part}». ` : ""}${pendingPlan.reported_result === "partial" && pendingPlan.stopping_point ? `Остановились: «${pendingPlan.stopping_point}». ` : ""}Ответ о выполнении уже сохранён. В карточке можно отдельно оценить пользу или отметить, что стало хуже. Повторять практику для этого не нужно.`
          : due
          ? `Возвращаюсь к нашей договорённости: «${due.planned_action}». Как прошло — получилось, частично или не получилось?`
          : await freeTalk(profile, state.messages.slice(-8), buildOrchestratorInstructions(ctx));
        await message(profile, "assistant", replyText, `${key}:reply`);
      } else {
        const mode = body.mode === "practice" || body.mode === "distress" ? body.mode : "stuck";
        if (mode === "distress") await event(profile, body.sessionId, "distress_flow_started", key);
        await event(profile, body.sessionId, "situation_submitted", key);
        const situationInput = {
          user,
          profile,
          sessionId: body.sessionId,
          key,
          text: body.text,
          mode,
          kind: body.kind ?? (mode === "distress" ? "emotion" : "stuck"),
          signal: body.signal ?? "thought",
          urge: body.urge ?? "avoid",
          intensity: body.intensity ?? 5,
        } as const;
        const directAction = conversationIntent(body.text) === "direct_action_request";
        if (!directAction && (body.analysisDepth === "simple" || body.analysisDepth === "complex")) {
          const rememberedPattern = await relevantBehavioralPattern(user.userId, situationInput.kind, situationInput.urge);
          const analysis = await createSituationAnalysis({
            user_id: user.userId,
            analysis_depth: body.analysisDepth === "complex" ? "complex" : "simple",
            original_text: situationInput.text,
            kind: situationInput.kind,
            mode: situationInput.mode,
            signal: situationInput.signal,
            urge: situationInput.urge,
            intensity: situationInput.intensity,
            risk: "no",
            memoryPatternId: rememberedPattern?.id,
          });
          await event(profile, body.sessionId, "analysis_started", analysis.id);
          const firstQuestion = analysis.analysis_depth === "complex" ? complexAnalysisQuestion(analysis.stage, profile) : clarificationQuestion(analysis.kind, profile);
          await message(profile, "assistant", firstQuestion, `${key}:reply`);
        } else {
          await createRecommendedPlan(situationInput);
        }
      }
    }
    if (["start", "performance", "performanceDetails", "outcome", "reject", "resize", "replace"].includes(body.action)) {
      const plan = await db.prepare("SELECT * FROM trainer_plans WHERE id=? AND user_id=?").bind(body.planId ?? "", user.userId).first<TrainerPlan>();
      if (!plan) throw new Error("Практика не найдена.");
      if (profile.safety_flag) throw new Error("Сначала завершите проверку безопасности.");
      const pause = await db.prepare("SELECT paused FROM trainer_plan_pauses WHERE plan_id=? AND user_id=?").bind(plan.id,user.userId).first<{ paused: number }>();
      if (pause?.paused) throw new Error("Сначала вернитесь к практике с паузы.");
      const skill = JSON.parse(plan.skill_json) as SkillView;
      if (body.action === "start" && !plan.attempt_id && !plan.result) {
        const attempt = await startAttempt(user, { skillId: skill.id, situationId: plan.situation_id, mode: plan.entry_mode === "practice" ? "practice" : "help" });
        await db.prepare("UPDATE trainer_plans SET attempt_id=? WHERE id=? AND user_id=?").bind(attempt.attemptId, plan.id, user.userId).run();
        await event(profile, body.sessionId, "action_started", plan.id, { skill_id: skill.id });
        await engage(profile, body.sessionId);
      }
      if (body.action === "reject" && !plan.result) {
        const loop = await openLoopForPlan(plan.id);
        const loopId = loop?.id ?? plan.id;
        await db.prepare("UPDATE trainer_plans SET result='failed',helpfulness=0 WHERE id=? AND user_id=? AND result IS NULL").bind(plan.id, user.userId).run();
        await event(profile, body.sessionId, "skill_rejected", loopId, { loop_id: loopId, skill_id: skill.id });
        if (loop) await resolveOpenLoop(loop.id, "skill_rejected");
        await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "skill_rejected" });
        await createConversationFollowUp({ userId: user.userId, planId: plan.id, loopId: loop?.id ?? null, skillId: skill.id, kind: "rejection" });
        await message(profile, "assistant", systemPrompt(profile, "rejectPractice"), `${key}:reply`);
      }
      if (body.action === "performance" && !plan.result) {
        if (!plan.attempt_id || !body.result) throw new Error("Начните практику и укажите, что удалось сделать.");
        const previous = await db.prepare("SELECT reported_result FROM trainer_outcome_reports WHERE plan_id=? AND user_id=?").bind(plan.id, user.userId).first<{ reported_result: string }>();
        if (previous && previous.reported_result !== body.result) throw new Error("Результат уже сохранён. Перейдите к оценке пользы.");
        await db.prepare("INSERT OR IGNORE INTO trainer_outcome_reports (plan_id,user_id,reported_result,created_at) VALUES (?,?,?,?)").bind(plan.id, user.userId, body.result, new Date().toISOString()).run();
      }
      if (body.action === "performanceDetails") {
        const report = await db.prepare("SELECT reported_result FROM trainer_outcome_reports WHERE plan_id=? AND user_id=?").bind(plan.id,user.userId).first<{ reported_result: string }>();
        if (plan.result || report?.reported_result !== "partial") throw new Error("Эти уточнения доступны после ответа «Частично», до оценки пользы.");
        if (body.completedPart === undefined || body.stoppingPoint === undefined) throw new Error("Передайте оба поля уточнения; их можно оставить пустыми.");
        await db.prepare("INSERT INTO trainer_performance_details (plan_id,user_id,completed_part,stopping_point,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET completed_part=excluded.completed_part,stopping_point=excluded.stopping_point,updated_at=excluded.updated_at").bind(plan.id,user.userId,body.completedPart,body.stoppingPoint,new Date().toISOString()).run();
      }
      if (body.action === "outcome" && !plan.result) {
        const report = await db.prepare("SELECT reported_result FROM trainer_outcome_reports WHERE plan_id=? AND user_id=?").bind(plan.id, user.userId).first<{ reported_result: string }>();
        if (report && report.reported_result !== body.result) throw new Error("Оценка пользы должна относиться к сохранённому результату.");
        if (body.worsened && body.helpfulness !== 0) throw new Error("Для ответа «стало хуже» используется отдельная отметка без положительной оценки пользы.");

        if (!plan.attempt_id || !body.result || body.helpfulness === undefined || (plan.entry_mode === "distress" && body.intensity === undefined)) throw new Error("Начните практику и укажите результат.");
        await completeAttempt(user, {
          attemptId: plan.attempt_id,
          completed: body.result === "done" || body.result === "more",
          reliefDelta: plan.intensity_before - (body.intensity ?? plan.intensity_before),
          goalProgress: body.result === "more" ? 10 : body.result === "done" ? 5 : 0,
          helpfulness: body.helpfulness,
          avoidance: false,
          note: body.worsened ? "benefit:worsened" : undefined,
        });
        await db.prepare("UPDATE trainer_plans SET result=?,helpfulness=?,intensity_after=? WHERE id=? AND user_id=? AND result IS NULL").bind(body.result, body.helpfulness, body.intensity ?? null, plan.id, user.userId).run();
        await event(profile, body.sessionId, body.result === "failed" ? "action_failed" : "action_done", plan.id, { skill_id: skill.id, outcome: body.result });
        if (!body.worsened) await event(profile, body.sessionId, "helpfulness_rated", plan.id, { skill_id: skill.id, score: body.helpfulness });
        if (body.worsened) await db.prepare("INSERT INTO trainer_outcome_reports (plan_id,user_id,reported_result,worsened,created_at) VALUES (?,?,?,1,?) ON CONFLICT(plan_id) DO UPDATE SET worsened=1").bind(plan.id, user.userId, body.result, new Date().toISOString()).run();
        await event(profile, body.sessionId, "day_completed", String(dayIndex(profile.created_at)), { skill_id: skill.id });
        if (plan.entry_mode === "practice" && (body.result === "done" || body.result === "more")) await event(profile, body.sessionId, "training_completed", plan.id, { skill_id: skill.id });
        if (plan.entry_mode === "distress") await event(profile, body.sessionId, "distress_flow_completed", plan.id, { skill_id: skill.id, before: plan.intensity_before, after: body.intensity! });
        await engage(profile, body.sessionId);
        // PATCH 1.1: четыре ветки результата + закрытие open loop + персистентная память.
        const loop = await openLoopForPlan(plan.id);
        const loopId = loop?.id ?? plan.id;
        if (body.worsened) {
          const execution = body.result === "partial" ? "partial" : body.result === "failed" ? "not_done" : "done";
          if (loop) await resolveOpenLoop(loop.id, execution);
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: execution });
          await saveInterventionMemory({ userId: user.userId, skillId: skill.id, loopId: loop?.id ?? null, outcome: "worsened" });
          await createConversationFollowUp({ userId: user.userId, planId: plan.id, loopId: loop?.id ?? null, skillId: skill.id, kind: "worsened" });
          await message(profile, "assistant", systemPrompt(profile, "worsened"), `${key}:reply`);
        } else if (body.result === "done") {
          await event(profile, body.sessionId, "outcome_done", loopId, { loop_id: loopId });
          if (loop) await resolveOpenLoop(loop.id, "done");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "done" });
          await createConversationFollowUp({ userId: user.userId, planId: plan.id, loopId: loop?.id ?? null, skillId: skill.id, kind: "success" });
          await message(profile, "assistant", `${trainers[profile.trainer_id].success} Что помогло больше всего? Я сохраню это как полезный фактор.`, `${key}:reply`);
        } else if (body.result === "partial") {
          // PATCH 1.1: PARTIAL → точка остановки → Behavioral Chain Analysis.
          await event(profile, body.sessionId, "outcome_partial", loopId, { loop_id: loopId });
          await event(profile, body.sessionId, "chain_analysis_started", loopId, { loop_id: loopId });
          if (loop) await resolveOpenLoop(loop.id, "partial");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "partial" });
          await createConversationFollowUp({ userId: user.userId, planId: plan.id, loopId: loop?.id ?? null, skillId: skill.id, kind: "chain" });
          await message(profile, "assistant", systemPrompt(profile, "partial"), `${key}:reply`);
        } else if (body.result === "failed") {
          // PATCH 1.1: NOT_DONE → Missing Link Analysis без автозамены skill.
          await event(profile, body.sessionId, "outcome_not_done", loopId, { loop_id: loopId });
          await event(profile, body.sessionId, "missing_link_started", loopId, { loop_id: loopId });
          if (loop) await resolveOpenLoop(loop.id, "not_done");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "not_done" });
          await createConversationFollowUp({ userId: user.userId, planId: plan.id, loopId: loop?.id ?? null, skillId: skill.id, kind: "missing_link" });
          await message(profile, "assistant", `${trainers[profile.trainer_id].failure} Что произошло перед остановкой: не получилось начать, что-то отвлекло или шаг оказался слишком большим? Можно ответить своими словами.`, `${key}:reply`);
        } else {
          // more → трактуем как done с превышением плана
          await event(profile, body.sessionId, "outcome_done", loopId, { loop_id: loopId });
          if (loop) await resolveOpenLoop(loop.id, "done");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "done" });
          await message(profile, "assistant", trainers[profile.trainer_id].success, `${key}:reply`);
        }
      }
      if (body.action === "resize" || body.action === "replace") {
        if (plan.result !== "failed") throw new Error("Изменение предлагается после неудачной попытки.");
        let next = { ...skill, durationSeconds: Math.min(60, skill.durationSeconds), steps: skill.steps.slice(0, 1), description: "Только первый шаг. Можно остановиться после него." };
        if (body.action === "replace") {
          const dashboard = await loadDashboard(user);
          const candidates = dashboard.skills.filter(s => s.id !== skill.id && (plan.entry_mode === "distress" ? ["stop", "grounding-543"].includes(s.id) : s.track === skill.track));
          const alternative = candidates[0];
          if (!alternative) throw new Error("Сейчас нет подходящей безопасной замены. Можно уменьшить шаг.");
          next = { ...alternative, durationSeconds: Math.min(120, alternative.durationSeconds) };
        }
        const decisionReasonCode = body.action === "resize" ? "resize_after_failed" : "replace_low_fit";
        await db.prepare("INSERT INTO trainer_plans (id,user_id,situation_id,skill_json,skill_title,entry_mode,intensity_before,decision_reason_code,decision_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(key, user.userId, plan.situation_id, JSON.stringify(next), next.title, plan.entry_mode, plan.intensity_before, decisionReasonCode, "outcome-policy-v2", new Date().toISOString()).run();
        await event(profile, body.sessionId, body.action === "resize" ? "action_resized" : "action_replaced", key, { skill_id: next.id, decision_reason_code: decisionReasonCode, decision_version: "outcome-policy-v2" });
      }
    }
    if (body.action === "recap") {
      if (!body.recapDay || dayIndex(profile.created_at) < body.recapDay) throw new Error("Этот итог пока не доступен.");
      await event(profile, body.sessionId, `recap_${body.recapDay}d_viewed`, String(body.recapDay));
    }
    if (body.action === "feedback") {
      if (body.helpfulness === undefined || body.understood === undefined || body.continueIntent === undefined) throw new Error("Заполните три оценки.");
      await db.prepare("INSERT OR IGNORE INTO pilot_feedback (id,user_id,day_index,helpfulness,understood,continue_intent,helped,annoyed,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(key, profile.pseudonym, dayIndex(profile.created_at), body.helpfulness, body.understood, body.continueIntent, body.helped ?? "", body.annoyed ?? "", new Date().toISOString()).run();
      await event(profile, body.sessionId, "feedback_submitted", key, { helpfulness: body.helpfulness, understood: body.understood, continue_intent: body.continueIntent });
    }
    const state = await trainerState(user);
    await cacheIdempotentResponse(db, user.userId, key, state);
    return state;
  } catch (error) {
    // Keep the claim: partial mutations must never be replayed blindly.
    throw error;
  }
}

async function freeTalk(profile: TrainerProfile, messages: TrainerMessage[], instructionsOverride?: string): Promise<string> {
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  // SKILLER_AI_DISABLED имеет приоритет над env.* (тестовая изоляция от .env.local).
  const aiDisabled = processEnv?.SKILLER_AI_DISABLED === "1";
  return produceFreeTalkReply({
    profile,
    messages,
    apiKey: aiDisabled ? "" : (processEnv?.OPENAI_API_KEY || env.OPENAI_API_KEY || ""),
    model: processEnv?.OPENAI_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini",
    instructionsOverride,
  });
}
