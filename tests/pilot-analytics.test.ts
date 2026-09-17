import assert from "node:assert/strict";
import test from "node:test";

import { cohortKeyFor } from "../lib/cohorts.ts";
import {
  minimizePayloadForExport,
  nextRetryAt,
  EXPORT_QUEUE_MAX_ATTEMPTS,
  EXPORT_QUEUE_BASE_DELAY_MS,
} from "../lib/export-queue.ts";
import {
  PILOT_EVENT_SPECS,
  eventPayloadComplete,
  isPilotEventName,
  exportablePayloadKeys,
  EVENT_SCHEMA_VERSION,
} from "../lib/pilot-event-schema.ts";

test("cohort key is derived from first event day and product version", () => {
  assert.equal(
    cohortKeyFor("2026-09-16T10:30:00.000Z", "frozen-mvp-1.0"),
    "2026-09-16:frozen-mvp-1.0",
  );
  assert.equal(
    cohortKeyFor("2026-09-16T23:59:59.000Z"),
    "2026-09-16:frozen-mvp-1.0",
  );
});

test("export payload minimization keeps only allowlisted analytic keys", () => {
  const minimized = minimizePayloadForExport(
    JSON.stringify({
      skill_id: "micro-start",
      helpfulness: 8,
      text: "личный текст разговора",
      note: "заметка пользователя",
      description: "описание ситуации",
      product_version: "frozen-mvp-1.0",
      character_version: "1.0",
      skill_card_version: "1.0",
      decision_reason_code: "repeat_helpful",
      random_unknown: "drops",
      nested: { drop: true },
    }),
  );
  assert.deepEqual(minimized, {
    skill_id: "micro-start",
    helpfulness: 8,
    product_version: "frozen-mvp-1.0",
    character_version: "1.0",
    skill_card_version: "1.0",
    decision_reason_code: "repeat_helpful",
  });
  assert.deepEqual(minimizePayloadForExport("not-json"), {});
});

test("export queue retry uses exponential backoff", () => {
  const now = Date.parse("2026-09-16T00:00:00.000Z");
  assert.equal(
    nextRetryAt(0, now),
    new Date(now + EXPORT_QUEUE_BASE_DELAY_MS).toISOString(),
  );
  assert.equal(
    nextRetryAt(3, now),
    new Date(now + EXPORT_QUEUE_BASE_DELAY_MS * 8).toISOString(),
  );
  assert.ok(EXPORT_QUEUE_MAX_ATTEMPTS >= 5);
});

test("pilot event schema covers all Frozen Spec events with required payload keys", () => {
  const names = PILOT_EVENT_SPECS.map((spec) => spec.name);
  for (const required of [
    "onboarding_started",
    "onboarding_completed",
    "trainer_selected",
    "situation_submitted",
    "skill_recommended",
    "action_started",
    "action_done",
    "action_failed",
    "helpfulness_rated",
    "action_resized",
    "action_replaced",
    "day_completed",
    "engaged_return",
    "return_D2",
    "return_D3",
    "return_D7",
    "recap_3d_viewed",
    "recap_7d_viewed",
    "feedback_submitted",
    "safety_flow_used",
    "safety_check_completed",
    "trainer_changed",
    "interaction_mode_changed",
  ]) {
    assert.ok(names.includes(required), `missing event in schema: ${required}`);
  }
  assert.ok(isPilotEventName("action_done"));
  assert.ok(!isPilotEventName("unknown_event"));
  assert.equal(new Set(names).size, names.length, "event names must be unique");
  assert.ok(EVENT_SCHEMA_VERSION.startsWith("event-schema-"));

  assert.deepEqual(exportablePayloadKeys("helpfulness_rated"), ["skill_id", "score"]);
});

test("event payload completeness is checked against registry required keys", () => {
  assert.ok(eventPayloadComplete("action_done", { skill_id: "micro-start", outcome: "done" }));
  assert.ok(!eventPayloadComplete("action_done", { skill_id: "micro-start" }), "missing outcome");
  assert.ok(!eventPayloadComplete("action_done", { outcome: "done" }), "missing skill_id");
  assert.ok(!eventPayloadComplete("action_done", { skill_id: null, outcome: "done" }), "null skill_id");
  assert.ok(eventPayloadComplete("app_open", {}), "no required keys");
  assert.ok(!eventPayloadComplete("unknown_event", {}), "unknown events rejected");
});
