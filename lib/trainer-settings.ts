import type { InteractionMode, TrainerId } from "./trainers.ts";
import {
  preparePilotEvent,
  prepareCohortAttributionStatements,
  prepareExportQueueStatement,
} from "./pilot-events.ts";

export type TrainerSettingsProfile = {
  user_id: string;
  pseudonym: string;
  trainer_id: TrainerId;
  interaction_mode: InteractionMode;
};

export type TrainerSettingsChangeEvent = {
  name: "trainer_changed" | "interaction_mode_changed";
  trainerId: TrainerId;
  payload: Record<string, string>;
};

export type TrainerSettingsChange = {
  trainerId: TrainerId;
  interactionMode: InteractionMode;
  events: TrainerSettingsChangeEvent[];
};

export function buildTrainerSettingsChange(
  profile: TrainerSettingsProfile,
  input: {
    trainerId?: TrainerId;
    interactionMode?: InteractionMode;
  },
): TrainerSettingsChange {
  const trainerId = input.trainerId ?? profile.trainer_id;
  const interactionMode = input.interactionMode ?? profile.interaction_mode;
  const events: TrainerSettingsChangeEvent[] = [];

  if (trainerId !== profile.trainer_id) {
    events.push({
      name: "trainer_changed",
      trainerId,
      payload: {
        from_trainer_id: profile.trainer_id,
        to_trainer_id: trainerId,
        final_interaction_mode: interactionMode,
      },
    });
  }
  if (interactionMode !== profile.interaction_mode) {
    events.push({
      name: "interaction_mode_changed",
      trainerId,
      payload: {
        from_interaction_mode: profile.interaction_mode,
        to_interaction_mode: interactionMode,
        final_trainer_id: trainerId,
      },
    });
  }

  return { trainerId, interactionMode, events };
}

export async function persistTrainerSettings(input: {
  db: D1Database;
  profile: TrainerSettingsProfile;
  trainerId?: TrainerId;
  interactionMode?: InteractionMode;
  sessionId: string;
  requestId: string;
  dayIndex: number;
  now?: string;
}) {
  const change = buildTrainerSettingsChange(input.profile, input);
  if (change.events.length === 0) return change;

  const now = input.now ?? new Date().toISOString();
  const statements = [
    input.db
      .prepare(
        "UPDATE trainer_profiles SET trainer_id=?,interaction_mode=? WHERE user_id=?",
      )
      .bind(change.trainerId, change.interactionMode, input.profile.user_id),
    ...prepareCohortAttributionStatements(input.db, {
      userId: input.profile.pseudonym,
      firstEventAt: now,
      now,
    }),
    ...change.events.flatMap((event) => {
      const eventId = `${input.profile.pseudonym}:${event.name}:${input.requestId}`;
      return [
        preparePilotEvent(input.db, {
          id: eventId,
          userId: input.profile.pseudonym,
          sessionId: input.sessionId,
          trainerId: event.trainerId,
          dayIndex: input.dayIndex,
          eventName: event.name,
          payload: event.payload,
          skillCardVersion: null,
          createdAt: now,
        }),
        prepareExportQueueStatement(input.db, {
          eventId,
          userId: input.profile.pseudonym,
          now,
        }),
      ];
    }),
  ];
  await input.db.batch(statements);
  return change;
}
