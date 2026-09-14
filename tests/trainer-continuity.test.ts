import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrainerContinuity,
  type ContinuityPlan,
} from "../lib/trainer-continuity.ts";

const startedAt = "2026-09-14T08:00:00.000Z";

function plan(
  overrides: Partial<ContinuityPlan> = {},
): ContinuityPlan {
  return {
    id: "plan-1",
    skill_title: "Микростарт",
    entry_mode: "stuck",
    attempt_id: null,
    result: null,
    helpfulness: null,
    created_at: "2026-09-14T10:00:00.000Z",
    ...overrides,
  };
}

test("continuity is empty without saved plans", () => {
  assert.deepEqual(buildTrainerContinuity([]), {
    lastAction: null,
    lastOutcome: null,
    openLoop: null,
    day2CheckIn: null,
    nextCheckAt: null,
  });
});

test("suggested action remains an open loop after reload", () => {
  const result = buildTrainerContinuity([plan()]);
  assert.equal(result.openLoop?.kind, "suggested");
  assert.equal(result.openLoop?.actionLabel, "Открыть действие");
  assert.equal(result.nextCheckAt, "2026-09-15T10:00:00.000Z");
});

test("started action asks for its factual result", () => {
  const result = buildTrainerContinuity([
    plan({ attempt_id: "attempt-1" }),
  ]);
  assert.equal(result.openLoop?.kind, "started");
  assert.equal(result.openLoop?.actionLabel, "Отметить результат");
  assert.equal(result.lastAction?.started, true);
});

test("failed latest action offers resize or replacement", () => {
  const result = buildTrainerContinuity([
    plan({ result: "failed", helpfulness: 2 }),
  ]);
  assert.equal(result.openLoop?.kind, "failed");
  assert.match(result.openLoop?.prompt ?? "", /уменьшить.*другой навык/);
  assert.deepEqual(result.lastOutcome, {
    planId: "plan-1",
    result: "failed",
    helpfulness: 2,
    createdAt: "2026-09-14T10:00:00.000Z",
  });
  assert.equal(result.nextCheckAt, null);
});

test("successful latest action does not create a false open loop", () => {
  const result = buildTrainerContinuity([
    plan({ result: "done", helpfulness: 8, attempt_id: "attempt-1" }),
    plan({ id: "older-failed", result: "failed", helpfulness: 2 }),
  ]);
  assert.equal(result.openLoop, null);
  assert.equal(result.lastOutcome?.result, "done");
});

test("Day 1 does not show a Day 2 check-in", () => {
  const result = buildTrainerContinuity([plan()], {
    day: 1,
    startedAt,
  });
  assert.equal(result.day2CheckIn, null);
});

test("Day 2 asks for the unresolved Day 1 action result", () => {
  const result = buildTrainerContinuity([plan()], {
    day: 2,
    startedAt,
  });
  assert.equal(result.day2CheckIn?.skillTitle, "Микростарт");
  assert.equal(result.day2CheckIn?.result, null);
  assert.match(
    result.day2CheckIn?.prompt ?? "",
    /Микростарт.*сделал, не получилось или сделал больше/,
  );
  assert.equal(result.day2CheckIn?.actionLabel, "Отметить результат");
});

test("Day 2 states the saved Day 1 outcome without inventing a cause", () => {
  const result = buildTrainerContinuity([
    plan({ result: "done", helpfulness: 8, attempt_id: "attempt-1" }),
  ], {
    day: 2,
    startedAt,
  });
  assert.equal(result.day2CheckIn?.result, "done");
  assert.match(
    result.day2CheckIn?.prompt ?? "",
    /Микростарт.*получилось, полезность — 8\/10/,
  );
  assert.doesNotMatch(result.day2CheckIn?.prompt ?? "", /потому что|причин/);
});

test("Day 2 keeps the Day 1 action after a newer Day 2 plan exists", () => {
  const result = buildTrainerContinuity([
    plan({
      id: "day-2-plan",
      skill_title: "Заземление",
      created_at: "2026-09-15T09:00:00.000Z",
    }),
    plan({
      id: "day-1-plan",
      skill_title: "Первый шаг",
      result: "more",
      helpfulness: 7,
    }),
  ], {
    day: 2,
    startedAt,
  });
  assert.equal(result.day2CheckIn?.planId, "day-1-plan");
  assert.equal(result.day2CheckIn?.skillTitle, "Первый шаг");
  assert.match(result.day2CheckIn?.prompt ?? "", /сделал больше/);
});
