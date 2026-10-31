import { z } from "zod";
import { assertDataWritable, PrivacyError } from "./privacy-data";
import { reminderInstant } from "./reminder-time";
export type Reminder = { id: string; task_id: string; timezone: string; local_time: string; due_at: string; status: string; version: number; title: string; task_date: string; task_timezone: string; task_version: number; due: boolean };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule"), taskId: z.string().uuid(), timezone: z.string().max(80), localTime: z.string().max(16), consent: z.literal(true) }),
  z.object({ action: z.enum(["cancel", "snooze", "complete"]), id: z.string().uuid(), version: z.number().int().positive() }),
  z.object({ action: z.literal("disableAll") }),
]);
export async function listReminders(db: D1Database, userId: string, now = Date.now()) {
  const rows = (await db.prepare("SELECT r.id,r.task_id,r.timezone,r.local_time,r.due_at,r.status,r.version,t.title,t.task_date,t.timezone AS task_timezone,t.version AS task_version FROM reminders r JOIN day_tasks t ON t.id=r.task_id AND t.user_id=r.user_id JOIN reminder_preferences p ON p.user_id=r.user_id AND p.enabled=1 WHERE r.user_id=? AND r.status='scheduled' AND t.status!='done' AND NOT EXISTS (SELECT 1 FROM privacy_requests WHERE user_id=?) ORDER BY r.due_at,r.id LIMIT 100")
    .bind(userId, userId).all<Omit<Reminder, "due">>()).results;
  return { items: rows.map(row => ({ ...row, due: Date.parse(row.due_at) <= now })), serverNow: new Date(now).toISOString(), channel: "in_app" };
}
export async function reminderCommand(db: D1Database, userId: string, input: unknown, maintenance = false, now = Date.now()) {
  await assertDataWritable(db, userId, maintenance);
  const body = actionSchema.parse(input);
  const stamp = new Date(now).toISOString();
  if (body.action === "disableAll") {
    await db.batch([
      db.prepare("INSERT INTO reminder_preferences (user_id,enabled,updated_at) VALUES (?,0,?) ON CONFLICT(user_id) DO UPDATE SET enabled=0,updated_at=excluded.updated_at").bind(userId, stamp),
      db.prepare("UPDATE reminders SET status='cancelled',version=version+1,updated_at=? WHERE user_id=? AND status='scheduled'").bind(stamp, userId),
    ]);
    return { saved: true };
  }
  if (body.action === "schedule") {
    let dueAt: string;
    try { dueAt = reminderInstant(body.localTime, body.timezone, now); }
    catch (error) { throw new PrivacyError(400, error instanceof Error ? error.message : "Проверьте время."); }
    const task = await db.prepare("SELECT id FROM day_tasks WHERE id=? AND user_id=? AND status!='done'").bind(body.taskId, userId).first();
    if (!task) throw new PrivacyError(404, "Незавершённое дело не найдено.");
    const result = await db.batch([
      db.prepare("INSERT OR IGNORE INTO reminders (id,user_id,task_id,timezone,local_time,due_at,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM day_tasks WHERE id=? AND user_id=? AND status!='done') AND (SELECT count(*) FROM reminders WHERE user_id=? AND status='scheduled')<100")
        .bind(crypto.randomUUID(), userId, body.taskId, body.timezone, body.localTime, dueAt, stamp, stamp, body.taskId, userId, userId),
      db.prepare("INSERT INTO reminder_preferences (user_id,enabled,updated_at) SELECT ?,1,? WHERE EXISTS (SELECT 1 FROM reminders WHERE user_id=? AND task_id=? AND status='scheduled') ON CONFLICT(user_id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at").bind(userId, stamp, userId, body.taskId),
    ]);
    if (!result[0].meta.changes) throw new PrivacyError(409, "Напоминание об этом деле уже есть либо достигнут лимит. Отмените прежнее перед новой настройкой.");
    return { saved: true, dueAt };
  }
  const status = body.action === "snooze" ? "scheduled" : body.action === "complete" ? "completed" : "cancelled";
  const due = new Date(now + 3600000).toISOString();
  const result = await db.prepare("UPDATE reminders SET status=?,due_at=CASE WHEN ?='snooze' THEN ? ELSE due_at END,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND status='scheduled' AND EXISTS (SELECT 1 FROM reminder_preferences WHERE user_id=? AND enabled=1)")
    .bind(status, body.action, due, stamp, body.id, userId, body.version, userId).run();
  if (!result.meta.changes) throw new PrivacyError(409, "Напоминание изменилось или недоступно. Обновите список.");
  return { saved: true };
}

export async function exportReminders(db: D1Database, userId: string) {
  return {
    preferences: await db.prepare("SELECT enabled,updated_at FROM reminder_preferences WHERE user_id=?").bind(userId).first(),
    reminders: (await db.prepare("SELECT id,task_id,timezone,local_time,due_at,status,version,created_at,updated_at FROM reminders WHERE user_id=? ORDER BY created_at,id").bind(userId).all()).results,
  };
}
