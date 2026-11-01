import { z } from "zod";
import { assertDataWritable } from "./privacy-data.ts";

export const GROUP_DDL = `CREATE TABLE IF NOT EXISTS group_requests (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,offer_id TEXT NOT NULL,contact TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 amount_eur INTEGER,confirmation_note TEXT
)`;
export const groupInput = z.object({ contact: z.string().trim().min(3).max(160).refine(value => z.string().email().safeParse(value).success || /^(?:@|https:\/\/t\.me\/)[A-Za-z0-9_]{5,32}$/.test(value), "Укажите Telegram @username или email"), consent: z.literal(true) }).strict();
export const groupAdminInput = z.object({ id: z.string().uuid(), status: z.enum(["contacted", "confirmed", "closed"]),
  amountEur: z.number().int().min(1).max(10000).optional(), confirmationNote: z.string().trim().min(3).max(200).optional(),
  paymentVerified: z.boolean().optional() }).strict();

export async function groupEligibility(db: D1Database, userId: string) {
  await assertDataWritable(db, userId);
  const profile = await db.prepare("SELECT safety_flag FROM trainer_profiles WHERE user_id=?").bind(userId).first<{ safety_flag: number }>();
  if (!profile || profile.safety_flag) return false;
  const holdTable = await db.prepare("SELECT name FROM sqlite_master WHERE name='safety_holds'").first();
  if (holdTable && await db.prepare("SELECT user_id FROM safety_holds WHERE user_id=? AND active=1").bind(userId).first()) return false;
  return Boolean(await db.prepare("SELECT id FROM outcomes WHERE user_id=? AND completed=1 LIMIT 1").bind(userId).first());
}

export async function createGroupRequest(db: D1Database, userId: string, raw: unknown) {
  const input = groupInput.parse(raw);
  if (!await groupEligibility(db, userId)) throw new Error("Заявка сейчас недоступна.");
  await db.prepare(GROUP_DDL).run();
  const previous = await db.prepare("SELECT id,status FROM group_requests WHERE user_id=? AND offer_id='adhd-adults' AND status IN ('requested','contacted','confirmed') ORDER BY created_at DESC LIMIT 1")
    .bind(userId).first<{ id: string; status: string }>();
  if (previous) return previous;
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO group_requests (id,user_id,offer_id,contact,created_at,updated_at) VALUES (?,?,'adhd-adults',?,?,?)").bind(id, userId, input.contact, now, now).run();
  const stored = await db.prepare("SELECT id,status FROM group_requests WHERE user_id=? AND offer_id='adhd-adults' AND status IN ('requested','contacted','confirmed') ORDER BY created_at DESC LIMIT 1").bind(userId).first<{ id: string; status: string }>();
  if (!stored) throw new Error("Заявка не сохранена.");
  return stored;
}

export async function updateGroupRequest(db: D1Database, raw: unknown) {
  const input = groupAdminInput.parse(raw);
  if (input.status === "confirmed" && (!input.paymentVerified || !input.amountEur || !input.confirmationNote)) throw new Error("Нужно вручную проверить оплату, сумму и основание подтверждения.");
  await db.prepare(GROUP_DDL).run();
  const row = await db.prepare("SELECT id,status FROM group_requests WHERE id=?").bind(input.id).first<{ id: string; status: string }>();
  if (!row) throw new Error("Заявка не найдена.");
  if (row.status === "closed" || row.status === "confirmed") {
    if (row.status === input.status) return row;
    throw new Error("Заявка уже завершена.");
  }
  const changed = await db.prepare("UPDATE group_requests SET status=?,amount_eur=?,confirmation_note=?,updated_at=? WHERE id=? AND status IN ('requested','contacted')")
    .bind(input.status, input.amountEur ?? null, input.confirmationNote ?? null, new Date().toISOString(), input.id).run();
  if (!changed.meta.changes) {
    const current = await db.prepare("SELECT id,status FROM group_requests WHERE id=?").bind(input.id).first<{ id: string; status: string }>();
    if (current?.status === input.status) return current;
    throw new Error("Заявка уже изменилась. Обновите список.");
  }
  return { id: input.id, status: input.status };
}
