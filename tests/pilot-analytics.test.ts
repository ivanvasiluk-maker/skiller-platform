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
    "skill_recommended",
    "action_started",
    "action_completed",
    "action_rated",
    "action_failed_honest",
    "resize_accepted",
    "replacement_accepted",
    "engaged_return",
    "return_D2",
    "return_D3",
    "return_D7",
    "recap_shown",
    "feedback_submitted",
    "safety_flow_used",
    "trainer_changed",
    "interaction_mode_changed",
  ]) {
    assert.ok(names.includes(required), `missing event in schema: ${required}`);
  }
  assert.ok(isPilotEventName("action_completed"));
  assert.ok(!isPilotEventName("unknown_event"));
  assert.equal(new Set(names).size, names.length, "event names must be unique");
  assert.ok(EVENT_SCHEMA_VERSION.startsWith("event-schema-"));

  assert.deepEqual(exportablePayloadKeys("action_rated"), ["skill_id", "helpfulness"]);
});
