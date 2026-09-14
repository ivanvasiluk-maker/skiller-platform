import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrainerContinuity,
  missedDaysFromEngagement,
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
    days4to6: null,
    gapReturn: null,
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

test("Days 4–6 repeat a helpful completion only after a new context check", () => {
  const result = buildTrainerContinuity([
    plan({ result: "done", helpfulness: 8, attempt_id: "attempt-1" }),
  ], {
    day: 4,
    startedAt,
    safetyAllowsPractice: true,
  });
  assert.equal(result.days4to6?.kind, "repeat");
  assert.equal(result.days4to6?.reasonCode, "repeat_helpful");
  assert.match(result.days4to6?.prompt ?? "", /получилось, полезность — 8\/10/);
  assert.match(result.days4to6?.prompt ?? "", /безопасность и совместимость/);
});

test("Days 4–6 resize a failed action without low-fit evidence", () => {
  const result = buildTrainerContinuity([
    plan({ result: "failed", helpfulness: 5, attempt_id: "attempt-1" }),
  ], {
    day: 5,
    startedAt,
    safetyAllowsPractice: true,
  });
  assert.equal(result.days4to6?.kind, "resize");
  assert.equal(result.days4to6?.reasonCode, "resize_after_failed");
});

test("Days 4–6 replace low-fit evidence instead of repeating it", () => {
  const result = buildTrainerContinuity([
    plan({ result: "done", helpfulness: 2, attempt_id: "attempt-1" }),
  ], {
    day: 6,
    startedAt,
    safetyAllowsPractice: true,
  });
  assert.equal(result.days4to6?.kind, "replace");
  assert.equal(result.days4to6?.reasonCode, "replace_low_fit");
  assert.match(result.days4to6?.prompt ?? "", /Автоматически повторять.*не будем/);
});

test("Days 4–6 do not automatically repeat neutral evidence", () => {
  const result = buildTrainerContinuity([
    plan({ result: "done", helpfulness: 5, attempt_id: "attempt-1" }),
  ], {
    day: 4,
    startedAt,
    safetyAllowsPractice: true,
  });
  assert.equal(result.days4to6?.kind, "new");
  assert.equal(result.days4to6?.reasonCode, "first_try");
  assert.match(result.days4to6?.prompt ?? "", /недостаточно для автоматического повтора/);
});

test("an unresolved latest action keeps the open loop instead of a Days 4–6 card", () => {
  const result = buildTrainerContinuity([
    plan({ attempt_id: "attempt-2" }),
    plan({
      id: "older-success",
      result: "done",
      helpfulness: 8,
      attempt_id: "attempt-1",
    }),
  ], {
    day: 4,
    startedAt,
    safetyAllowsPractice: true,
  });
  assert.equal(result.days4to6, null);
  assert.equal(result.openLoop?.kind, "started");
});

test("safety blocks the Days 4–6 return card", () => {
  const result = buildTrainerContinuity([
    plan({ result: "done", helpfulness: 8, attempt_id: "attempt-1" }),
  ], {
    day: 4,
    startedAt,
    safetyAllowsPractice: false,
  });
  assert.equal(result.days4to6, null);
});

test("the Days 4–6 card is not reused on Day 7", () => {
  const result = buildTrainerContinuity([
    plan({ result: "done", helpfulness: 8, attempt_id: "attempt-1" }),
  ], {
    day: 7,
    startedAt,
    safetyAllowsPractice: true,
  });
  assert.equal(result.days4to6, null);
});

test("a consecutive return does not create a gap card", () => {
  const result = buildTrainerContinuity([plan()], {
    day: 3,
    startedAt,
    engagedDays: [1, 2],
  });
  assert.equal(result.gapReturn, null);
  assert.equal(missedDaysFromEngagement(3, [1, 2]), 0);
});

test("Day 4 after Day 1 reports two full missed days", () => {
  const result = buildTrainerContinuity([
    plan({ attempt_id: "attempt-1" }),
  ], {
    day: 4,
    startedAt,
    engagedDays: [1],
    safetyAllowsPractice: true,
  });
  assert.equal(result.gapReturn?.currentDay, 4);
  assert.equal(result.gapReturn?.lastEngagedDay, 1);
  assert.equal(result.gapReturn?.missedDays, 2);
  assert.match(result.gapReturn?.prompt ?? "", /перерыва в 2 дня/);
});

test("current-day engagement clears the gap card", () => {
  const result = buildTrainerContinuity([plan()], {
    day: 4,
    startedAt,
    engagedDays: [1, 4],
  });
  assert.equal(result.gapReturn, null);
  assert.equal(missedDaysFromEngagement(4, [1, 4]), 0);
});

test("gap return preserves the exact unresolved plan and open loop", () => {
  const result = buildTrainerContinuity([
    plan({ id: "saved-plan", attempt_id: "saved-attempt" }),
  ], {
    day: 5,
    startedAt,
    engagedDays: [1, 2],
    safetyAllowsPractice: true,
  });
  assert.equal(result.lastAction?.planId, "saved-plan");
  assert.equal(result.openLoop?.planId, "saved-plan");
  assert.equal(result.gapReturn?.planId, "saved-plan");
  assert.equal(result.gapReturn?.actionLabel, "Отметить результат");
  assert.match(result.gapReturn?.prompt ?? "", /Ничего не сброшено/);
});

test("completed progress remains visible after a gap", () => {
  const result = buildTrainerContinuity([
    plan({
      result: "done",
      helpfulness: 8,
      attempt_id: "attempt-1",
    }),
  ], {
    day: 5,
    startedAt,
    engagedDays: [1, 2],
    safetyAllowsPractice: true,
  });
  assert.equal(result.gapReturn?.planId, "plan-1");
  assert.match(
    result.gapReturn?.prompt ?? "",
    /получилось.*полезность — 8\/10/,
  );
  assert.match(result.gapReturn?.prompt ?? "", /без попытки догонять/);
});

test("safety takes priority in a gap return", () => {
  const result = buildTrainerContinuity([
    plan({ attempt_id: "attempt-1" }),
  ], {
    day: 4,
    startedAt,
    engagedDays: [1],
    safetyAllowsPractice: false,
  });
  assert.equal(result.gapReturn?.safetyBlocked, true);
  assert.equal(result.gapReturn?.actionLabel, "Проверить безопасность");
  assert.match(result.gapReturn?.prompt ?? "", /Сначала спокойно проверим безопасность/);
});

test("gap return copy contains no blame or catch-up demand", () => {
  const variants = [
    buildTrainerContinuity([plan()], {
      day: 4,
      engagedDays: [1],
      safetyAllowsPractice: true,
    }).gapReturn?.prompt,
    buildTrainerContinuity([
      plan({ result: "failed", helpfulness: 4, attempt_id: "attempt-1" }),
    ], {
      day: 4,
      engagedDays: [1],
      safetyAllowsPractice: true,
    }).gapReturn?.prompt,
  ].join(" ");
  assert.doesNotMatch(
    variants,
    /виноват|ленив|надо было|почему не|обязан|наверстать/i,
  );
});
