import { userUsageBuckets } from "./usage-limits.ts";
// Account erasure is a two-stage, owner-reviewed operation. No remote writes here.
export const PRIVACY_DDL = `CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY, user_id TEXT UNIQUE, pseudonym TEXT,
  status TEXT NOT NULL DEFAULT 'requested', created_at TEXT NOT NULL, completed_at TEXT
)`;

export class PrivacyError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function privacyStatus(db: D1Database, userId: string) {
  await db.prepare(PRIVACY_DDL).run();
  return db.prepare("SELECT id,status,created_at FROM privacy_requests WHERE user_id=?").bind(userId).first<{ id: string; status: string; created_at: string }>();
}

export async function assertDataWritable(db: D1Database, userId: string, maintenance = false) {
  if (maintenance) throw new PrivacyError(503, "Идёт обслуживание. Попробуйте позже.");
  if (await privacyStatus(db, userId)) throw new PrivacyError(409, "Запрос на удаление принят. Новые записи в этот профиль приостановлены.");
}

export async function requestErasure(db: D1Database, userId: string) {
  const previous = await privacyStatus(db, userId);
  if (previous) return previous;
  const table = await db.prepare("SELECT name FROM sqlite_master WHERE name='trainer_profiles'").first();
  const profile = table ? await db.prepare("SELECT pseudonym FROM trainer_profiles WHERE user_id=?").bind(userId).first<{ pseudonym: string }>() : null;
  await db.prepare("INSERT OR IGNORE INTO privacy_requests (id,user_id,pseudonym,created_at) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(), userId, profile?.pseudonym ?? null, new Date().toISOString()).run();
  return privacyStatus(db, userId);
}

// Children precede their FK parents. Analytics use the profile pseudonym.
export const ERASURE_TABLES = [
  "reminders", "reminder_preferences", "day_tasks", "delayed_outcomes", "outcomes", "personal_skill_evidence", "skill_attempts", "situations",
  "onboarding_profiles", "psychologist_access", "trainer_performance_details", "trainer_plan_pauses",
  "trainer_outcome_reports", "trainer_messages", "trainer_plans", "trainer_requests",
  "trainer_communication_preferences", "conversation_followups", "success_factors", "intervention_memory",
  "intervention_memory_v2", "behavioral_memory_v2",
  "conversation_analysis_sessions", "behavioral_memory", "open_loops", "safety_holds", "group_requests",
  "export_queue", "pilot_feedback", "pilot_events", "cohort_members", "trainer_profiles",
] as const;
const ANALYTICS = new Set(["export_queue", "pilot_feedback", "pilot_events", "cohort_members"]);

export async function purgeAccount(db: D1Database, requestId: string, input: { maintenance: boolean; mirrorsVerified: boolean; now?: number }) {
  if (!input.maintenance) throw new PrivacyError(409, "Для очистки нужен режим обслуживания и остановленный экспорт.");
  if (!input.mirrorsVerified) throw new PrivacyError(409, "Сначала проверьте внешние копии и резервные копии.");
  await db.prepare(PRIVACY_DDL).run();
  const request = await db.prepare("SELECT * FROM privacy_requests WHERE id=?").bind(requestId)
    .first<{ id: string; user_id: string | null; pseudonym: string | null; status: string; created_at: string }>();
  if (!request) throw new PrivacyError(404, "Запрос не найден.");
  if (request.status === "completed") return { id: request.id, status: "completed" };
  if (!request.user_id || (input.now ?? Date.now()) - Date.parse(request.created_at) < 60_000) {
    throw new PrivacyError(409, "Перед очисткой дождитесь завершения активных запросов: минимум 60 секунд.");
  }
  const tables = (await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{ name: string; sql: string | null }>()).results;
  const existing = new Set(tables.map(t => t.name));
  // Fail closed on future user-owned tables rather than silently leaving records.
  for (const table of tables) {
    if (!/^[a-zA-Z0-9_]+$/.test(table.name)) throw new Error("Unsupported table identifier");
    if (/\buser_id\b/i.test(table.sql ?? "") && table.name !== "privacy_requests" &&
        !(ERASURE_TABLES as readonly string[]).includes(table.name)) throw new PrivacyError(409, "Схема изменилась: обновите карту удаления.");
  }
  const raw = request.user_id;
  const pseudo = request.pseudonym ?? raw;
  const statements = ERASURE_TABLES.filter(t => existing.has(t)).map(table => ANALYTICS.has(table)
    ? db.prepare(`DELETE FROM "${table}" WHERE user_id IN (?,?)`).bind(raw, pseudo)
    : db.prepare(`DELETE FROM "${table}" WHERE user_id=?`).bind(raw));
  if (existing.has("usage_limits")) {
    const buckets = await userUsageBuckets(raw, input.now ?? Date.now());
    statements.push(db.prepare(`DELETE FROM usage_limits WHERE bucket IN (${buckets.map(() => "?").join(",")}) OR expires_at<?`).bind(...buckets, input.now ?? Date.now()));
  }
  if (existing.has("users")) statements.push(db.prepare("DELETE FROM users WHERE id=?").bind(raw));
  statements.push(db.prepare("UPDATE privacy_requests SET user_id=NULL,pseudonym=NULL,status='completed',completed_at=? WHERE id=?")
    .bind(new Date(input.now ?? Date.now()).toISOString(), request.id));
  await db.batch(statements); // D1 batch is transactional; FK failures roll everything back.
  return { id: request.id, status: "completed" };
}
