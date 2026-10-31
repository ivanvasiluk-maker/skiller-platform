import { z } from "zod";
import { assertDataWritable, PrivacyError } from "./privacy-data";

export type DayTask = { id: string; task_date: string; timezone: string; title: string; status: "todo" | "partial" | "done"; is_focus: number; version: number; created_at: string; updated_at: string };
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Укажите существующую дату.");
const timezoneSchema = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Проверьте часовой пояс.");
const titleSchema = z.string().trim().min(1).max(240);
const base = { date: dateSchema, timezone: timezoneSchema };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), ...base, text: z.string().trim().min(1).max(7500) }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), version: z.number().int().positive(), ...base, title: titleSchema, status: z.enum(["todo", "partial", "done"]) }),
  z.object({ action: z.literal("focus"), id: z.string().uuid(), version: z.number().int().positive() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid(), version: z.number().int().positive() }),
]);
const columns = "id,task_date,timezone,title,status,is_focus,version,created_at,updated_at";
function titleKey(title: string) { return title.normalize("NFKC").toLocaleLowerCase("ru").replace(/\s+/g, " ").trim(); }
export async function listDayTasks(db: D1Database, userId: string, date: string) {
  dateSchema.parse(date);
  return (await db.prepare(`SELECT ${columns} FROM day_tasks WHERE user_id=? AND task_date=? ORDER BY is_focus DESC,created_at,id`).bind(userId, date).all<DayTask>()).results;
}
export async function exportDayTasks(db: D1Database, userId: string) {
  return (await db.prepare(`SELECT ${columns} FROM day_tasks WHERE user_id=? ORDER BY task_date,created_at,id`).bind(userId).all<DayTask>()).results;
}
export async function dayTaskCommand(db: D1Database, userId: string, input: unknown, maintenance = false) {
  await assertDataWritable(db, userId, maintenance);
  const body = schema.parse(input);
  const now = new Date().toISOString();
  if (body.action === "add") {
    const titles: string[] = [];
    const keys = new Set<string>();
    for (const line of body.text.split(/\r?\n/)) {
      const title = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
      if (!title) continue;
      titleSchema.parse(title);
      const key = titleKey(title);
      if (!keys.has(key)) { keys.add(key); titles.push(title); }
    }
    if (!titles.length || titles.length > 30) throw new PrivacyError(400, "Добавьте от 1 до 30 дел, каждое с новой строки.");
    const result = await db.batch(titles.map(title => db.prepare("INSERT OR IGNORE INTO day_tasks (id,user_id,task_date,timezone,title,title_key,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM day_tasks WHERE user_id=? AND task_date=?)<100")
      .bind(crypto.randomUUID(), userId, body.date, body.timezone, title, titleKey(title), now, now, userId, body.date)));
    return { added: result.reduce((n, row) => n + (row.meta.changes ?? 0), 0), submitted: titles.length };
  }
  const task = await db.prepare(`SELECT ${columns} FROM day_tasks WHERE id=? AND user_id=?`).bind(body.id, userId).first<DayTask>();
  if (!task) throw new PrivacyError(404, "Дело не найдено.");
  if (task.version !== body.version) throw new PrivacyError(409, "Дело изменилось в другом окне. Обновите список.");
  if (body.action === "focus") {
    if (task.status === "done") throw new PrivacyError(409, "Выберите незавершённое дело.");
    // Transactional batch plus guarded clear keeps a stale request from clearing a newer focus.
    const valid = "EXISTS (SELECT 1 FROM day_tasks WHERE id=? AND user_id=? AND version=? AND status!='done')";
    const result = await db.batch([
      db.prepare(`UPDATE day_tasks SET is_focus=0,version=version+1,updated_at=? WHERE user_id=? AND task_date=? AND is_focus=1 AND id!=? AND ${valid}`)
        .bind(now, userId, task.task_date, task.id, task.id, userId, body.version),
      db.prepare("UPDATE day_tasks SET is_focus=1,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND status!='done'").bind(now, body.id, userId, body.version),
    ]);
    if (!result[1].meta.changes) throw new PrivacyError(409, "Дело изменилось. Обновите список.");
  } else if (body.action === "delete") {
    const result = await db.prepare("DELETE FROM day_tasks WHERE id=? AND user_id=? AND version=?").bind(body.id, userId, body.version).run();
    if (!result.meta.changes) throw new PrivacyError(409, "Дело изменилось. Обновите список.");
  } else {
    if (body.date !== task.task_date) {
      const count = await db.prepare("SELECT count(*) AS n FROM day_tasks WHERE user_id=? AND task_date=?").bind(userId, body.date).first<{ n: number }>();
      if ((count?.n ?? 0) >= 100) throw new PrivacyError(409, "На выбранную дату уже сохранено 100 дел.");
    }
    let result;
    try {
      result = await db.prepare("UPDATE day_tasks SET task_date=?,timezone=?,title=?,title_key=?,status=?,is_focus=CASE WHEN ?='done' OR task_date!=? THEN 0 ELSE is_focus END,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?")
        .bind(body.date, body.timezone, body.title, titleKey(body.title), body.status, body.status, body.date, now, body.id, userId, body.version).run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw new PrivacyError(409, "Такое дело уже есть на выбранную дату. Объедините записи вручную.");
      throw error;
    }
    if (!result.meta.changes) throw new PrivacyError(409, "Дело изменилось. Обновите список.");
  }
  return { saved: true };
}
