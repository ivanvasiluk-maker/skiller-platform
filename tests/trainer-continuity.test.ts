import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrainerContinuity,
  type ContinuityPlan,
} from "../lib/trainer-continuity.ts";

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
