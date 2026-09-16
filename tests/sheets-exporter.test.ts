import assert from "node:assert/strict";
import test from "node:test";

import { createInMemorySheets } from "../lib/in-memory-sheets.ts";
import {
  buildCohortRow,
  buildDailyRow,
  buildEventRow,
  buildFeedbackRow,
  buildUserRow,
  EVENTS_COLUMNS,
  SHEET_HEADERS,
} from "../lib/sheets-schema.ts";

const event = {
  id: "user-1:action_rated:req-1",
  user_id: "pseudo-1",
  session_id: "session-1",
  trainer_id: "marsha",
  day_index: 3,
  event_name: "action_rated",
  payload_json: JSON.stringify({
    skill_id: "micro-start",
    helpfulness: 8,
    completed: true,
    decision_reason_code: "repeat_helpful",
    product_version: "frozen-mvp-1.0",
    character_version: "1.0",
    skill_card_version: "1.0",
    text: "личный текст, который нельзя экспортировать",
  }),
  product_version: "frozen-mvp-1.0",
  created_at: "2026-09-14T09:00:00.000Z",
};

test("event row matches EVENTS columns order and drops private text", async () => {
  const { minimizePayloadForExport } = await import("../lib/export-queue.ts");
  const minimized = minimizePayloadForExport(event.payload_json);
  const row = buildEventRow(event, "2026-09-10:frozen-mvp-1.0", minimized);
  assert.equal(row.length, EVENTS_COLUMNS.length);
  const asRecord = Object.fromEntries(
    EVENTS_COLUMNS.map((column, index) => [column, row[index]]),
  );
  assert.deepEqual(asRecord, {
    event_id: "user-1:action_rated:req-1",
    created_at: "2026-09-14T09:00:00.000Z",
    cohort_key: "2026-09-10:frozen-mvp-1.0",
    user_id: "pseudo-1",
    event_name: "action_rated",
    day_index: 3,
    product_version: "frozen-mvp-1.0",
    character_version: "1.0",
    skill_card_version: "1.0",
    skill_id: "micro-start",
    decision_reason_code: "repeat_helpful",
    helpfulness: 8,
    completed: 1,
    avoidance: null,
    understood: null,
    continue_intent: null,
    recap_day: null,
    entry_mode: null,
    from_trainer_id: null,
    to_trainer_id: null,
    from_interaction_mode: null,
    to_interaction_mode: null,
  });
  assert.ok(!JSON.stringify(row).includes("личный текст"));
});

test("feedback row contains only numbers, never free text", async () => {
  const { minimizePayloadForExport } = await import("../lib/export-queue.ts");
  const feedbackEvent = {
    ...event,
    event_name: "feedback_submitted",
    payload_json: JSON.stringify({
      helpfulness: 7,
      understood: 9,
      continue_intent: 8,
      helped: "текст что помогло — не экспортируем",
      annoyed: "текст что мешало — не экспортируем",
    }),
  };
  const row = buildFeedbackRow(
    feedbackEvent,
    "2026-09-10:frozen-mvp-1.0",
    minimizePayloadForExport(feedbackEvent.payload_json),
  );
  assert.deepEqual(row, [
    "pseudo-1",
    "2026-09-10:frozen-mvp-1.0",
    3,
    7,
    9,
    8,
    "2026-09-14T09:00:00.000Z",
  ]);
  assert.ok(!JSON.stringify(row).includes("помогло"));
});

test("daily and cohort snapshot rows are numeric aggregates", () => {
  assert.deepEqual(
    buildDailyRow({
      userId: "pseudo-1",
      cohortKey: "c",
      dayIndex: 2,
      engaged: true,
      actionsStarted: 1,
      actionsCompleted: 1,
    }),
    ["pseudo-1", "c", 2, 1, 1, 1],
  );
  assert.deepEqual(
    buildCohortRow({
      cohortKey: "c",
      productVersion: "frozen-mvp-1.0",
      users: 5,
      d2: 4,
      d3: 3,
      d7: 2,
      actionsStarted: 9,
      actionsCompleted: 6,
    }),
    ["c", "frozen-mvp-1.0", 5, 4, 3, 2, 9, 6],
  );
  assert.deepEqual(buildUserRow({
    userId: "pseudo-1",
    cohortKey: "c",
    trainerId: "beck",
    firstEventAt: "2026-09-10T08:00:00.000Z",
  }), ["pseudo-1", "c", "beck", "2026-09-10T08:00:00.000Z"]);
});

test("in-memory sheets transport mimics append, read and rewrite", async () => {
  const sheets = createInMemorySheets();
  await sheets.transport.ensureHeader("EVENTS", SHEET_HEADERS.EVENTS);
  await sheets.transport.ensureHeader("EVENTS", SHEET_HEADERS.EVENTS);
  await sheets.transport.appendRows("EVENTS", [["e1", "x"], ["e2", "y"]]);
  await sheets.transport.appendRows("EVENTS", [["e3", "z"]]);
  assert.deepEqual(await sheets.transport.readFirstColumn("EVENTS"), ["e1", "e2", "e3"]);
  assert.equal((sheets.tabs.get("EVENTS") ?? []).length, 4, "header + 3 rows");
  await sheets.transport.rewriteTab("COHORTS", SHEET_HEADERS.COHORTS, [["c1", "v", 1, 1, 1, 1, 2, 2]]);
  assert.deepEqual(await sheets.transport.readFirstColumn("COHORTS"), ["c1"]);
  sheets.failWith(new Error("Google API down"));
  await assert.rejects(() => sheets.transport.appendRows("EVENTS", [["e4"]]), /down/);
});
