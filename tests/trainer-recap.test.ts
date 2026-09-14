import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecap,
  type RecapAttempt,
} from "../lib/trainers.ts";

function plan(overrides: Partial<RecapAttempt> = {}): RecapAttempt {
  return {
    attempt_id: null,
    result: null,
    helpfulness: null,
    skill_title: "Микростарт",
    created_at: "2026-09-14T10:00:00.000Z",
    ...overrides,
  };
}

test("a proposed action is not counted as an attempt", () => {
  const recap = buildRecap([plan()], [1, 2, 2, 3]);
  assert.equal(recap.proposed, 1);
  assert.equal(recap.attempts, 0);
  assert.equal(recap.outcomesRecorded, 0);
  assert.deepEqual(recap.engagedDays, [1, 2, 3]);
  assert.match(recap.facts[0], /действие предложено.*неизвестно/);
  assert.match(recap.unknown[0], /результат пока неизвестен/);
});

test("a started action without outcome stays explicitly unknown", () => {
  const recap = buildRecap([plan({ attempt_id: "attempt-1" })]);
  assert.equal(recap.attempts, 1);
  assert.equal(recap.completed, 0);
  assert.equal(recap.outcomesRecorded, 0);
  assert.match(recap.facts[0], /попытка начата; итог не отмечен/);
  assert.match(recap.next, /Без результата вывод делать рано/);
});

test("saved result and helpfulness are quoted exactly", () => {
  const recap = buildRecap([
    plan({
      attempt_id: "attempt-1",
      result: "done",
      helpfulness: 8,
    }),
  ]);
  assert.equal(recap.attempts, 1);
  assert.equal(recap.completed, 1);
  assert.equal(recap.outcomesRecorded, 1);
  assert.deepEqual(recap.helpful, ["Микростарт"]);
  assert.equal(recap.unknown.length, 0);
  assert.match(recap.facts[0], /получилось; полезность 8\/10/);
  assert.doesNotMatch(recap.facts[0], /потому что|причин/);
});

test("missing helpfulness is marked unknown instead of inferred", () => {
  const recap = buildRecap([
    plan({
      attempt_id: "attempt-1",
      result: "failed",
    }),
  ]);
  assert.equal(recap.outcomesRecorded, 1);
  assert.deepEqual(recap.difficult, ["Микростарт"]);
  assert.match(recap.facts[0], /не получилось; полезность не оценена/);
  assert.match(recap.unknown[0], /полезность не оценена/);
  assert.doesNotMatch(recap.next, /потому что|причин/);
});

test("repeated helpfulness requires two saved helpful outcomes", () => {
  const recap = buildRecap([
    plan({
      attempt_id: "attempt-2",
      result: "more",
      helpfulness: 7,
      created_at: "2026-09-15T10:00:00.000Z",
    }),
    plan({
      attempt_id: "attempt-1",
      result: "done",
      helpfulness: 8,
    }),
  ]);
  assert.deepEqual(recap.repeated, ["Микростарт"]);
  assert.match(recap.next, /причина улучшения пока не доказана/);
});

test("Day 7 recap excludes plans and events from Day 8", () => {
  const startedAt = "2026-09-14T08:00:00.000Z";
  const recap = buildRecap([
    plan({
      skill_title: "Поздний навык",
      attempt_id: "attempt-day-8",
      result: "done",
      helpfulness: 10,
      created_at: "2026-09-21T08:00:00.000Z",
    }),
    plan({
      skill_title: "Навык первой недели",
      attempt_id: "attempt-day-7",
      result: "done",
      helpfulness: 7,
      created_at: "2026-09-20T08:00:00.000Z",
    }),
  ], [1, 3, 7, 8], startedAt);

  assert.equal(recap.proposed, 1);
  assert.deepEqual(recap.skills, ["Навык первой недели"]);
  assert.deepEqual(recap.engagedDays, [1, 3, 7]);
  assert.doesNotMatch(recap.facts.join(" "), /Поздний навык/);
});

test("two helpful outcomes create only a limited working hypothesis", () => {
  const recap = buildRecap([
    plan({
      attempt_id: "attempt-2",
      result: "more",
      helpfulness: 7,
      created_at: "2026-09-16T10:00:00.000Z",
    }),
    plan({
      attempt_id: "attempt-1",
      result: "done",
      helpfulness: 8,
    }),
  ], [1, 3], "2026-09-14T08:00:00.000Z");

  assert.match(recap.day7.workingHypothesis, /2 сохранённых outcomes/);
  assert.equal(recap.day7.confidenceLevel, "limited");
  assert.match(recap.day7.confidence, /не доказывает причину/);
  assert.equal(recap.day7.nextExperiment.kind, "transfer");
});

test("one helpful outcome stays low confidence and suggests repeat", () => {
  const recap = buildRecap([
    plan({
      attempt_id: "attempt-1",
      result: "done",
      helpfulness: 8,
    }),
  ], [1], "2026-09-14T08:00:00.000Z");

  assert.match(recap.day7.workingHypothesis, /один завершённый outcome/);
  assert.equal(recap.day7.confidenceLevel, "low");
  assert.equal(recap.day7.nextExperiment.kind, "repeat");
});

test("low-fit evidence suggests replacement without inventing a cause", () => {
  const recap = buildRecap([
    plan({
      attempt_id: "attempt-1",
      result: "done",
      helpfulness: 2,
    }),
  ], [1], "2026-09-14T08:00:00.000Z");

  assert.equal(recap.day7.nextExperiment.kind, "replace");
  assert.match(recap.day7.workingHypothesis, /Причина результата неизвестна/);
  assert.doesNotMatch(recap.day7.workingHypothesis, /потому что/);
});

test("an unresolved week ends with closing the open loop", () => {
  const recap = buildRecap([
    plan({ attempt_id: "attempt-1" }),
  ], [1], "2026-09-14T08:00:00.000Z");

  assert.equal(recap.day7.nextExperiment.kind, "close_loop");
  assert.match(recap.day7.workingHypothesis, /outcome неизвестен/);
});
