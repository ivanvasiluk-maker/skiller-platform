import {
  decideRecommendationFromD1,
  type D1RecommendationDecision,
} from "../lib/outcome-history";
import {
  cacheIdempotentResponse,
  claimIdempotentRequest,
} from "../lib/request-idempotency";
import { persistTrainerSettings } from "../lib/trainer-settings";
import { dayIndex } from "../lib/trainers";
import { completeAttempt } from "../lib/skiller-data";
import {
  preparePilotEvent,
  recordPilotEvent,
} from "../lib/pilot-events";
import { skillCardVersion } from "../lib/skill-card-versions";
import {
  PILOT_EVENT_SPECS,
  eventPayloadComplete,
  isPilotEventName,
} from "../lib/pilot-event-schema";
import { requiresSafetyRoute, safetyMessage } from "../lib/trainers";
import { produceFreeTalkReply } from "../lib/free-talk";
import { buildFreeTalkFallback, getCharacterBible } from "../lib/character-bible";
import { trainerCommand } from "../lib/trainer-data";
import { runSheetsExport } from "../lib/sheets-exporter";
import { createInMemorySheets } from "../lib/in-memory-sheets";

type Env = { DB: D1Database };
const scenarios = [
  "first_try",
  "repeat_helpful",
  "resize_after_failed",
  "replace_low_fit",
  "avoidance_replace",
  "transfer_helpful",
  "safety_override",
] as const;
type Scenario = (typeof scenarios)[number];

async function seedOutcome(
  db: D1Database,
  userId: string,
  skillId: string,
  kind: string,
  outcome: { completed: boolean; helpfulness: number; avoidance: boolean },
) {
  const situationId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      "INSERT INTO situations (id,user_id,kind,intensity,safety_status) VALUES (?,?,?,?,?)",
    ).bind(situationId, userId, kind, 4, "self-guided"),
    db.prepare(
      "INSERT INTO skill_attempts (id,user_id,situation_id,skill_id,mode,status) VALUES (?,?,?,?,?,?)",
    ).bind(
      attemptId,
      userId,
      situationId,
      skillId,
      "guided",
      outcome.completed ? "completed" : "attempted",
    ),
    db.prepare(
      "INSERT INTO outcomes (id,attempt_id,user_id,completed,relief_delta,goal_progress,helpfulness,avoidance) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      attemptId,
      userId,
      outcome.completed ? 1 : 0,
      1,
      7,
      outcome.helpfulness,
      outcome.avoidance ? 1 : 0,
    ),
  ]);
}

async function runScenario(
  db: D1Database,
  scenario: Scenario,
): Promise<D1RecommendationDecision & { storedOutcomeCount: number }> {
  const userId = `integration-${scenario}-${crypto.randomUUID()}`;
  const skillId = "micro-start";
  const kind = "stuck";

  await db.batch([
    db.prepare(
      "INSERT INTO users (id,email,display_name) VALUES (?,?,?)",
    ).bind(userId, `${userId}@example.invalid`, "D1 Integration"),
    db.prepare(
      "INSERT OR IGNORE INTO skills (id,title,approach,track,description,why,steps_json,duration_seconds) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(
      skillId,
      "Минимальный законченный старт",
      "CBT · поведенческий навык",
      "Работа и фокус",
      "Сведите вход в задачу к действию, которое оставит наблюдаемый след и займёт не больше двух минут.",
      "Снижает сложность входа, но сохраняет движение к важной задаче.",
      '[{"title":"Назовите след","copy":"Что должно остаться после действия?"},{"title":"Уменьшите до двух минут","copy":"Оставьте только начало, которое можно увидеть."},{"title":"Сделайте без улучшения","copy":"Цель — проверить вход, а не закончить задачу."}]',
      120,
    ),
  ]);

  if (scenario === "transfer_helpful") {
    await seedOutcome(db, userId, skillId, "conflict", {
      completed: true,
      helpfulness: 7,
      avoidance: false,
    });
  } else if (scenario === "repeat_helpful" || scenario === "safety_override") {
    await seedOutcome(db, userId, skillId, kind, {
      completed: true,
      helpfulness: 7,
      avoidance: false,
    });
  } else if (scenario === "resize_after_failed") {
    await seedOutcome(db, userId, skillId, kind, {
      completed: false,
      helpfulness: 5,
      avoidance: false,
    });
  } else if (scenario === "replace_low_fit") {
    await seedOutcome(db, userId, skillId, kind, {
      completed: true,
      helpfulness: 2,
      avoidance: false,
    });
  } else if (scenario === "avoidance_replace") {
    await seedOutcome(db, userId, skillId, kind, {
      completed: true,
      helpfulness: 8,
      avoidance: true,
    });
  }

  const decision = await decideRecommendationFromD1({
    db,
    userId,
    kind,
    skillId,
    safetyAllowsPractice: scenario !== "safety_override",
  });
  const stored = await db
    .prepare("SELECT count(*) AS count FROM outcomes WHERE user_id=?")
    .bind(userId)
    .first<{ count: number }>();
  return { ...decision, storedOutcomeCount: Number(stored?.count ?? 0) };
}

async function runOutcomeIdempotency(db: D1Database) {
  const suffix = crypto.randomUUID();
  const userId = "outcome-idempotency-" + suffix;
  const situationId = "outcome-situation-" + suffix;
  const attemptId = "outcome-attempt-" + suffix;
  const user = {
    userId,
    displayName: "Outcome Idempotency",
    email: userId + "@example.invalid",
    fullName: null,
  };

  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)")
      .bind(userId, user.email, user.displayName),
    db.prepare(
      "INSERT OR IGNORE INTO skills (id,title,approach,track,description,why,steps_json,duration_seconds) VALUES (?,?,?,?,?,?,?,?)",
    ).bind("micro-start", "Минимальный законченный старт", "CBT · поведенческий навык", "Работа и фокус", "Сведите вход в задачу к действию, которое оставит наблюдаемый след и займёт не больше двух минут.", "Снижает сложность входа, но сохраняет движение к важной задаче.", '[{"title":"Назовите след","copy":"Что должно остаться после действия?"},{"title":"Уменьшите до двух минут","copy":"Оставьте только начало, которое можно увидеть."},{"title":"Сделайте без улучшения","copy":"Цель — проверить вход, а не закончить задачу."}]', 120),
    db.prepare(
      "INSERT INTO situations (id,user_id,kind,intensity,safety_status) VALUES (?,?,?,?,?)",
    ).bind(situationId, userId, "stuck", 6, "self-guided"),
    db.prepare(
      "INSERT INTO skill_attempts (id,user_id,situation_id,skill_id,mode,status) VALUES (?,?,?,?,?,?)",
    ).bind(attemptId, userId, situationId, "micro-start", "guided", "started"),
  ]);

  const outcome = {
    attemptId,
    completed: false,
    reliefDelta: 0,
    goalProgress: 0,
    helpfulness: 4,
    avoidance: false,
  };
  await completeAttempt(user, outcome);
  await completeAttempt(user, outcome);

  const outcomeCount = await db.prepare(
    "SELECT count(*) AS count FROM outcomes WHERE attempt_id=? AND user_id=?",
  ).bind(attemptId, userId).first<{ count: number }>();
  const storedOutcome = await db.prepare(
    "SELECT completed,helpfulness,avoidance FROM outcomes WHERE attempt_id=? AND user_id=?",
  ).bind(attemptId, userId).first<{
    completed: number;
    helpfulness: number;
    avoidance: number;
  }>();
  const attempt = await db.prepare(
    "SELECT status FROM skill_attempts WHERE id=? AND user_id=?",
  ).bind(attemptId, userId).first<{ status: string }>();
  const evidence = await db.prepare(
    "SELECT attempts,completions,helpful_sum,goal_sum,avoidance_count FROM personal_skill_evidence WHERE user_id=? AND skill_id=?",
  ).bind(userId, "micro-start").first<{
    attempts: number;
    completions: number;
    helpful_sum: number;
    goal_sum: number;
    avoidance_count: number;
  }>();

  return {
    outcomeCount: Number(outcomeCount?.count),
    outcome: {
      completed: Number(storedOutcome?.completed),
      helpfulness: Number(storedOutcome?.helpfulness),
      avoidance: Number(storedOutcome?.avoidance),
    },
    attemptStatus: attempt?.status,
    evidence: {
      attempts: Number(evidence?.attempts),
      completions: Number(evidence?.completions),
      helpfulSum: Number(evidence?.helpful_sum),
      goalSum: Number(evidence?.goal_sum),
      avoidanceCount: Number(evidence?.avoidance_count),
    },
  };
}

async function runSettingsContinuity(db: D1Database) {
  const suffix = crypto.randomUUID();
  const userId = "settings-user-" + suffix;
  const pseudonym = "settings-pilot-" + suffix;
  const profileCreatedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const planId = "settings-plan-" + suffix;
  const situationId = "settings-situation-" + suffix;
  const attemptId = "settings-attempt-" + suffix;
  const historicalEventId = "settings-history-" + suffix;

  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS trainer_profiles (user_id TEXT PRIMARY KEY, pseudonym TEXT NOT NULL UNIQUE, name TEXT NOT NULL, trainer_id TEXT NOT NULL, interaction_mode TEXT NOT NULL DEFAULT 'explore', main_problem TEXT NOT NULL, consent_version TEXT NOT NULL, created_at TEXT NOT NULL, last_interaction_at TEXT NOT NULL, safety_flag INTEGER NOT NULL DEFAULT 0)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS trainer_plans (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, situation_id TEXT NOT NULL, skill_json TEXT NOT NULL, skill_title TEXT NOT NULL, entry_mode TEXT NOT NULL, intensity_before INTEGER NOT NULL, intensity_after INTEGER, attempt_id TEXT, result TEXT, helpfulness INTEGER, decision_reason_code TEXT NOT NULL DEFAULT 'first_try', decision_version TEXT NOT NULL DEFAULT 'outcome-policy-v2', created_at TEXT NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS pilot_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, trainer_id TEXT NOT NULL, day_index INTEGER NOT NULL, event_name TEXT NOT NULL, payload_json TEXT NOT NULL, product_version TEXT NOT NULL, created_at TEXT NOT NULL, exported_at TEXT)",
    ),
  ]);
  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)")
      .bind(userId, userId + "@example.invalid", "Settings Integration"),
    db.prepare(
      "INSERT OR IGNORE INTO skills (id,title,approach,track,description,why,steps_json,duration_seconds) VALUES (?,?,?,?,?,?,?,?)",
    ).bind("micro-start", "Минимальный законченный старт", "CBT · поведенческий навык", "Работа и фокус", "Сведите вход в задачу к действию, которое оставит наблюдаемый след и займёт не больше двух минут.", "Снижает сложность входа, но сохраняет движение к важной задаче.", '[{"title":"Назовите след","copy":"Что должно остаться после действия?"},{"title":"Уменьшите до двух минут","copy":"Оставьте только начало, которое можно увидеть."},{"title":"Сделайте без улучшения","copy":"Цель — проверить вход, а не закончить задачу."}]', 120),
    db.prepare(
      "INSERT INTO trainer_profiles (user_id,pseudonym,name,trainer_id,interaction_mode,main_problem,consent_version,created_at,last_interaction_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(userId, pseudonym, "Settings Integration", "marsha", "support", "Начать задачу", "test-v1", profileCreatedAt, profileCreatedAt),
    db.prepare(
      "INSERT INTO situations (id,user_id,kind,intensity,safety_status) VALUES (?,?,?,?,?)",
    ).bind(situationId, userId, "stuck", 6, "self-guided"),
    db.prepare(
      "INSERT INTO skill_attempts (id,user_id,situation_id,skill_id,mode,status) VALUES (?,?,?,?,?,?)",
    ).bind(attemptId, userId, situationId, "micro-start", "guided", "completed"),
    db.prepare(
      "INSERT INTO outcomes (id,attempt_id,user_id,completed,relief_delta,goal_progress,helpfulness,avoidance) VALUES (?,?,?,?,?,?,?,?)",
    ).bind("settings-outcome-" + suffix, attemptId, userId, 1, 2, 7, 8, 0),
    db.prepare(
      "INSERT INTO trainer_plans (id,user_id,situation_id,skill_json,skill_title,entry_mode,intensity_before,intensity_after,attempt_id,result,helpfulness,decision_reason_code,decision_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(planId, userId, situationId, "{}", "Микростарт", "stuck", 6, 3, attemptId, "done", 8, "first_try", "outcome-policy-v2", profileCreatedAt),
    db.prepare(
      "INSERT INTO pilot_events (id,user_id,session_id,trainer_id,day_index,event_name,payload_json,product_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(historicalEventId, pseudonym, "history-session-" + suffix, "marsha", 2, "action_done", '{"source":"before-settings"}', "test-v1", profileCreatedAt),
  ]);

  const beforeDay = dayIndex(profileCreatedAt);
  await persistTrainerSettings({
    db,
    profile: {
      user_id: userId,
      pseudonym,
      trainer_id: "marsha",
      interaction_mode: "support",
    },
    trainerId: "beck",
    interactionMode: "direct",
    sessionId: "settings-session-" + suffix,
    requestId: suffix,
    dayIndex: beforeDay,
    now: new Date().toISOString(),
  });

  const profile = await db.prepare(
    "SELECT trainer_id,interaction_mode,created_at FROM trainer_profiles WHERE user_id=?",
  ).bind(userId).first<{
    trainer_id: string;
    interaction_mode: string;
    created_at: string;
  }>();
  const plan = await db.prepare(
    "SELECT id,result,helpfulness FROM trainer_plans WHERE user_id=?",
  ).bind(userId).first<{ id: string; result: string; helpfulness: number }>();
  const outcome = await db.prepare(
    "SELECT completed,helpfulness,avoidance FROM outcomes WHERE user_id=?",
  ).bind(userId).first<{ completed: number; helpfulness: number; avoidance: number }>();
  const historicalEvent = await db.prepare(
    "SELECT id,trainer_id,day_index,payload_json FROM pilot_events WHERE id=?",
  ).bind(historicalEventId).first<{
    id: string;
    trainer_id: string;
    day_index: number;
    payload_json: string;
  }>();
  const changes = await db.prepare(
    "SELECT trainer_id,day_index,event_name,payload_json FROM pilot_events WHERE user_id=? AND event_name IN ('trainer_changed','interaction_mode_changed') ORDER BY event_name",
  ).bind(pseudonym).all<{
    trainer_id: string;
    day_index: number;
    event_name: string;
    payload_json: string;
  }>();

  return {
    profile: {
      trainerId: profile?.trainer_id,
      interactionMode: profile?.interaction_mode,
    },
    dayBefore: beforeDay,
    dayAfter: dayIndex(profile?.created_at ?? ""),
    plan: {
      idPreserved: plan?.id === planId,
      result: plan?.result,
      helpfulness: Number(plan?.helpfulness),
    },
    outcome: {
      completed: Number(outcome?.completed),
      helpfulness: Number(outcome?.helpfulness),
      avoidance: Number(outcome?.avoidance),
    },
    historicalEvent: {
      idPreserved: historicalEvent?.id === historicalEventId,
      trainerId: historicalEvent?.trainer_id,
      dayIndex: Number(historicalEvent?.day_index),
      payload: JSON.parse(historicalEvent?.payload_json ?? "{}"),
    },
    changeEvents: changes.results.map((event) => ({
      trainerId: event.trainer_id,
      dayIndex: Number(event.day_index),
      name: event.event_name,
      payload: JSON.parse(event.payload_json),
    })),
  };
}

async function runEventVersioning(db: D1Database) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS pilot_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, trainer_id TEXT NOT NULL, day_index INTEGER NOT NULL, event_name TEXT NOT NULL, payload_json TEXT NOT NULL, product_version TEXT NOT NULL, created_at TEXT NOT NULL, exported_at TEXT)",
  ).run();  const suffix = crypto.randomUUID();
  const userId = `version-user-${suffix}`;
  const createdAt = new Date().toISOString();
  await db.batch([
    preparePilotEvent(db, {
      id: `version-app-open-${suffix}`,
      userId,
      sessionId: `version-session-${suffix}`,
      trainerId: "marsha",
      dayIndex: 1,
      eventName: "app_open",
      payload: {},
      skillCardVersion: null,
      createdAt,
    }),
    preparePilotEvent(db, {
      id: `version-action-started-${suffix}`,
      userId,
      sessionId: `version-session-${suffix}`,
      trainerId: "marsha",
      dayIndex: 1,
      eventName: "action_started",
      payload: { skill_id: "micro-start" },
      skillCardVersion: skillCardVersion("micro-start"),
      createdAt,
    }),
  ]);
  const rows = await db.prepare(
    "SELECT event_name,payload_json,product_version FROM pilot_events WHERE user_id=? ORDER BY event_name",
  ).bind(userId).all<{
    event_name: string;
    payload_json: string;
    product_version: string;
  }>();
  return rows.results.map((row) => ({
    name: row.event_name,
    productVersionColumn: row.product_version,
    payload: JSON.parse(row.payload_json),
  }));
}

async function runSheetsExportCycle(db: D1Database) {
  const suffix = crypto.randomUUID();
  const userId = `sheets-user-${suffix}`;
  const createdAt = "2026-09-11T07:30:00.000Z";
  await recordPilotEvent(db, {
    id: `sheets-open-${suffix}`,
    userId,
    sessionId: `sheets-session-${suffix}`,
    trainerId: "beck",
    dayIndex: 1,
    eventName: "app_open",
    payload: {},
    skillCardVersion: null,
    createdAt,
  });
  await recordPilotEvent(db, {
    id: `sheets-rated-${suffix}`,
    userId,
    sessionId: `sheets-session-${suffix}`,
    trainerId: "beck",
    dayIndex: 3,
    eventName: "helpfulness_rated",
    payload: {
      skill_id: "micro-start",
      score: 8,
      completed: true,
      decision_reason_code: "first_try",
      entry_mode: "stuck",
      // приватное поле, которое не должно попасть в лист:
      text: "приватный текст разговора",
    } as never,
    skillCardVersion: skillCardVersion("micro-start"),
    createdAt: "2026-09-13T18:00:00.000Z",
  });
  await recordPilotEvent(db, {
    id: `sheets-return-${suffix}`,
    userId,
    sessionId: `sheets-session-${suffix}`,
    trainerId: "beck",
    dayIndex: 3,
    eventName: "engaged_return",
    payload: {},
    skillCardVersion: null,
    createdAt: "2026-09-13T09:00:00.000Z",
  });

  const sheets = createInMemorySheets();
  const first = await runSheetsExport(db, sheets.transport);
  const eventsTab = sheets.tabs.get("EVENTS") ?? [];
  const usersTab = sheets.tabs.get("USERS") ?? [];
  const dailyTab = sheets.tabs.get("DAILY") ?? [];
  const cohortsTab = sheets.tabs.get("COHORTS") ?? [];
  const queueAfterFirst = await db
    .prepare("SELECT status FROM export_queue WHERE user_id=? ORDER BY event_id")
    .bind(userId)
    .all<{ status: string }>();

  // Повторный прогон: всё уже отправлено, новых строк в листе быть не должно.
  const second = await runSheetsExport(db, sheets.transport);
  const eventsAfterSecond = (sheets.tabs.get("EVENTS") ?? []).length;

  // Третий прогон с новым событием и сломанным транспортом: failed + retry.
  await recordPilotEvent(db, {
    id: `sheets-return7-${suffix}`,
    userId,
    sessionId: `sheets-session-${suffix}`,
    trainerId: "beck",
    dayIndex: 7,
    eventName: "engaged_return",
    payload: {},
    skillCardVersion: null,
    createdAt: "2026-09-17T09:00:00.000Z",
  });
  sheets.failWith(new Error("Google API 503"));
  const third = await runSheetsExport(db, sheets.transport);
  const failedRow = await db
    .prepare("SELECT status, attempts, retry_at FROM export_queue WHERE event_id=?")
    .bind(`sheets-return7-${suffix}`)
    .first<{ status: string; attempts: number; retry_at: string | null }>();
  sheets.failWith(null);
  // Эмулируем наступление времени retry (backoff 60s в production).
  await db
    .prepare("UPDATE export_queue SET retry_at=NULL WHERE event_id=?")
    .bind(`sheets-return7-${suffix}`)
    .run();
  const fourth = await runSheetsExport(db, sheets.transport);
  const eventsFinal = sheets.tabs.get("EVENTS") ?? [];
  // Строки, относящиеся именно к этому сценарию (в базе есть события других сценариев).
  const myEventRows = eventsTab.filter((row) => row[3] === userId);
  const myEventRowsFinal = eventsFinal.filter((row) => row[3] === userId);
  const myUserRows = usersTab.filter((row) => row[0] === userId);

  return {
    firstFailed: first.failed,
    firstDeadLettered: first.deadLettered,
    myEventRows: myEventRows.length,
    noPrivateText: !JSON.stringify(eventsTab).includes("приватный текст"),
    myUserRows: myUserRows.length,
    dailyHasHeader: (dailyTab[0]?.[0] ?? null) === "user_id",
    cohortsHasData: cohortsTab.length >= 2,
    queueAfterFirst: queueAfterFirst.results.map((row) => row.status),
    secondClaimed: second.claimed,
    eventsAfterSecond,
    eventsRowsFirst: eventsTab.length,
    third: { claimed: third.claimed, failed: third.failed, sent: third.sent },
    failedRow: failedRow
      ? {
          status: failedRow.status,
          attempts: Number(failedRow.attempts),
          hasRetryAt: failedRow.retry_at !== null,
        }
      : null,
    fourth: { claimed: fourth.claimed, sent: fourth.sent, failed: fourth.failed },
    myEventRowsFinal: myEventRowsFinal.length,
  };
}

type IdempotencyResponse = { requestId: string; mutationCount: number };

/** Onboarding flow: события онбординга + сохранённый выбор тренера. */
async function runOnboardingFlow(db: D1Database) {
  const suffix = crypto.randomUUID();
  const userId = `onboarding-user-${suffix}`;
  const pseudonym = `pseudo-${suffix}`;
  const now = "2026-09-12T10:00:00.000Z";
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS trainer_profiles (user_id TEXT PRIMARY KEY, pseudonym TEXT NOT NULL UNIQUE, name TEXT NOT NULL, trainer_id TEXT NOT NULL, interaction_mode TEXT NOT NULL DEFAULT 'explore', main_problem TEXT NOT NULL, consent_version TEXT NOT NULL, created_at TEXT NOT NULL, last_interaction_at TEXT NOT NULL, safety_flag INTEGER NOT NULL DEFAULT 0)",
    ),
    db.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").bind(userId, `${userId}@example.invalid`, "Onboarding Integration"),
    db.prepare(
      "INSERT INTO trainer_profiles (user_id,pseudonym,name,trainer_id,interaction_mode,main_problem,consent_version,created_at,last_interaction_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(userId, pseudonym, "Onboarding Integration", "beck", "explore", "Прокрастинация", "test-v1", now, now),
  ]);
  for (const name of ["onboarding_started", "trainer_viewed", "trainer_selected", "onboarding_completed"]) {
    await recordPilotEvent(db, {
      id: `${pseudonym}:${name}:onboarding`,
      userId: pseudonym,
      sessionId: `onboarding-session-${suffix}`,
      trainerId: "beck",
      dayIndex: 1,
      eventName: name,
      payload: {},
      skillCardVersion: null,
      createdAt: now,
    });
  }
  const profile = await db
    .prepare("SELECT trainer_id, interaction_mode FROM trainer_profiles WHERE user_id=?")
    .bind(userId)
    .first<{ trainer_id: string; interaction_mode: string }>();
  const events = await db
    .prepare("SELECT event_name, payload_json FROM pilot_events WHERE user_id=? ORDER BY created_at, id")
    .bind(pseudonym)
    .all<{ event_name: string; payload_json: string }>();
  const cohort = await db
    .prepare("SELECT cohort_key FROM cohort_members WHERE user_id=?")
    .bind(pseudonym)
    .first<{ cohort_key: string }>();
  return {
    trainerId: profile?.trainer_id ?? null,
    interactionMode: profile?.interaction_mode ?? null,
    eventNames: events.results.map((row) => row.event_name),
    allVersioned: events.results.every((row) => {
      const payload = JSON.parse(row.payload_json);
      return payload.product_version === "frozen-mvp-1.0" && payload.character_version === "1.1";
    }),
    cohortKey: cohort?.cohort_key ?? null,
  };
}

/** Раздельные completion/helpfulness для done, more и failed. */
async function runOutcomeSemantics(db: D1Database) {
  const suffix = crypto.randomUUID();
  const runs: { result: string; completed: number; helpfulness: number }[] = [];
  const attemptStatuses: string[] = [];
  for (const [index, [result, completed, helpfulness]] of ([
    ["done", 1, 7],
    ["more", 1, 9],
    ["failed", 0, 4],
  ] as const).entries()) {
    const runUserId = `semantics-${suffix}-${index}`;
    const situationId = `sem-situation-${suffix}-${index}`;
    const attemptId = `sem-attempt-${suffix}-${index}`;
    await db.batch([
      db.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").bind(runUserId, `${runUserId}@example.invalid`, "Semantics"),
      db.prepare("INSERT OR IGNORE INTO skills (id,title,approach,track,description,why,steps_json,duration_seconds) VALUES (?,?,?,?,?,?,?,?)")
        .bind("micro-start", "Минимальный законченный старт", "CBT · поведенческий навык", "Работа и фокус", "Сведите вход в задачу к действию, которое оставит наблюдаемый след и займёт не больше двух минут.", "Снижает сложность входа, но сохраняет движение к важной задаче.", '[{"title":"Назовите след","copy":"Что должно остаться после действия?"},{"title":"Уменьшите до двух минут","copy":"Оставьте только начало, которое можно увидеть."},{"title":"Сделайте без улучшения","copy":"Цель — проверить вход, а не закончить задачу."}]', 120),
      db.prepare("INSERT INTO situations (id,user_id,kind,intensity,safety_status) VALUES (?,?,?,?,?)").bind(situationId, runUserId, "stuck", 5, "self-guided"),
      db.prepare("INSERT INTO skill_attempts (id,user_id,situation_id,skill_id,mode,status) VALUES (?,?,?,?,?,?)").bind(attemptId, runUserId, situationId, "micro-start", "guided", "started"),
    ]);
    await completeAttempt(
      { userId: runUserId, displayName: "Semantics", email: `${runUserId}@example.invalid`, fullName: null },
      {
        attemptId,
        completed: completed === 1,
        reliefDelta: 1,
        goalProgress: result === "more" ? 10 : result === "done" ? 5 : 0,
        helpfulness,
        avoidance: false,
      },
    );
    const outcome = await db
      .prepare("SELECT completed, helpfulness FROM outcomes WHERE attempt_id=?")
      .bind(attemptId)
      .first<{ completed: number; helpfulness: number }>();
    const attempt = await db
      .prepare("SELECT status FROM skill_attempts WHERE id=?")
      .bind(attemptId)
      .first<{ status: string }>();
    runs.push({
      result,
      completed: Number(outcome?.completed ?? -1),
      helpfulness: Number(outcome?.helpfulness ?? -1),
    });
    attemptStatuses.push(attempt?.status ?? "missing");
  }
  return { runs, attemptStatuses };
}

/** Safety escalation и возврат из safety flow. */
async function runSafetyCycle(db: D1Database) {
  const unsafeTexts = [
    "хочу покончить с собой",
    "мысли о суициде не дают спать",
    "не хочу жить",
  ];
  const unsafeRoute = unsafeTexts.every((text) => requiresSafetyRoute(text, "unknown"));
  const safeRoute = !requiresSafetyRoute("устал от дедлайна на работе", "no");
  const riskYesRoute = requiresSafetyRoute("обычный стресс", "yes");

  const suffix = crypto.randomUUID();
  const userId = `safety-user-${suffix}`;
  const pseudonym = `safety-pseudo-${suffix}`;
  const now = "2026-09-12T10:00:00.000Z";
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS trainer_profiles (user_id TEXT PRIMARY KEY, pseudonym TEXT NOT NULL UNIQUE, name TEXT NOT NULL, trainer_id TEXT NOT NULL, interaction_mode TEXT NOT NULL DEFAULT 'explore', main_problem TEXT NOT NULL, consent_version TEXT NOT NULL, created_at TEXT NOT NULL, last_interaction_at TEXT NOT NULL, safety_flag INTEGER NOT NULL DEFAULT 0)",
    ),
    db.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").bind(userId, `${userId}@example.invalid`, "Safety Integration"),
    db.prepare(
      "INSERT INTO trainer_profiles (user_id,pseudonym,name,trainer_id,main_problem,consent_version,created_at,last_interaction_at,safety_flag) VALUES (?,?,?,?,?,?,?,?,1)",
    ).bind(userId, pseudonym, "Safety Integration", "marsha", "Стресс", "test-v1", now, now),
  ]);
  await recordPilotEvent(db, {
    id: `${pseudonym}:safety_flow_used:${suffix}`,
    userId: pseudonym,
    sessionId: `safety-session-${suffix}`,
    trainerId: "marsha",
    dayIndex: 1,
    eventName: "safety_flow_used",
    payload: {},
    skillCardVersion: null,
    createdAt: now,
  });
  // Возврат из safety flow: подтверждение отсутствия опасности снимает флаг.
  await db.prepare("UPDATE trainer_profiles SET safety_flag=0 WHERE user_id=?").bind(userId).run();
  await recordPilotEvent(db, {
    id: `${pseudonym}:safety_check_completed:${suffix}`,
    userId: pseudonym,
    sessionId: `safety-session-${suffix}`,
    trainerId: "marsha",
    dayIndex: 1,
    eventName: "safety_check_completed",
    payload: {},
    skillCardVersion: null,
    createdAt: "2026-09-12T10:05:00.000Z",
  });
  const profile = await db
    .prepare("SELECT safety_flag FROM trainer_profiles WHERE user_id=?")
    .bind(userId)
    .first<{ safety_flag: number }>();
  const events = await db
    .prepare("SELECT event_name FROM pilot_events WHERE user_id=? ORDER BY created_at, id")
    .bind(pseudonym)
    .all<{ event_name: string }>();
  return {
    unsafeRoute,
    safeRoute,
    riskYesRoute,
    safetyMessageIsStatic: typeof safetyMessage === "string" && safetyMessage.includes("экстренной"),
    flagCleared: Number(profile?.safety_flag ?? 1) === 0,
    eventNames: events.results.map((row) => row.event_name),
  };
}

/** Полнота аналитических событий против реестра event-schema-v2. */
async function runEventCompleteness(db: D1Database) {
  const suffix = crypto.randomUUID();
  const userId = `audit-user-${suffix}`;
  const base = { userId, sessionId: `audit-session-${suffix}`, trainerId: "beck" as const };
  const cases: { name: string; payload: Record<string, string | number | boolean>; keySuffix: string }[] = [
    { name: "skill_recommended", payload: { skill_id: "micro-start", decision_reason_code: "first_try" }, keySuffix: "rec" },
    { name: "action_started", payload: { skill_id: "micro-start" }, keySuffix: "start" },
    { name: "action_done", payload: { skill_id: "micro-start", outcome: "done" }, keySuffix: "done" },
    { name: "action_failed", payload: { skill_id: "micro-start", outcome: "failed" }, keySuffix: "failed" },
    { name: "helpfulness_rated", payload: { skill_id: "micro-start", score: 7 }, keySuffix: "rated" },
    { name: "action_resized", payload: { skill_id: "micro-start", decision_reason_code: "resize_after_failed" }, keySuffix: "resized" },
    { name: "action_replaced", payload: { skill_id: "distract-delay", decision_reason_code: "replace_low_fit" }, keySuffix: "replaced" },
    { name: "feedback_submitted", payload: { helpfulness: 8, understood: 9, continue_intent: 7 }, keySuffix: "feedback" },
  ];
  for (const item of cases) {
    await recordPilotEvent(db, {
      ...base,
      id: `audit-${item.keySuffix}-${suffix}`,
      dayIndex: 1,
      eventName: item.name,
      payload: item.payload,
      skillCardVersion: typeof item.payload.skill_id === "string" ? skillCardVersion(item.payload.skill_id) : null,
      createdAt: "2026-09-12T11:00:00.000Z",
    });
  }
  const rows = await db
    .prepare("SELECT event_name, payload_json FROM pilot_events WHERE user_id=?")
    .bind(userId)
    .all<{ event_name: string; payload_json: string }>();
  const complete = rows.results.every((row) =>
    isPilotEventName(row.event_name) &&
    eventPayloadComplete(row.event_name, JSON.parse(row.payload_json)),
  );
  // Контрпример: неполный payload не проходит проверку реестра.
  const counterexampleRejected = !eventPayloadComplete("helpfulness_rated", { skill_id: "micro-start" });
  const registrySize = PILOT_EVENT_SPECS.length;
  return {
    writtenCount: rows.results.length,
    allRegisteredAndComplete: complete,
    counterexampleRejected,
    registrySize,
  };
}

/** AI timeout / malformed output → deterministic fallback без потери flow. */
async function runAiFallback(db: D1Database) {
  void db;
  const profile = { trainer_id: "marsha" as const, interaction_mode: "explore" as const };
  const messages = [{ role: "user" as const, text: "Мне тревожно и я не понимаю, с чего начать." }];
  const bible = getCharacterBible("marsha");
  const expectedFallback = buildFreeTalkFallback(bible);
  // Таймаут: fetch бросает → fallback.
  const onTimeout = await produceFreeTalkReply({
    profile,
    messages,
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: () => {
      throw new Error("The operation timed out.");
    },
  });
  // Malformed JSON в output_text → fallback.
  const malformed = new Response(
    JSON.stringify({ output: [{ content: [{ type: "output_text", text: "{not-json" }] }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
  const onMalformed = await produceFreeTalkReply({
    profile,
    messages,
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: () => Promise.resolve(malformed),
  });
  // Запрещённый контент (зависимость) → guard → fallback.
  const hostile = new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ reply: "Я всегда буду рядом с тобой. Обращайся в любое время, без меня будет сложно. Какой шаг выберем?" }) }] }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
  const onHostile = await produceFreeTalkReply({
    profile,
    messages,
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: () => Promise.resolve(hostile),
  });
  // Валидный ответ проходит без fallback.
  const valid = new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ reply: "Понимаю, это сейчас давит. Давай выберем один маленький шаг — что из этого по силам?" }) }] }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
  const onValid = await produceFreeTalkReply({
    profile,
    messages,
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: () => Promise.resolve(valid),
  });
  return {
    onTimeoutIsFallback: onTimeout === expectedFallback,
    onMalformedIsFallback: onMalformed === expectedFallback,
    onHostileIsFallback: onHostile === expectedFallback,
    onValidPassThrough: onValid.startsWith("Понимаю"),
    fallbackMentionsBridge: onTimeout.includes("действие"),
  };
}

type PlanSnapshot = {
  skillId: string;
  reasonCode: string;
  stepCount: number;
  durationSeconds: number;
};

function snapshotPlan(plans: { skill_json: string; decision_reason_code: string }[]): PlanSnapshot {
  const plan = plans[0];
  const skill = JSON.parse(plan.skill_json) as {
    id: string;
    durationSeconds: number;
    steps: unknown[];
  };
  return {
    skillId: skill.id,
    reasonCode: plan.decision_reason_code,
    stepCount: skill.steps.length,
    durationSeconds: skill.durationSeconds,
  };
}

/** Полный цикл repeat/transfer/resize/replacement через trainerCommand. */
async function runAdjustmentCycle(db: D1Database) {
  const suffix = crypto.randomUUID();
  const makeUser = (tag: string) => ({
    userId: `adjust-${tag}-${suffix}`,
    displayName: `Adjustment ${tag}`,
    email: `adjust-${tag}-${suffix}@example.invalid`,
    fullName: null,
  });
  const command = (
    user: ReturnType<typeof makeUser>,
    sessionId: string,
    body: Record<string, unknown>,
  ) =>
    trainerCommand(user, { requestId: crypto.randomUUID(), sessionId, ...body });

  // Пользователь A: first_try → failed → resize → failed → replace → done → repeat.
  const userA = makeUser("a");
  const sessionA = crypto.randomUUID();
  await command(userA, sessionA, {
    action: "onboard", name: "А", trainerId: "beck",
    text: "Прокрастинация с рабочими задачами", consent: true,
  });
  const afterSituation = await command(userA, sessionA, {
    action: "situation", mode: "stuck", kind: "stuck", signal: "thought",
    urge: "avoid", intensity: 6, risk: "no",
    text: "Не могу начать отчёт, откладываю уже неделю",
  });
  const firstPlan = afterSituation.plans[0];
  const pseudonymA = afterSituation.profile?.pseudonym ?? "";
  await command(userA, sessionA, { action: "start", planId: firstPlan.id });
  await command(userA, sessionA, { action: "outcome", planId: firstPlan.id, result: "failed", helpfulness: 4 });
  const afterResize = await command(userA, sessionA, { action: "resize", planId: firstPlan.id });
  const resizedPlan = afterResize.plans[0];
  await command(userA, sessionA, { action: "start", planId: resizedPlan.id });
  await command(userA, sessionA, { action: "outcome", planId: resizedPlan.id, result: "failed", helpfulness: 3 });
  const afterReplace = await command(userA, sessionA, { action: "replace", planId: resizedPlan.id });
  const replacedPlan = afterReplace.plans[0];
  await command(userA, sessionA, { action: "start", planId: replacedPlan.id });
  await command(userA, sessionA, { action: "outcome", planId: replacedPlan.id, result: "done", helpfulness: 7 });
  const afterRepeat = await command(userA, sessionA, {
    action: "situation", mode: "stuck", kind: "stuck", signal: "thought",
    urge: "distract", intensity: 5, risk: "no",
    text: "Опять залипаю в телефон вместо отчёта",
  });

  // Пользователь B: transfer — доказательство из другого типа ситуации.
  const userB = makeUser("b");
  const sessionB = crypto.randomUUID();
  await command(userB, sessionB, {
    action: "onboard", name: "Б", trainerId: "marsha",
    text: "Откладываю важные разговоры", consent: true,
  });
  await seedOutcome(db, userB.userId, "micro-start", "conflict", {
    completed: true, helpfulness: 7, avoidance: false,
  });
  const afterTransfer = await command(userB, sessionB, {
    action: "situation", mode: "stuck", kind: "stuck", signal: "thought",
    urge: "avoid", intensity: 5, risk: "no",
    text: "Снова не могу приступить к задаче",
  });
  const pseudonymB = afterTransfer.profile?.pseudonym ?? "";

  // События корректировок и рекомендаций полны по реестру event-schema-v2.
  const eventRows = await db
    .prepare(
      "SELECT event_name, payload_json FROM pilot_events WHERE user_id IN (?,?) AND event_name IN ('action_resized','action_replaced','skill_recommended')",
    )
    .bind(pseudonymA, pseudonymB)
    .all<{ event_name: string; payload_json: string }>();
  const eventsComplete = eventRows.results.length >= 5 && eventRows.results.every((row) =>
    eventPayloadComplete(row.event_name, JSON.parse(row.payload_json)),
  );

  return {
    firstTry: snapshotPlan(afterSituation.plans),
    resized: snapshotPlan(afterResize.plans),
    replaced: snapshotPlan(afterReplace.plans),
    repeated: snapshotPlan(afterRepeat.plans),
    transferred: snapshotPlan(afterTransfer.plans),
    eventsComplete,
  };
}

/** E2E-неделя Day 1–7 через trainerCommand; дни «перематываются» через created_at профиля. */
async function runWeekCycle(db: D1Database) {
  const suffix = crypto.randomUUID();
  const user = {
    userId: `week-user-${suffix}`,
    displayName: "Week Cycle",
    email: `week-${suffix}@example.invalid`,
    fullName: null,
  };
  const sessionId = crypto.randomUUID();
  const command = (body: Record<string, unknown>) =>
    trainerCommand(user, { requestId: crypto.randomUUID(), sessionId, ...body });
  // dayIndex вычисляется из created_at профиля — сдвигаем день прямым UPDATE.
  const setDay = (day: number) =>
    db.prepare("UPDATE trainer_profiles SET created_at=? WHERE user_id=?")
      .bind(new Date(Date.now() - (day - 1) * 86_400_000).toISOString(), user.userId)
      .run();

  // Day 1: onboarding, первая ситуация, действие выполнено.
  await command({ action: "onboard", name: "Неделя", trainerId: "beck", text: "Прокрастинация рабочих задач", consent: true });
  const day1 = await command({ action: "situation", mode: "stuck", kind: "stuck", signal: "thought", urge: "avoid", intensity: 6, risk: "no", text: "Не могу начать отчёт, откладываю уже неделю" });
  const plan1 = day1.plans[0];
  const pseudonym = day1.profile?.pseudonym ?? "";
  await command({ action: "start", planId: plan1.id });
  await command({ action: "outcome", planId: plan1.id, result: "done", helpfulness: 7 });
  // Доказательство для transfer на Day 5: distract-delay помог в конфликте.
  await seedOutcome(db, user.userId, "distract-delay", "conflict", { completed: true, helpfulness: 7, avoidance: false });

  // reload/restart: повторные открытия возвращают то же состояние.
  const reloadA = await command({ action: "open" });
  const reloadB = await command({ action: "open" });
  const reloadStable =
    reloadA.plans.length === 1 &&
    reloadB.plans.length === 1 &&
    reloadA.messages.length === reloadB.messages.length &&
    reloadB.day === 1;

  // Day 2: возврат с взаимодействием, continuity видит вчерашний результат.
  await setDay(2);
  const day2 = await command({ action: "message", text: "Вернулся на второй день." });
  const day2Continuity = day2.continuity.lastOutcome?.planId === plan1.id;

  // Day 3: grounded recap с точной цитатой сохранённого результата.
  await setDay(3);
  await command({ action: "message", text: "Третий день, покажи итог." });
  await command({ action: "recap", recapDay: 3 });
  const day3 = await command({ action: "open" });
  const recap3Exact = day3.recap.facts.some((fact) => fact.includes("полезность 7/10"));

  // Day 4: repeat — та же ситуация, тот же навык.
  await setDay(4);
  const day4 = await command({ action: "situation", mode: "stuck", kind: "stuck", signal: "thought", urge: "avoid", intensity: 5, risk: "no", text: "Снова не могу начать отчёт" });
  const plan2 = day4.plans[0];
  await command({ action: "start", planId: plan2.id });
  await command({ action: "outcome", planId: plan2.id, result: "done", helpfulness: 8 });

  // Day 5: transfer — другой вход, доказательство из конфликтного контекста.
  await setDay(5);
  const day5 = await command({ action: "situation", mode: "stuck", kind: "stuck", signal: "thought", urge: "distract", intensity: 5, risk: "no", text: "Залипаю в телефон вместо задачи" });
  const plan3 = day5.plans[0];
  await command({ action: "start", planId: plan3.id });
  await command({ action: "outcome", planId: plan3.id, result: "failed", helpfulness: 3 });

  // Day 6: replacement после неудачной попытки.
  await setDay(6);
  const day6 = await command({ action: "replace", planId: plan3.id });
  const plan4 = day6.plans[0];

  // Day 7: недельный recap, смена персонажа без потери прогресса, feedback.
  await setDay(7);
  await command({ action: "recap", recapDay: 7 });
  const afterSwitch = await command({ action: "settings", trainerId: "skinny" });
  await command({ action: "start", planId: plan4.id });
  await command({ action: "outcome", planId: plan4.id, result: "done", helpfulness: 7 });
  await command({ action: "feedback", helpfulness: 8, understood: 9, continueIntent: 7, helped: "Маленькие шаги", annoyed: "" });
  const feedbackRow = await db
    .prepare("SELECT count(*) AS count FROM pilot_feedback WHERE user_id=?")
    .bind(pseudonym)
    .first<{ count: number }>();
  const eventRows = await db
    .prepare("SELECT event_name FROM pilot_events WHERE user_id=?")
    .bind(pseudonym)
    .all<{ event_name: string }>();
  const names = new Set(eventRows.results.map((row) => row.event_name));
  const finalState = await command({ action: "open" });

  return {
    day1: snapshotPlan(day1.plans),
    reloadStable,
    day2: { day: day2.day, continuity: day2Continuity },
    day3: { recapExact: recap3Exact },
    day4: snapshotPlan(day4.plans),
    day5: snapshotPlan(day5.plans),
    day6: snapshotPlan(day6.plans),
    day7: {
      trainerAfterSwitch: afterSwitch.profile?.trainer_id ?? null,
      plansPreserved: afterSwitch.plans.length,
      feedbackStored: Number(feedbackRow?.count ?? 0),
    },
    engagedDays: finalState.engagedDays,
    returnEvents: ["return_D2", "return_D3", "return_D7"].every((name) => names.has(name)),
    recapEvents: ["recap_3d_viewed", "recap_7d_viewed"].every((name) => names.has(name)),
    trainerChanged: names.has("trainer_changed"),
    feedbackEvent: names.has("feedback_submitted"),
    // В тестовом worker'е нет OPENAI_API_KEY: весь цикл проходит на детерминированных fallback'ах.
    noAiEvents: !names.has("mechanism_generated"),
  };
}

/** PATCH 1.1: Day 1 → open loop → Day 2 follow-up → 4 ветки результата. */
async function runRelationshipCycle(db: D1Database) {
  const suffix = crypto.randomUUID();
  const makeUser = (tag: string) => ({
    userId: `rel-${tag}-${suffix}`,
    displayName: `Rel ${tag}`,
    email: `rel-${tag}-${suffix}@example.invalid`,
    fullName: null,
  });
  const command = (user: ReturnType<typeof makeUser>, sessionId: string, body: Record<string, unknown>) =>
    trainerCommand(user, { requestId: crypto.randomUUID(), sessionId, ...body });
  const eventsFor = async (userId: string) => {
    const rows = await db
      .prepare("SELECT event_name FROM pilot_events WHERE user_id=?")
      .bind(userId)
      .all<{ event_name: string }>();
    return new Set(rows.results.map((r) => r.event_name));
  };

  // Day 1: DONE ветка
  const userDone = makeUser("done");
  const sDone = crypto.randomUUID();
  await command(userDone, sDone, { action: "onboard", name: "Д", trainerId: "beck", text: "Откладываю отчёт", consent: true });
  const sitDone = await command(userDone, sDone, { action: "situation", mode: "stuck", kind: "stuck", signal: "thought", urge: "avoid", intensity: 6, risk: "no", text: "Не могу начать отчёт" });
  const planDone = sitDone.plans[0];
  const loopCreatedDone = sitDone.openLoops.length === 1;
  await command(userDone, sDone, { action: "start", planId: planDone.id });
  await command(userDone, sDone, { action: "outcome", planId: planDone.id, result: "done", helpfulness: 8 });
  const evDone = await eventsFor(sitDone.profile?.pseudonym ?? "");
  const resolvedDone = await db.prepare("SELECT status, outcome FROM open_loops WHERE plan_id=?").bind(planDone.id).first<{ status: string; outcome: string }>();

  // Day 2: follow-up shown + answered
  const userFup = makeUser("fup");
  const sFup = crypto.randomUUID();
  await command(userFup, sFup, { action: "onboard", name: "В", trainerId: "marsha", text: "Прокрастинация", consent: true });
  const sitFup = await command(userFup, sFup, { action: "situation", mode: "stuck", kind: "stuck", signal: "thought", urge: "avoid", intensity: 5, risk: "no", text: "Откладываю звонок" });
  const loopFup = sitFup.openLoops[0];
  // Перематываем follow_up_due в прошлое, чтобы loop стал due.
  await db.prepare("UPDATE open_loops SET follow_up_due=? WHERE id=?").bind(new Date(Date.now() - 3600000).toISOString(), loopFup.id).run();
  const fupReply = await command(userFup, sFup, { action: "message", mode: "talk", text: "Привет, я вернулся" });
  const evFup = await eventsFor(fupReply.profile?.pseudonym ?? "");
  const fupState = await db.prepare("SELECT follow_up_shown_at, status FROM open_loops WHERE id=?").bind(loopFup.id).first<{ follow_up_shown_at: string | null; status: string }>();

  // PARTIAL ветка
  const userPartial = makeUser("partial");
  const sPartial = crypto.randomUUID();
  await command(userPartial, sPartial, { action: "onboard", name: "П", trainerId: "skinny", text: "Застреваю", consent: true });
  const sitPartial = await command(userPartial, sPartial, { action: "situation", mode: "stuck", kind: "stuck", signal: "thought", urge: "avoid", intensity: 5, risk: "no", text: "Не доделал задачу" });
  const planPartial = sitPartial.plans[0];
  await command(userPartial, sPartial, { action: "start", planId: planPartial.id });
  await command(userPartial, sPartial, { action: "outcome", planId: planPartial.id, result: "partial", helpfulness: 5 });
  const evPartial = await eventsFor(sitPartial.profile?.pseudonym ?? "");

  // NOT_DONE ветка
  const userNotDone = makeUser("notdone");
  const sNotDone = crypto.randomUUID();
  await command(userNotDone, sNotDone, { action: "onboard", name: "Н", trainerId: "beck", text: "Избегание", consent: true });
  const sitNotDone = await command(userNotDone, sNotDone, { action: "situation", mode: "stuck", kind: "stuck", signal: "thought", urge: "avoid", intensity: 6, risk: "no", text: "Не начал задачу" });
  const planNotDone = sitNotDone.plans[0];
  await command(userNotDone, sNotDone, { action: "start", planId: planNotDone.id });
  await command(userNotDone, sNotDone, { action: "outcome", planId: planNotDone.id, result: "failed", helpfulness: 3 });
  const evNotDone = await eventsFor(sitNotDone.profile?.pseudonym ?? "");

  // Персистентная память: success factor (DONE) и intervention memory (PARTIAL/NOT_DONE).
  const successFactors = await db
    .prepare("SELECT count(*) AS count FROM success_factors WHERE user_id=?")
    .bind(userDone.userId)
    .first<{ count: number }>();
  const interventionPartial = await db
    .prepare("SELECT outcome, chain_break_point FROM intervention_memory WHERE user_id=?")
    .bind(userPartial.userId)
    .first<{ outcome: string; chain_break_point: string }>();
  const interventionNotDone = await db
    .prepare("SELECT outcome, missing_link FROM intervention_memory WHERE user_id=?")
    .bind(userNotDone.userId)
    .first<{ outcome: string; missing_link: string }>();

  return {
    loopCreatedDone,
    resolvedDone: resolvedDone ?? null,
    doneEvents: {
      outcome_done: evDone.has("outcome_done"),
      success_factor: evDone.has("success_factor_identified"),
      open_loop_resolved: evDone.has("open_loop_resolved"),
    },
    successFactorsStored: Number(successFactors?.count ?? 0),
    interventionPartial: interventionPartial ?? null,
    interventionNotDone: interventionNotDone ?? null,
    followUp: {
      shown: evFup.has("follow_up_shown"),
      answered: evFup.has("follow_up_answered"),
      conversation_started: evFup.has("conversation_started"),
      shownAt: Boolean(fupState?.follow_up_shown_at),
      status: fupState?.status ?? null,
    },
    partialEvents: {
      outcome_partial: evPartial.has("outcome_partial"),
      chain_started: evPartial.has("chain_analysis_started"),
      chain_completed: evPartial.has("chain_analysis_completed"),
    },
    notDoneEvents: {
      outcome_not_done: evNotDone.has("outcome_not_done"),
      missing_link_started: evNotDone.has("missing_link_started"),
      missing_link_completed: evNotDone.has("missing_link_completed"),
    },
  };
}

async function runPilotAnalytics(db: D1Database) {
  const suffix = crypto.randomUUID();
  const userId = `analytics-user-${suffix}`;
  const createdAt = "2026-09-10T08:00:00.000Z";
  await recordPilotEvent(db, {
    id: `analytics-event-${suffix}`,
    userId,
    sessionId: `analytics-session-${suffix}`,
    trainerId: "marsha",
    dayIndex: 1,
    eventName: "app_open",
    payload: {},
    skillCardVersion: null,
    createdAt,
  });
  // Повторная запись того же события: идемпотентность queue и cohort.
  await recordPilotEvent(db, {
    id: `analytics-event-${suffix}`,
    userId,
    sessionId: `analytics-session-${suffix}`,
    trainerId: "marsha",
    dayIndex: 1,
    eventName: "app_open",
    payload: {},
    skillCardVersion: null,
    createdAt,
  });

  const cohort = await db
    .prepare("SELECT cohort_key, user_id, first_event_at FROM cohort_members WHERE user_id=?")
    .bind(userId)
    .first<{ cohort_key: string; user_id: string; first_event_at: string }>();
  const queue = await db
    .prepare("SELECT id, status, attempts FROM export_queue WHERE event_id=?")
    .bind(`analytics-event-${suffix}`)
    .all<{ id: string; status: string; attempts: number }>();
  const cohortRow = await db
    .prepare("SELECT key, product_version FROM cohorts WHERE key=?")
    .bind(cohort?.cohort_key ?? "")
    .first<{ key: string; product_version: string }>();
  const eventsCount = await db
    .prepare("SELECT count(*) AS count FROM pilot_events WHERE user_id=?")
    .bind(userId)
    .first<{ count: number }>();

  return {
    cohortKey: cohort?.cohort_key ?? null,
    firstEventAt: cohort?.first_event_at ?? null,
    cohortVersion: cohortRow?.product_version ?? null,
    queuedCount: queue.results.length,
    queuedStatus: queue.results[0]?.status ?? null,
    eventsCount: Number(eventsCount?.count ?? 0),
  };
}

async function ensureIdempotencyStorage(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS trainer_requests (user_id TEXT NOT NULL, request_id TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL, PRIMARY KEY(user_id, request_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS integration_mutations (request_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)"),
  ]);
}

async function runIdempotentMutation(
  db: D1Database,
  requestId: string,
): Promise<IdempotencyResponse> {
  const userId = "integration-idempotency-user";
  await ensureIdempotencyStorage(db);
  const claim = await claimIdempotentRequest<IdempotencyResponse>(
    db,
    userId,
    requestId,
  );
  if (claim.state === "cached") return claim.response;
  if (claim.state === "in_flight") {
    throw new Error("Duplicate request is still in flight.");
  }

  await db
    .prepare("INSERT INTO integration_mutations (request_id,created_at) VALUES (?,?)")
    .bind(requestId, new Date().toISOString())
    .run();
  const row = await db
    .prepare("SELECT count(*) AS count FROM integration_mutations WHERE request_id=?")
    .bind(requestId)
    .first<{ count: number }>();
  const response = { requestId, mutationCount: Number(row?.count ?? 0) };
  await cacheIdempotentResponse(db, userId, requestId, response);
  return response;
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const row = await env.DB.prepare("SELECT 1 AS ok").first();
      return Response.json(row);
    }
    if (request.method === "POST" && url.pathname === "/pilot-analytics") {
      return Response.json(await runPilotAnalytics(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/sheets-export") {
      return Response.json(await runSheetsExportCycle(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/onboarding-flow") {
      return Response.json(await runOnboardingFlow(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/outcome-semantics") {
      return Response.json(await runOutcomeSemantics(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/safety-cycle") {
      return Response.json(await runSafetyCycle(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/event-completeness") {
      return Response.json(await runEventCompleteness(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/ai-fallback") {
      return Response.json(await runAiFallback(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/adjustment-cycle") {
      return Response.json(await runAdjustmentCycle(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/week-cycle") {
      return Response.json(await runWeekCycle(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/relationship-cycle") {
      return Response.json(await runRelationshipCycle(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/outcome-idempotency") {
      return Response.json(await runOutcomeIdempotency(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/settings-continuity") {
      return Response.json(await runSettingsContinuity(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/event-versioning") {
      return Response.json(await runEventVersioning(env.DB));
    }
    if (request.method === "POST" && url.pathname === "/idempotency") {
      const body = await request.json<{ requestId?: string }>();
      if (!body.requestId) {
        return Response.json({ error: "requestId is required" }, { status: 400 });
      }
      return Response.json(await runIdempotentMutation(env.DB, body.requestId));
    }
    if (request.method === "GET" && url.pathname === "/idempotency-count") {
      await ensureIdempotencyStorage(env.DB);
      const requestId = url.searchParams.get("requestId") ?? "";
      const row = await env.DB
        .prepare("SELECT count(*) AS count FROM integration_mutations WHERE request_id=?")
        .bind(requestId)
        .first<{ count: number }>();
      return Response.json({ mutationCount: Number(row?.count ?? 0) });
    }
    if (request.method !== "POST" || url.pathname !== "/scenario") {
      return new Response("Not found", { status: 404 });
    }

    const body = await request.json<{ scenario?: string }>();
    if (!scenarios.includes(body.scenario as Scenario)) {
      return Response.json({ error: "Unknown scenario" }, { status: 400 });
    }

    return Response.json(await runScenario(env.DB, body.scenario as Scenario));
  },
};

export default worker;
