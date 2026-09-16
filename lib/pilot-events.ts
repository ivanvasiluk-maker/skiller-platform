import { CHARACTER_VERSION, PRODUCT_VERSION } from "./trainers.ts";
import { ensureCohortAttribution } from "./cohorts.ts";
import { enqueueEventExport } from "./export-queue.ts";

export type PilotEventPayload = Record<
  string,
  string | number | boolean | null
>;

export function buildPilotEventPayload(
  payload: PilotEventPayload,
  skillCardVersion: string | null,
): PilotEventPayload {
  return {
    ...payload,
    product_version: PRODUCT_VERSION,
    character_version: CHARACTER_VERSION,
    skill_card_version: skillCardVersion,
  };
}

export type PilotEventInput = {
  id: string;
  userId: string;
  sessionId: string;
  trainerId: string;
  dayIndex: number;
  eventName: string;
  payload: PilotEventPayload;
  skillCardVersion: string | null;
  createdAt: string;
};

export function preparePilotEvent(db: D1Database, input: PilotEventInput) {
  return db
    .prepare(
      "INSERT OR IGNORE INTO pilot_events (id,user_id,session_id,trainer_id,day_index,event_name,payload_json,product_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      input.id,
      input.userId,
      input.sessionId,
      input.trainerId,
      input.dayIndex,
      input.eventName,
      JSON.stringify(
        buildPilotEventPayload(input.payload, input.skillCardVersion),
      ),
      PRODUCT_VERSION,
      input.createdAt,
    );
}

/**
 * Записывает pilot event и в той же транзакции ставит его в export queue и
 * привязывает пользователя к cohort. Идемпотентно по id события.
 */
export async function recordPilotEvent(
  db: D1Database,
  input: PilotEventInput,
): Promise<void> {
  await preparePilotEvent(db, input).run();
  await ensureCohortAttribution(db, {
    userId: input.userId,
    firstEventAt: input.createdAt,
  });
  await enqueueEventExport(db, {
    eventId: input.id,
    userId: input.userId,
    now: input.createdAt,
  });
}

/** Batch-варианты для записи, где допустим только один D1 batch (trainer settings). */
export function prepareCohortAttributionStatements(
  db: D1Database,
  input: { userId: string; firstEventAt: string; now?: string },
) {
  const cohortKey = input.firstEventAt.slice(0, 10) + ":" + PRODUCT_VERSION;
  const now = input.now ?? new Date().toISOString();
  return [
    db
      .prepare("INSERT OR IGNORE INTO cohorts (key, product_version, starts_on, created_at) VALUES (?,?,?,?)")
      .bind(cohortKey, PRODUCT_VERSION, cohortKey.slice(0, 10), now),
    db
      .prepare("INSERT OR IGNORE INTO cohort_members (cohort_key, user_id, first_event_at, created_at) VALUES (?,?,?,?)")
      .bind(cohortKey, input.userId, input.firstEventAt, now),
  ];
}

export function prepareExportQueueStatement(
  db: D1Database,
  input: { eventId: string; userId: string; now?: string },
) {
  const now = input.now ?? new Date().toISOString();
  return db
    .prepare(
      "INSERT OR IGNORE INTO export_queue (id, event_id, user_id, status, attempts, retry_at, last_error, created_at, updated_at) VALUES (?,?,?,'pending',0,?,NULL,?,?)",
    )
    .bind(`export:${input.eventId}`, input.eventId, input.userId, now, now, now);
}
