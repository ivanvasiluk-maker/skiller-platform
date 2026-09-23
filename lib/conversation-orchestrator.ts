// PATCH 1.1 — Conversational Relationship Layer.
// Персистентные open loops и Conversation Orchestrator поверх существующего
// Skill Engine / safety / fallback. Никакой замены доменного ядра: решения
// остаются у outcome-policy-v2 и requiresSafetyRoute; здесь — сбор контекста,
// приоритет follow-up и хранение договорённостей.

import { getRawDb } from "@/db";
import { trainers, dayIndex, type TrainerId, type InteractionMode } from "./trainers.ts";
import { buildTrainerContinuity, type TrainerContinuity, type ContinuityPlan } from "./trainer-continuity.ts";
import { buildFreeTalkInstructions, getCharacterBible } from "./character-bible.ts";
import type { OutcomeReasonCode } from "./outcome-policy.ts";
import { recentBehavioralPatterns } from "./conversation-analysis.ts";

export type OpenLoopStatus = "active" | "answered" | "resolved" | "expired";

export type OpenLoop = {
  id: string;
  user_id: string;
  plan_id: string | null;
  topic: string;
  planned_action: string;
  entry_mode: string;
  status: OpenLoopStatus;
  priority: number;
  created_at: string;
  expected_time: string | null;
  follow_up_due: string;
  follow_up_shown_at: string | null;
  answered_at: string | null;
  outcome: "done" | "partial" | "not_done" | "skill_rejected" | null;
  resolved_at: string | null;
};

export const OPEN_LOOP_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS open_loops (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    topic TEXT NOT NULL,
    planned_action TEXT NOT NULL,
    entry_mode TEXT NOT NULL DEFAULT 'stuck',
    status TEXT NOT NULL DEFAULT 'active',
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    expected_time TEXT,
    follow_up_due TEXT NOT NULL,
    follow_up_shown_at TEXT,
    answered_at TEXT,
    outcome TEXT,
    resolved_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS open_loops_user_status ON open_loops(user_id, status, follow_up_due)",
  "CREATE UNIQUE INDEX IF NOT EXISTS open_loops_plan_active ON open_loops(plan_id) WHERE status IN ('active','answered')",
];

// Источник схемы — drizzle/0007_open_loops.sql. Этот вызов лишь безопасно
// догоняет таблицу в средах, где миграции ещё не применены (локальные smoke,
// старые тестовые БД). В production схема идёт только через drizzle migrations.
export async function ensureOpenLoopStorage() {
  const db = getRawDb();
  await db.batch(OPEN_LOOP_STATEMENTS.map((s) => db.prepare(s)));
}

function nowIso() {
  return new Date().toISOString();
}

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// nowIso экспортируется для переиспользования в memory-функциях ниже.
export { nowIso as _nowIso };

/** Короткая тема договорённости из текста пользователя (без полного текста в аналитику). */
export function topicFromText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}…`;
}

/** Создать open loop из сохранённого плана. Идемпотентно по plan_id. */
export async function createOpenLoop(input: {
  userId: string;
  planId: string | null;
  topic: string;
  plannedAction: string;
  entryMode: string;
  expectedHours?: number;
  priority?: number;
}): Promise<OpenLoop> {
  await ensureOpenLoopStorage();
  const db = getRawDb();
  const existing = await db
    .prepare("SELECT * FROM open_loops WHERE plan_id=? AND status IN ('active','answered')")
    .bind(input.planId ?? "")
    .first<OpenLoop>();
  if (existing) return existing;
  const loop: OpenLoop = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    plan_id: input.planId,
    topic: input.topic,
    planned_action: input.plannedAction,
    entry_mode: input.entryMode,
    status: "active",
    priority: input.priority ?? 0,
    created_at: nowIso(),
    expected_time: plusHours(input.expectedHours ?? 24),
    follow_up_due: plusHours(input.expectedHours ?? 24),
    follow_up_shown_at: null,
    answered_at: null,
    outcome: null,
    resolved_at: null,
  };
  await db
    .prepare(
      "INSERT INTO open_loops (id,user_id,plan_id,topic,planned_action,entry_mode,status,priority,created_at,expected_time,follow_up_due) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      loop.id, loop.user_id, loop.plan_id, loop.topic, loop.planned_action,
      loop.entry_mode, loop.status, loop.priority, loop.created_at,
      loop.expected_time, loop.follow_up_due,
    )
    .run();
  return loop;
}

/** Активные и просроченные open loops пользователя, приоритет → срок. */
export async function activeOpenLoops(userId: string): Promise<OpenLoop[]> {
  await ensureOpenLoopStorage();
  const rows = await getRawDb()
    .prepare(
      "SELECT * FROM open_loops WHERE user_id=? AND status IN ('active','answered') ORDER BY priority DESC, follow_up_due ASC",
    )
    .bind(userId)
    .all<OpenLoop>();
  return rows.results;
}

/** Наиболее важный due loop (просроченный follow-up) или null. */
export async function dueOpenLoop(userId: string): Promise<OpenLoop | null> {
  const loops = await activeOpenLoops(userId);
  const now = nowIso();
  const due = loops.filter((l) => l.status === "active" && l.follow_up_due <= now);
  return due[0] ?? loops[0] ?? null;
}

export async function markFollowUpShown(loopId: string) {
  await ensureOpenLoopStorage();
  await getRawDb()
    .prepare("UPDATE open_loops SET follow_up_shown_at=? WHERE id=? AND follow_up_shown_at IS NULL")
    .bind(nowIso(), loopId)
    .run();
}

export async function markFollowUpAnswered(loopId: string) {
  await ensureOpenLoopStorage();
  await getRawDb()
    .prepare("UPDATE open_loops SET status='answered', answered_at=? WHERE id=? AND status='active'")
    .bind(nowIso(), loopId)
    .run();
}

export async function resolveOpenLoop(
  loopId: string,
  outcome: NonNullable<OpenLoop["outcome"]>,
) {
  await ensureOpenLoopStorage();
  await getRawDb()
    .prepare("UPDATE open_loops SET status='resolved', outcome=?, resolved_at=? WHERE id=?")
    .bind(outcome, nowIso(), loopId)
    .run();
}

export async function openLoopForPlan(planId: string): Promise<OpenLoop | null> {
  await ensureOpenLoopStorage();
  return (
    (await getRawDb()
      .prepare("SELECT * FROM open_loops WHERE plan_id=? ORDER BY created_at DESC LIMIT 1")
      .bind(planId)
      .first<OpenLoop>()) ?? null
  );
}

// ---------------------------------------------------------------------------
// PATCH 1.1 память: success factors + intervention memory (миграция 0008).
// ---------------------------------------------------------------------------

export type SuccessFactor = {
  id: string;
  user_id: string;
  loop_id: string | null;
  factor: string;
  created_at: string;
};

export type InterventionMemoryEntry = {
  id: string;
  user_id: string;
  skill_id: string;
  loop_id: string | null;
  outcome: string;
  rejection_reason: string;
  missing_link: string;
  chain_break_point: string;
  created_at: string;
};

export type ConversationFollowUpKind = "success" | "chain" | "missing_link" | "rejection";
export type ConversationFollowUp = {
  id: string;
  user_id: string;
  plan_id: string;
  loop_id: string | null;
  skill_id: string;
  kind: ConversationFollowUpKind;
  status: "pending" | "completed";
  answer: string;
  prompted_at: string;
  answered_at: string | null;
};

export const MEMORY_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS success_factors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    loop_id TEXT,
    factor TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS success_factors_user ON success_factors(user_id, created_at)",
  `CREATE TABLE IF NOT EXISTS intervention_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    loop_id TEXT,
    outcome TEXT NOT NULL,
    rejection_reason TEXT NOT NULL DEFAULT '',
    missing_link TEXT NOT NULL DEFAULT '',
    chain_break_point TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS intervention_memory_user_skill ON intervention_memory(user_id, skill_id, created_at)",
  `CREATE TABLE IF NOT EXISTS conversation_followups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    loop_id TEXT,
    skill_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    answer TEXT NOT NULL DEFAULT '',
    prompted_at TEXT NOT NULL,
    answered_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS conversation_followups_user_status ON conversation_followups(user_id, status, prompted_at)",
];

export async function ensureMemoryStorage() {
  const db = getRawDb();
  await db.batch(MEMORY_STATEMENTS.map((s) => db.prepare(s)));
}

export async function saveSuccessFactor(input: { userId: string; loopId: string | null; factor: string }) {
  await ensureMemoryStorage();
  const factor = input.factor.trim().slice(0, 300);
  if (!factor) return;
  await getRawDb()
    .prepare("INSERT INTO success_factors (id,user_id,loop_id,factor,created_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), input.userId, input.loopId, factor, nowIso())
    .run();
}

export async function listSuccessFactors(userId: string): Promise<string[]> {
  await ensureMemoryStorage();
  const rows = await getRawDb()
    .prepare("SELECT factor FROM success_factors WHERE user_id=? ORDER BY created_at DESC LIMIT 8")
    .bind(userId)
    .all<{ factor: string }>();
  return rows.results.map((r) => r.factor);
}

export async function saveInterventionMemory(input: {
  userId: string;
  skillId: string;
  loopId: string | null;
  outcome: string;
  rejectionReason?: string;
  missingLink?: string;
  chainBreakPoint?: string;
}) {
  await ensureMemoryStorage();
  await getRawDb()
    .prepare(
      "INSERT INTO intervention_memory (id,user_id,skill_id,loop_id,outcome,rejection_reason,missing_link,chain_break_point,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.skillId,
      input.loopId,
      input.outcome,
      (input.rejectionReason ?? "").trim().slice(0, 300),
      (input.missingLink ?? "").trim().slice(0, 300),
      (input.chainBreakPoint ?? "").trim().slice(0, 300),
      nowIso(),
    )
    .run();
}

export async function createConversationFollowUp(input: {
  userId: string;
  planId: string;
  loopId: string | null;
  skillId: string;
  kind: ConversationFollowUpKind;
}): Promise<ConversationFollowUp> {
  await ensureMemoryStorage();
  const existing = await getRawDb()
    .prepare("SELECT * FROM conversation_followups WHERE user_id=? AND status='pending' ORDER BY prompted_at DESC LIMIT 1")
    .bind(input.userId)
    .first<ConversationFollowUp>();
  if (existing) return existing;
  const followUp: ConversationFollowUp = {
    id: crypto.randomUUID(), user_id: input.userId, plan_id: input.planId,
    loop_id: input.loopId, skill_id: input.skillId, kind: input.kind,
    status: "pending", answer: "", prompted_at: nowIso(), answered_at: null,
  };
  await getRawDb().prepare(
    "INSERT INTO conversation_followups (id,user_id,plan_id,loop_id,skill_id,kind,status,answer,prompted_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).bind(
    followUp.id, followUp.user_id, followUp.plan_id, followUp.loop_id,
    followUp.skill_id, followUp.kind, followUp.status, followUp.answer,
    followUp.prompted_at,
  ).run();
  return followUp;
}

export async function pendingConversationFollowUp(userId: string): Promise<ConversationFollowUp | null> {
  await ensureMemoryStorage();
  return (await getRawDb()
    .prepare("SELECT * FROM conversation_followups WHERE user_id=? AND status='pending' ORDER BY prompted_at DESC LIMIT 1")
    .bind(userId)
    .first<ConversationFollowUp>()) ?? null;
}

export async function completeConversationFollowUp(id: string, answer: string) {
  await ensureMemoryStorage();
  await getRawDb().prepare(
    "UPDATE conversation_followups SET status='completed',answer=?,answered_at=? WHERE id=? AND status='pending'",
  ).bind(answer.trim().slice(0, 800), nowIso(), id).run();
}

/** Скиллы, которые пользователь отклонил / провалил — не предлагать повторно без нового основания. */
export async function rejectedSkillIds(userId: string): Promise<string[]> {
  await ensureMemoryStorage();
  const rows = await getRawDb()
    .prepare("SELECT DISTINCT skill_id FROM intervention_memory WHERE user_id=? AND outcome IN ('skill_rejected','not_done')")
    .bind(userId)
    .all<{ skill_id: string }>();
  return rows.results.map((r) => r.skill_id);
}

// ---------------------------------------------------------------------------
// Conversation Orchestrator (бриф §7): структурированный контекст перед ответом.
// ---------------------------------------------------------------------------

export type ConversationContext = {
  userProfile: { name: string; day: number; mainProblem: string } | null;
  trainer: { id: TrainerId; name: string; mode: InteractionMode };
  recentConversation: { role: "user" | "assistant"; text: string }[];
  activeOpenLoops: Pick<OpenLoop, "id" | "topic" | "planned_action" | "follow_up_due" | "priority">[];
  currentGoals: string[];
  behavioralMemory: { lastOutcome: TrainerContinuity["lastOutcome"]; engagedDays: number[]; patterns: { kind: string; urge: string; interventionPoint: string; occurrences: number }[] };
  interventionMemory: { resizeOrReplace: { kind: string; skillTitle: string; reasonCode: OutcomeReasonCode }[] };
  relevantSuccessFactors: string[];
  currentSituation: { mode: string; kind?: string; intensity?: number } | null;
  skillEngineResult: { skillId: string; reasonCode: string; decisionVersion: string } | null;
  safetyState: { safetyFlag: boolean; allowsPractice: boolean };
};

/** Собрать структурированный контекст из существующих источников истины. */
export async function buildConversationContext(input: {
  userId: string;
  profile: {
    name: string;
    trainer_id: TrainerId;
    interaction_mode: InteractionMode;
    main_problem: string;
    created_at: string;
    safety_flag: number;
  } | null;
  messages: { role: "user" | "assistant"; text: string }[];
  plans: ContinuityPlan[];
  engagedDays: number[];
  situation?: { mode: string; kind?: string; intensity?: number } | null;
  skillEngineResult?: { skillId: string; reasonCode: string; decisionVersion: string } | null;
}): Promise<ConversationContext> {
  const loops = input.profile ? await activeOpenLoops(input.userId) : [];
  const behavioralPatterns = input.profile ? await recentBehavioralPatterns(input.userId) : [];
  const continuity: TrainerContinuity = buildTrainerContinuity(input.plans, {
    day: input.profile ? dayIndex(input.profile.created_at) : 1,
    startedAt: input.profile?.created_at,
    safetyAllowsPractice: !input.profile?.safety_flag,
    engagedDays: input.engagedDays,
  });
  const resizeOrReplace = input.plans
    .filter((p) => p.decision_reason_code === "resize_after_failed" || p.decision_reason_code === "replace_low_fit")
    .slice(0, 5)
    .map((p) => ({
      kind: p.decision_reason_code === "resize_after_failed" ? "resize" : "replace",
      skillTitle: p.skill_title,
      reasonCode: p.decision_reason_code,
    }));
  return {
    userProfile: input.profile
      ? {
          name: input.profile.name,
          day: dayIndex(input.profile.created_at),
          mainProblem: input.profile.main_problem,
        }
      : null,
    trainer: {
      id: input.profile?.trainer_id ?? "marsha",
      name: trainers[input.profile?.trainer_id ?? "marsha"].name,
      mode: input.profile?.interaction_mode ?? "explore",
    },
    recentConversation: input.messages.slice(-8),
    activeOpenLoops: loops.map((l) => ({
      id: l.id,
      topic: l.topic,
      planned_action: l.planned_action,
      follow_up_due: l.follow_up_due,
      priority: l.priority,
    })),
    currentGoals: input.profile ? [input.profile.main_problem] : [],
    behavioralMemory: {
      lastOutcome: continuity.lastOutcome,
      engagedDays: input.engagedDays,
      patterns: behavioralPatterns.map((pattern) => ({
        kind: pattern.kind,
        urge: pattern.action_urge,
        interventionPoint: pattern.intervention_point,
        occurrences: Number(pattern.occurrence_count),
      })),
    },
    interventionMemory: { resizeOrReplace },
    relevantSuccessFactors: [],
    currentSituation: input.situation ?? null,
    skillEngineResult: input.skillEngineResult ?? null,
    safetyState: {
      safetyFlag: Boolean(input.profile?.safety_flag),
      allowsPractice: !input.profile?.safety_flag,
    },
  };
}

/** Текстовое представление контекста для системных инструкций LLM (без секретов, без лишнего текста). */
export function renderConversationContext(ctx: ConversationContext): string {
  const lines: string[] = [];
  if (ctx.userProfile) {
    lines.push(`USER PROFILE: ${ctx.userProfile.name}, день ${ctx.userProfile.day}, фокус: ${ctx.userProfile.mainProblem}.`);
  }
  lines.push(`TRAINER: ${ctx.trainer.name}, режим ${ctx.trainer.mode}.`);
  if (ctx.activeOpenLoops.length) {
    lines.push(
      `ACTIVE OPEN LOOPS: ${ctx.activeOpenLoops.map((l) => `«${l.topic}» → ${l.planned_action} (due ${l.follow_up_due})`).join("; ")}.`,
    );
  }
  if (ctx.currentGoals.length) lines.push(`CURRENT GOALS: ${ctx.currentGoals.join("; ")}.`);
  if (ctx.behavioralMemory.lastOutcome) {
    lines.push(
      `BEHAVIORAL MEMORY: последний результат ${ctx.behavioralMemory.lastOutcome.result} (польза ${ctx.behavioralMemory.lastOutcome.helpfulness ?? "—"}/10).`,
    );
  }
  if (ctx.behavioralMemory.patterns.length) {
    lines.push(
      `BEHAVIORAL PATTERNS: ${ctx.behavioralMemory.patterns.map((p) => `${p.kind}/${p.urge} → ${p.interventionPoint}, подтверждений: ${p.occurrences}`).join("; ")}. Это наблюдения, не диагнозы; перед использованием проверь их с пользователем.`,
    );
  }
  if (ctx.interventionMemory.resizeOrReplace.length) {
    lines.push(
      `INTERVENTION MEMORY: ${ctx.interventionMemory.resizeOrReplace.map((m) => `${m.kind} «${m.skillTitle}» (${m.reasonCode})`).join("; ")}.`,
    );
  }
  if (ctx.currentSituation) {
    lines.push(`CURRENT SITUATION: режим ${ctx.currentSituation.mode}${ctx.currentSituation.kind ? `, тип ${ctx.currentSituation.kind}` : ""}.`);
  }
  if (ctx.skillEngineResult) {
    lines.push(`SKILL ENGINE RESULT: ${ctx.skillEngineResult.skillId} по коду ${ctx.skillEngineResult.reasonCode} (${ctx.skillEngineResult.decisionVersion}).`);
  }
  lines.push(`SAFETY STATE: ${ctx.safetyState.allowsPractice ? "практика разрешена" : "safety-режим, практика приостановлена"}.`);
  return lines.join("\n");
}

/** Инструкции оркестратора = Bible-инструкции + структурированный контекст. */
export function buildOrchestratorInstructions(ctx: ConversationContext): string {
  const bible = getCharacterBible(ctx.trainer.id);
  const modeLabel = ctx.trainer.mode;
  return `${buildFreeTalkInstructions(bible, modeLabel)}\n\n${renderConversationContext(ctx)}`;
}
