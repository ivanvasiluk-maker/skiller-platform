// PATCH 1.1: snapshot 0007 — таблица open_loops поверх 0006.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const snap = JSON.parse(readFileSync(path.join(root, "drizzle/meta/0006_snapshot.json"), "utf8"));

const col = (name, type, { pk = false, nn = true, def } = {}) => {
  const c = { name, type, primaryKey: pk, notNull: nn, autoincrement: false };
  if (def !== undefined) c.default = def;
  return c;
};

const openLoops = {
  name: "open_loops",
  columns: {
    id: col("id", "text", { pk: true }),
    user_id: col("user_id", "text"),
    plan_id: col("plan_id", "text", { nn: false }),
    topic: col("topic", "text"),
    planned_action: col("planned_action", "text"),
    entry_mode: col("entry_mode", "text", { def: "stuck" }),
    status: col("status", "text", { def: "active" }),
    priority: col("priority", "integer", { def: 0 }),
    created_at: col("created_at", "text"),
    expected_time: col("expected_time", "text", { nn: false }),
    follow_up_due: col("follow_up_due", "text"),
    follow_up_shown_at: col("follow_up_shown_at", "text", { nn: false }),
    answered_at: col("answered_at", "text", { nn: false }),
    outcome: col("outcome", "text", { nn: false }),
    resolved_at: col("resolved_at", "text", { nn: false }),
  },
  indexes: {
    open_loops_user_status: { name: "open_loops_user_status", columns: ["user_id", "status", "follow_up_due"], isUnique: false },
    open_loops_plan_active: { name: "open_loops_plan_active", columns: ["plan_id"], isUnique: true },
  },
  foreignKeys: {},
  compositePrimaryKeys: {},
  uniqueConstraints: {},
  checkConstraints: {},
};

const out = {
  version: "6",
  dialect: "sqlite",
  id: crypto.randomUUID(),
  prevId: snap.id,
  tables: { ...snap.tables, open_loops: openLoops },
  views: {},
  enums: {},
  _meta: { schemas: {}, tables: {}, columns: {} },
  internal: { indexes: {} },
};

writeFileSync(
  path.join(root, "drizzle/meta/0007_snapshot.json"),
  JSON.stringify(out, null, 2),
);
console.log(`0007_snapshot.json written, tables: ${Object.keys(out.tables).length}, id: ${out.id}, prevId: ${out.prevId}`);
