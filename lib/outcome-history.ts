import {
  decideNextStep,
  OUTCOME_POLICY_VERSION,
  OUTCOME_REASON_CODES,
  type OutcomeReasonCode,
} from "./outcome-policy";

const alternativeSkillIds: Record<string, string> = {
  "micro-start": "distract-delay",
  "distract-delay": "micro-start",
  stop: "grounding-543",
  "grounding-543": "stop",
  "validate-first": "dear-man",
  "dear-man": "validate-first",
  "check-facts": "grounding-543",
  "urge-surfing": "stop",
};

export type CompatibleOutcome = {
  completed: boolean;
  helpfulness: number;
  avoidance: boolean;
};

export type D1RecommendationDecision = {
  prior: CompatibleOutcome | null;
  reasonCode: OutcomeReasonCode | null;
  decisionVersion: string;
  selectedSkillId: string;
  shouldResize: boolean;
};

export async function readLatestCompatibleOutcome(
  db: D1Database,
  userId: string,
  kind: string,
  skillId: string,
): Promise<CompatibleOutcome | null> {
  const row = await db
    .prepare(`
      SELECT
        o.completed AS completed,
        o.helpfulness AS helpfulness,
        o.avoidance AS avoidance
      FROM outcomes o
      INNER JOIN skill_attempts a ON o.attempt_id = a.id
      INNER JOIN situations s ON a.situation_id = s.id
      WHERE o.user_id = ? AND s.kind = ? AND a.skill_id = ?
      ORDER BY o.created_at DESC
      LIMIT 1
    `)
    .bind(userId, kind, skillId)
    .first<{ completed: number; helpfulness: number; avoidance: number }>();

  if (!row) return null;
  return {
    completed: Boolean(row.completed),
    helpfulness: row.helpfulness,
    avoidance: Boolean(row.avoidance),
  };
}

export async function decideRecommendationFromD1(input: {
  db: D1Database;
  userId: string;
  kind: string;
  skillId: string;
  safetyAllowsPractice: boolean;
}): Promise<D1RecommendationDecision> {
  const prior = input.safetyAllowsPractice
    ? await readLatestCompatibleOutcome(
        input.db,
        input.userId,
        input.kind,
        input.skillId,
      )
    : null;
  const reasonCode = decideNextStep({
    safetyAllowsPractice: input.safetyAllowsPractice,
    hasCompatibleEvidence: Boolean(prior),
    completed: prior?.completed ?? null,
    helpfulness: prior?.helpfulness ?? null,
    avoidanceIncreased: prior?.avoidance ?? false,
  });

  return {
    prior,
    reasonCode,
    decisionVersion: OUTCOME_POLICY_VERSION,
    selectedSkillId:
      reasonCode === OUTCOME_REASON_CODES.replaceLowFit
        ? alternativeSkillIds[input.skillId] ?? input.skillId
        : input.skillId,
    shouldResize: reasonCode === OUTCOME_REASON_CODES.resizeAfterFailed,
  };
}
