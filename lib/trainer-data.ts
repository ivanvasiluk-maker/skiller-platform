import { env } from "cloudflare:workers";
import { z } from "zod";
import { getRawDb } from "@/db";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { ensureUser, recommendSkill, startAttempt, completeAttempt, completeOnboarding, loadDashboard, type SkillView } from "@/lib/skiller-data";
import { cacheIdempotentResponse, claimIdempotentRequest } from "@/lib/request-idempotency";
import { buildTrainerContinuity, type TrainerContinuity } from "@/lib/trainer-continuity";
import { produceFreeTalkReply } from "@/lib/free-talk";
import { ensureOpenLoopStorage, createOpenLoop, dueOpenLoop, markFollowUpShown, markFollowUpAnswered, resolveOpenLoop, openLoopForPlan, buildConversationContext, buildOrchestratorInstructions, topicFromText, activeOpenLoops, saveSuccessFactor, saveInterventionMemory, type OpenLoop } from "@/lib/conversation-orchestrator";
import { concreteActionFromText } from "@/lib/conversation-language";
import type { OutcomeReasonCode } from "@/lib/outcome-policy";
import { recordPilotEvent, type PilotEventPayload } from "@/lib/pilot-events";
import { skillCardVersion } from "@/lib/skill-card-versions";
import { persistTrainerSettings } from "@/lib/trainer-settings";
import { trainers, PRODUCT_VERSION, dayIndex, requiresSafetyRoute, safetyMessage, buildRecap, type TrainerId, type InteractionMode } from "@/lib/trainers";

export type TrainerProfile = { user_id: string; pseudonym: string; name: string; trainer_id: TrainerId; interaction_mode: InteractionMode; main_problem: string; consent_version: string; created_at: string; last_interaction_at: string; safety_flag: number };
export type TrainerMessage = { id: string; role: "user" | "assistant"; text: string; trainer_id: TrainerId; created_at: string };
export type TrainerPlan = { id: string; situation_id: string; skill_json: string; skill_title: string; entry_mode: string; intensity_before: number; intensity_after: number | null; attempt_id: string | null; result: "done" | "failed" | "more" | null; helpfulness: number | null; decision_reason_code: OutcomeReasonCode; decision_version: string; created_at: string };
export type TrainerState = { profile: TrainerProfile | null; day: number; messages: TrainerMessage[]; plans: TrainerPlan[]; recap: ReturnType<typeof buildRecap>; engagedDays: number[]; continuity: TrainerContinuity; openLoops: OpenLoop[]; dueLoop: OpenLoop | null };

const statements = [
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
  return getRawDb().prepare("SELECT * FROM trainer_profiles WHERE user_id=?").bind(userId).first<TrainerProfile>();
}
export async function trainerState(user: ChatGPTUser): Promise<TrainerState> {
  await ensureUser(user);
  await ensureTrainerStorage();
  await ensureOpenLoopStorage();
  const db = getRawDb();
  const profile = await profileFor(user.userId);
  if (!profile) return { profile: null, day: 1, messages: [], plans: [], recap: buildRecap([]), engagedDays: [], continuity: buildTrainerContinuity([]), openLoops: [], dueLoop: null };
  const [messages, plans, days, loops, due] = await Promise.all([
    db.prepare("SELECT * FROM (SELECT id,role,text,trainer_id,created_at FROM trainer_messages WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 60) ORDER BY created_at,id").bind(user.userId).all<TrainerMessage>(),
    db.prepare("SELECT * FROM trainer_plans WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100").bind(user.userId).all<TrainerPlan>(),
    db.prepare("SELECT DISTINCT day_index FROM pilot_events WHERE user_id=? AND event_name='engaged_return' ORDER BY day_index").bind(profile.pseudonym).all<{ day_index: number }>(),
    activeOpenLoops(user.userId),
    dueOpenLoop(user.userId),
  ]);
  const day = dayIndex(profile.created_at);
  const engagedDays = days.results.map((entry) => entry.day_index);
  return {
    profile,
    day,
    messages: messages.results,
    plans: plans.results,
    recap: buildRecap(plans.results, engagedDays, profile.created_at),
    engagedDays,
    continuity: buildTrainerContinuity(plans.results, {
      day,
      startedAt: profile.created_at,
      safetyAllowsPractice: !profile.safety_flag,
      engagedDays,
    }),
    openLoops: loops,
    dueLoop: due,
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

const bodySchema = z.object({
  action: z.enum(["onboard", "settings", "open", "message", "situation", "start", "outcome", "resize", "replace", "recap", "feedback", "safeAgain"]),
  requestId: z.string().uuid(), sessionId: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(), trainerId: z.enum(["marsha", "beck", "skinny"]).optional(),
  interactionMode: z.enum(["support", "explore", "direct"]).optional(), text: z.string().trim().max(1200).optional(), consent: z.boolean().optional(),
  mode: z.enum(["practice", "stuck", "distress", "talk"]).optional(), kind: z.enum(["stuck", "emotion", "conflict", "other"]).optional(),
  risk: z.enum(["no", "yes", "unknown"]).optional(), intensity: z.number().int().min(0).max(10).optional(),
  signal: z.enum(["thought", "body", "emotion", "urge"]).optional(), urge: z.enum(["avoid", "distract", "attack", "withdraw"]).optional(),
  planId: z.string().uuid().optional(), result: z.enum(["done", "failed", "more", "partial"]).optional(),
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
    if (body.action === "settings") {
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
    if (body.action === "message" || body.action === "situation") {
      if (!body.text || body.text.length < 3) throw new Error("Расскажите чуть подробнее.");
      await message(profile, "user", body.text, `${key}:user`);
      await event(profile, body.sessionId, "message_sent", key);
      await engage(profile, body.sessionId);
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
      } else if (body.action === "message") {
        await event(profile, body.sessionId, "free_talk_started", body.sessionId);
        await event(profile, body.sessionId, "chat_started", body.sessionId);
        const state = await trainerState(user);
        const ctx = await buildConversationContext({
          userId: user.userId, profile, messages: state.messages.slice(-8), plans: state.plans, engagedDays: state.engagedDays,
          situation: { mode: body.mode ?? "talk" },
        });
        const replyText = due
          ? `Возвращаюсь к нашей договорённости: «${due.planned_action}». Как прошло — получилось, частично или не получилось?`
          : await freeTalk(profile, state.messages.slice(-8), buildOrchestratorInstructions(ctx));
        await message(profile, "assistant", replyText, `${key}:reply`);
      } else {
        const mode = body.mode ?? "stuck";
        if (mode === "distress") await event(profile, body.sessionId, "distress_flow_started", key);
        const recommendation = await recommendSkill(user, {
          kind: body.kind ?? (mode === "distress" ? "emotion" : "stuck"), description: body.text,
          firstSignal: body.signal ?? "thought", actionUrge: body.urge ?? "avoid",
          desiredDirection: mode === "distress" ? "stabilize" : "goal", importantGoal: profile.main_problem,
          intensity: body.intensity ?? 5, risk: "no",
        });
        await event(profile, body.sessionId, "situation_submitted", key);
        if (recommendation.skill) {
          const skill = recommendation.skill;
          const concreteAction = mode === "distress" ? null : concreteActionFromText(body.text);
          const plannedAction = concreteAction ?? skill.title;
          await db.prepare("INSERT INTO trainer_plans (id,user_id,situation_id,skill_json,skill_title,entry_mode,intensity_before,decision_reason_code,decision_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
            .bind(key, user.userId, recommendation.situationId, JSON.stringify(skill), skill.title, mode, body.intensity ?? 5, recommendation.reasonCode ?? "first_try", recommendation.decisionVersion ?? "outcome-policy-v2", new Date().toISOString()).run();
          const reply = concreteAction
            ? `Давайте не будем решать всю задачу сразу. Первый шаг: «${concreteAction}». Напишите мне, когда попробуете.`
            : `${trainers[profile.trainer_id].greeting} Попробуем «${skill.title}».`;
          await message(profile, "assistant", reply, `${key}:reply`);
          await event(profile, body.sessionId, "skill_recommended", key, { skill_id: skill.id, decision_reason_code: recommendation.reasonCode ?? "first_try", decision_version: recommendation.decisionVersion ?? "outcome-policy-v2" });
          if (recommendation.analysis) await event(profile, body.sessionId, "mechanism_generated", key);
          // PATCH 1.1: сохраняем договорённость как open loop.
          const loop = await createOpenLoop({
            userId: user.userId,
            planId: key,
            topic: topicFromText(body.text),
            plannedAction,
            entryMode: mode,
            expectedHours: 24,
          });
          await event(profile, body.sessionId, "open_loop_created", loop.id, { loop_id: loop.id, entry_mode: mode });
        }
      }
    }
    if (["start", "outcome", "resize", "replace"].includes(body.action)) {
      const plan = await db.prepare("SELECT * FROM trainer_plans WHERE id=? AND user_id=?").bind(body.planId ?? "", user.userId).first<TrainerPlan>();
      if (!plan) throw new Error("Практика не найдена.");
      if (profile.safety_flag) throw new Error("Сначала завершите проверку безопасности.");
      const skill = JSON.parse(plan.skill_json) as SkillView;
      if (body.action === "start" && !plan.attempt_id && !plan.result) {
        const attempt = await startAttempt(user, { skillId: skill.id, situationId: plan.situation_id, mode: plan.entry_mode === "practice" ? "practice" : "help" });
        await db.prepare("UPDATE trainer_plans SET attempt_id=? WHERE id=? AND user_id=?").bind(attempt.attemptId, plan.id, user.userId).run();
        await event(profile, body.sessionId, "action_started", plan.id, { skill_id: skill.id });
        await engage(profile, body.sessionId);
      }
      if (body.action === "outcome" && !plan.result) {
        if (!plan.attempt_id || !body.result || body.helpfulness === undefined || (plan.entry_mode === "distress" && body.intensity === undefined)) throw new Error("Начните практику и укажите результат.");
        await completeAttempt(user, {
          attemptId: plan.attempt_id,
          completed: body.result !== "failed",
          reliefDelta: plan.intensity_before - (body.intensity ?? plan.intensity_before),
          goalProgress: body.result === "more" ? 10 : body.result === "done" ? 5 : 0,
          helpfulness: body.helpfulness,
          avoidance: false,
        });
        await db.prepare("UPDATE trainer_plans SET result=?,helpfulness=?,intensity_after=? WHERE id=? AND user_id=? AND result IS NULL").bind(body.result, body.helpfulness, body.intensity ?? null, plan.id, user.userId).run();
        await event(profile, body.sessionId, body.result === "failed" ? "action_failed" : "action_done", plan.id, { skill_id: skill.id, outcome: body.result });
        await event(profile, body.sessionId, "helpfulness_rated", plan.id, { skill_id: skill.id, score: body.helpfulness });
        await event(profile, body.sessionId, "day_completed", String(dayIndex(profile.created_at)), { skill_id: skill.id });
        if (plan.entry_mode === "practice" && body.result !== "failed") await event(profile, body.sessionId, "training_completed", plan.id, { skill_id: skill.id });
        if (plan.entry_mode === "distress") await event(profile, body.sessionId, "distress_flow_completed", plan.id, { skill_id: skill.id, before: plan.intensity_before, after: body.intensity! });
        await engage(profile, body.sessionId);
        // PATCH 1.1: четыре ветки результата + закрытие open loop + персистентная память.
        const loop = await openLoopForPlan(plan.id);
        const loopId = loop?.id ?? plan.id;
        if (body.result === "done") {
          await event(profile, body.sessionId, "outcome_done", loopId, { loop_id: loopId });
          await saveSuccessFactor({ userId: user.userId, loopId: loop?.id ?? null, factor: `«${skill.title}» сработал при «${loop?.topic ?? plan.skill_title}»` });
          await event(profile, body.sessionId, "success_factor_identified", loopId, { loop_id: loopId });
          if (loop) await resolveOpenLoop(loop.id, "done");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "done" });
          await message(profile, "assistant", `${trainers[profile.trainer_id].success} Что помогло больше всего? Я сохраню это как полезный фактор.`, `${key}:reply`);
        } else if (body.result === "partial") {
          // PATCH 1.1: PARTIAL → точка остановки → Behavioral Chain Analysis.
          await event(profile, body.sessionId, "outcome_partial", loopId, { loop_id: loopId });
          await event(profile, body.sessionId, "chain_analysis_started", loopId, { loop_id: loopId });
          await saveInterventionMemory({ userId: user.userId, skillId: skill.id, loopId: loop?.id ?? null, outcome: "partial", chainBreakPoint: "точка остановки уточняется" });
          if (loop) await resolveOpenLoop(loop.id, "partial");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "partial" });
          await message(profile, "assistant", "Частично — это уже результат. На каком моменте получилось остановиться? Посмотрим, что произошло прямо перед этим, и найдём подходящую точку продолжения.", `${key}:reply`);
          await event(profile, body.sessionId, "chain_analysis_completed", loopId, { loop_id: loopId });
        } else if (body.result === "failed") {
          // PATCH 1.1: NOT_DONE → Missing Link Analysis без автозамены skill.
          await event(profile, body.sessionId, "outcome_not_done", loopId, { loop_id: loopId });
          await event(profile, body.sessionId, "missing_link_started", loopId, { loop_id: loopId });
          await saveInterventionMemory({ userId: user.userId, skillId: skill.id, loopId: loop?.id ?? null, outcome: "not_done", missingLink: "разрыв цепочки уточняется" });
          if (loop) await resolveOpenLoop(loop.id, "not_done");
          await event(profile, body.sessionId, "open_loop_resolved", loopId, { loop_id: loopId, outcome: "not_done" });
          await message(profile, "assistant", `${trainers[profile.trainer_id].failure} Где именно прервалось действие: не получилось начать, что-то отвлекло или шаг оказался слишком большим? Сначала уточним это, затем выберем следующий шаг.`, `${key}:reply`);
          await event(profile, body.sessionId, "missing_link_completed", loopId, { loop_id: loopId });
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
