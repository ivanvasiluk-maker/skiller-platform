export type IdempotencyClaim<T> =
  | { state: "claimed" }
  | { state: "cached"; response: T }
  | { state: "in_flight" };

async function readCached<T>(
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<IdempotencyClaim<T> | null> {
  const row = await db
    .prepare(
      "SELECT response_json FROM trainer_requests WHERE user_id=? AND request_id=?",
    )
    .bind(userId, requestId)
    .first<{ response_json: string | null }>();
  if (!row) return null;
  if (row.response_json) {
    return { state: "cached", response: JSON.parse(row.response_json) as T };
  }
  return { state: "in_flight" };
}

export async function claimIdempotentRequest<T>(
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<IdempotencyClaim<T>> {
  const existing = await readCached<T>(db, userId, requestId);
  if (existing) return existing;

  const claim = await db
    .prepare(
      "INSERT OR IGNORE INTO trainer_requests (user_id,request_id,created_at) VALUES (?,?,?)",
    )
    .bind(userId, requestId, new Date().toISOString())
    .run();
  if (claim.meta.changes) return { state: "claimed" };

  return (await readCached<T>(db, userId, requestId)) ?? {
    state: "in_flight",
  };
}

export async function cacheIdempotentResponse(
  db: D1Database,
  userId: string,
  requestId: string,
  response: unknown,
) {
  await db
    .prepare(
      "UPDATE trainer_requests SET response_json=? WHERE user_id=? AND request_id=?",
    )
    .bind(JSON.stringify(response), userId, requestId)
    .run();
}
