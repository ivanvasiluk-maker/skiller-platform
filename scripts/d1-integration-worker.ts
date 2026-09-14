import {
  decideRecommendationFromD1,
  type D1RecommendationDecision,
} from "../lib/outcome-history";

type Env = { DB: D1Database };
const scenarios = [
  "first_try",
  "repeat_helpful",
  "resize_after_failed",
  "replace_low_fit",
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
): Promise<D1RecommendationDecision> {
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

  if (scenario === "repeat_helpful") {
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

  return decideRecommendationFromD1({
    db,
    userId,
    kind,
    skillId,
    safetyAllowsPractice: true,
  });
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const row = await env.DB.prepare("SELECT 1 AS ok").first();
      return Response.json(row);
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
