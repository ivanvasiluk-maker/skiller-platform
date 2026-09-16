// Export queue для Google Sheets mirror (Этап 3).
// События ставятся в очередь атомарно с записью pilot_events; сам экспорт выполняется
// отдельным worker/cron и не влияет на ответ пользователю. Retry — exponential backoff,
// перманентные сбои уходят в dead-letter статус.

import { ensureCohortAttribution } from "./cohorts.ts";

export type ExportQueueStatus = "pending" | "processing" | "sent" | "failed";

export const EXPORT_QUEUE_MAX_ATTEMPTS = 8;
export const EXPORT_QUEUE_BASE_DELAY_MS = 60_000;

export function nextRetryAt(attempts: number, now: number = Date.now()): string {
  const delay = EXPORT_QUEUE_BASE_DELAY_MS * 2 ** Math.min(attempts, 10);
  return new Date(now + delay).toISOString();
}

/** Минимизированная аналитическая запись для экспорта: без email, имён и текста разговоров. */
export type ExportRecord = {
  event_id: string;
  user_id: string;
  cohort_key: string;
  event_name: string;
  day_index: number;
  created_at: string;
  product_version: string;
  payload: Record<string, string | number | boolean | null>;
};

const EXPORTABLE_PAYLOAD_KEY_ALLOWLIST = new Set([
  "skill_id",
  "decision_reason_code",
  "decision_version",
  "helpfulness",
  "understood",
  "continue_intent",
  "completed",
  "avoidance",
  "recap_day",
  "entry_mode",
  "from_trainer_id",
  "to_trainer_id",
  "from_interaction_mode",
  "to_interaction_mode",
  "product_version",
  "character_version",
  "skill_card_version",
]);

export function minimizePayloadForExport(
  payloadJson: string,
): Record<string, string | number | boolean | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return {};
  }
  const minimized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!EXPORTABLE_PAYLOAD_KEY_ALLOWLIST.has(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value) || value === null) {
      minimized[key] = value as string | number | boolean | null;
    }
  }
  return minimized;
}

export async function enqueueEventExport(
  db: D1Database,
  input: { eventId: string; userId: string; now?: string },
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  await ensureCohortAttribution(db, {
    userId: input.userId,
    firstEventAt: now,
    now,
  });
  await db
    .prepare(
      "INSERT OR IGNORE INTO export_queue (id, event_id, user_id, status, attempts, retry_at, last_error, created_at, updated_at) VALUES (?,?,?,'pending',0,?,NULL,?,?)",
    )
    .bind(`export:${input.eventId}`, input.eventId, input.userId, now, now, now)
    .run();
}

/** Следующая порция событий для экспорта. Идемпотентно: строка берётся в processing. */
export async function claimExportBatch(
  db: D1Database,
  input: { limit?: number; now?: string } = {},
): Promise<string[]> {
  const now = input.now ?? new Date().toISOString();
  const limit = input.limit ?? 50;
  const due = await db
    .prepare(
      "SELECT id FROM export_queue WHERE status IN ('pending','failed') AND attempts < ? AND (retry_at IS NULL OR retry_at <= ?) ORDER BY created_at LIMIT ?",
    )
    .bind(EXPORT_QUEUE_MAX_ATTEMPTS, now, limit)
    .all<{ id: string }>();
  const ids = due.results.map((row) => row.id);
  for (const id of ids) {
    await db
      .prepare("UPDATE export_queue SET status='processing', updated_at=? WHERE id=? AND status IN ('pending','failed')")
      .bind(now, id)
      .run();
  }
  return ids;
}

export async function markExportSent(db: D1Database, queueId: string, now?: string): Promise<void> {
  const at = now ?? new Date().toISOString();
  await db
    .prepare("UPDATE export_queue SET status='sent', updated_at=? WHERE id=?")
    .bind(at, queueId)
    .run();
  await db
    .prepare(
      "UPDATE pilot_events SET exported_at=? WHERE id=(SELECT event_id FROM export_queue WHERE id=?)",
    )
    .bind(at, queueId)
    .run();
}

export async function markExportFailed(
  db: D1Database,
  queueId: string,
  error: string,
  now?: string,
): Promise<{ deadLettered: boolean }> {
  const at = now ?? new Date().toISOString();
  const row = await db
    .prepare("SELECT attempts FROM export_queue WHERE id=?")
    .bind(queueId)
    .first<{ attempts: number }>();
  const attempts = Number(row?.attempts ?? 0) + 1;
  const deadLettered = attempts >= EXPORT_QUEUE_MAX_ATTEMPTS;
  await db
    .prepare(
      "UPDATE export_queue SET status='failed', attempts=?, retry_at=?, last_error=?, updated_at=? WHERE id=?",
    )
    .bind(
      attempts,
      deadLettered ? null : nextRetryAt(attempts),
      error.slice(0, 400),
      at,
      queueId,
    )
    .run();
  return { deadLettered };
}
