// Conservative request ceilings. These are not a promise of a particular EUR bill.
export const USAGE_DDL = `CREATE TABLE IF NOT EXISTS usage_limits (bucket TEXT PRIMARY KEY,used INTEGER NOT NULL,expires_at INTEGER NOT NULL)`;
export class UsageLimitError extends Error {
  status = 429;
  constructor() { super("На сегодня достигнут лимит запросов. Вернитесь позже или свяжитесь с организатором."); }
}
export async function consumeUsage(db: D1Database, userId: string, ip: string | null, now = Date.now()) {
  await db.prepare(USAGE_DDL).run();
  const day = Math.floor(now / 86400000);
  const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2,"0")).join("");
  const buckets = [
    { key: `user:${await digest(`${day}:${userId}`)}`, max: 30 },
    { key: `global:${day}`, max: 500 },
    ...(ip ? [{ key: `network:${await digest(`${day}:${ip}`)}`, max: 120 }] : []),
  ];
  await db.prepare("DELETE FROM usage_limits WHERE expires_at<?").bind(now).run();
  // A partially consumed quota on rejection is conservative; never refund blindly.
  for (const bucket of buckets) {
    const row = await db.prepare("INSERT INTO usage_limits (bucket,used,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET used=used+1 WHERE used<? RETURNING used")
      .bind(bucket.key, (day+7)*86400000, bucket.max).first();
    if (!row) throw new UsageLimitError();
  }
}

export async function userUsageBuckets(userId: string, now = Date.now()) {
  const day = Math.floor(now / 86400000);
  const keys: string[] = [];
  for (let ago=0;ago<=7;ago++) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day-ago}:${userId}`));
    keys.push(`user:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,"0")).join("")}`);
  }
  return keys;
}
