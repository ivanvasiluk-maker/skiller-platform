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
