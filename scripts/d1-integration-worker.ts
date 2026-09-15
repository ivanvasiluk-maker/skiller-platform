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

type Env = { DB: D1Database };
const scenarios = [
  "first_try",
  "repeat_helpful",
  "resize_after_failed",
  "replace_low_fit",
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
      "Микростарт",
      "behavioral",
      "action",
      "Первый маленький шаг",
      "Снижает порог входа",
      "[]",
      60,
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
    ).bind("micro-start", "Микростарт", "behavioral", "action", "Первый маленький шаг", "Снижает порог входа", "[]", 60),
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
    ).bind(historicalEventId, pseudonym, "history-session-" + suffix, "marsha", 2, "action_completed", '{"source":"before-settings"}', "test-v1", profileCreatedAt),
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
    productVersion: "test-v1",
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

type IdempotencyResponse = { requestId: string; mutationCount: number };

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
    if (request.method === "POST" && url.pathname === "/settings-continuity") {
      return Response.json(await runSettingsContinuity(env.DB));
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
