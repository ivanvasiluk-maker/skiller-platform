import assert from "node:assert/strict";
import test from "node:test";
import { reminderInstant } from "../lib/reminder-time.ts";
const now = Date.parse("2026-01-01T00:00:00Z");
test("explicit time zones resolve independently of the runtime's local timezone", () => {
  assert.equal(reminderInstant("2026-02-01T12:30", "Europe/Vilnius", now), "2026-02-01T10:30:00.000Z");
  assert.equal(reminderInstant("2026-07-01T12:30", "Europe/Vilnius", now), "2026-07-01T09:30:00.000Z");
  assert.equal(reminderInstant("2026-02-01T00:15", "Asia/Kathmandu", now), "2026-01-31T18:30:00.000Z");
});
test("DST gaps and repeated hours require a different explicit agreement", () => {
  assert.throws(() => reminderInstant("2026-03-29T03:30", "Europe/Vilnius", now), /переводе часов/);
  assert.throws(() => reminderInstant("2026-10-25T03:30", "Europe/Vilnius", now), /переводе часов/);
});
test("reject invalid calendar values, unknown zones, past and excessively distant times", () => {
  for (const local of ["2026-02-30T12:00", "2026-01-01T24:00", "2025-12-01T12:00", "2028-01-01T12:00"]) assert.throws(() => reminderInstant(local, "UTC", now));
  assert.throws(() => reminderInstant("2026-02-01T12:00", "No/Such_Zone", now));
  assert.throws(() => reminderInstant("2026-01-01T00:00", "UTC", now));
});
