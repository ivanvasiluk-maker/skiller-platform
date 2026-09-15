import { CHARACTER_VERSION, PRODUCT_VERSION } from "./trainers.ts";

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

export function preparePilotEvent(
  db: D1Database,
  input: {
    id: string;
    userId: string;
    sessionId: string;
    trainerId: string;
    dayIndex: number;
    eventName: string;
    payload: PilotEventPayload;
    skillCardVersion: string | null;
    createdAt: string;
  },
) {
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
