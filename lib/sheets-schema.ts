// Схема вкладок Google Sheets mirror (Этап 3, задача «Создать вкладки USERS, EVENTS,
// DAILY, FEEDBACK, COHORTS»). Только псевдонимизированные аналитические данные:
// pseudonym вместо email/имени, без текстов разговоров и заметок.

export type SheetCell = string | number | null;

export const SHEET_TABS = ["USERS", "EVENTS", "DAILY", "FEEDBACK", "COHORTS"] as const;
export type SheetTab = (typeof SHEET_TABS)[number];

/** Колонки листа EVENTS — плоский слепок минимизированного payload события. */
export const EVENTS_COLUMNS = [
  "event_id",
  "created_at",
  "cohort_key",
  "user_id",
  "event_name",
  "day_index",
  "product_version",
  "character_version",
  "skill_card_version",
  "skill_id",
  "decision_reason_code",
  "helpfulness",
  "completed",
  "avoidance",
  "understood",
  "continue_intent",
  "recap_day",
  "entry_mode",
  "from_trainer_id",
  "to_trainer_id",
  "from_interaction_mode",
  "to_interaction_mode",
] as const;

export const USERS_COLUMNS = [
  "user_id",
  "cohort_key",
  "trainer_id",
  "first_event_at",
] as const;

export const DAILY_COLUMNS = [
  "user_id",
  "cohort_key",
  "day_index",
  "engaged",
  "actions_started",
  "actions_completed",
] as const;

export const FEEDBACK_COLUMNS = [
  "user_id",
  "cohort_key",
  "day_index",
  "helpfulness",
  "understood",
  "continue_intent",
  "created_at",
] as const;

export const COHORTS_COLUMNS = [
  "cohort_key",
  "product_version",
  "users",
  "d2_engaged",
  "d3_engaged",
  "d7_engaged",
  "actions_started",
  "actions_completed",
] as const;

export type ExportableEventRow = {
  id: string;
  user_id: string;
  session_id: string;
  trainer_id: string;
  day_index: number;
  event_name: string;
  payload_json: string;
  product_version: string;
  created_at: string;
};

function cell(value: unknown): SheetCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  return null;
}

function payloadCell(
  payload: Record<string, string | number | boolean | null>,
  key: string,
): SheetCell {
  return cell(payload[key] ?? null);
}

/** Строка листа EVENTS из события D1 и его минимизированного payload. */
export function buildEventRow(
  event: ExportableEventRow,
  cohortKey: string,
  minimizedPayload: Record<string, string | number | boolean | null>,
): SheetCell[] {
  return [
    event.id,
    event.created_at,
    cohortKey,
    event.user_id,
    event.event_name,
    event.day_index,
    event.product_version,
    payloadCell(minimizedPayload, "character_version"),
    payloadCell(minimizedPayload, "skill_card_version"),
    payloadCell(minimizedPayload, "skill_id"),
    payloadCell(minimizedPayload, "decision_reason_code"),
    payloadCell(minimizedPayload, "helpfulness"),
    payloadCell(minimizedPayload, "completed"),
    payloadCell(minimizedPayload, "avoidance"),
    payloadCell(minimizedPayload, "understood"),
    payloadCell(minimizedPayload, "continue_intent"),
    payloadCell(minimizedPayload, "recap_day"),
    payloadCell(minimizedPayload, "entry_mode"),
    payloadCell(minimizedPayload, "from_trainer_id"),
    payloadCell(minimizedPayload, "to_trainer_id"),
    payloadCell(minimizedPayload, "from_interaction_mode"),
    payloadCell(minimizedPayload, "to_interaction_mode"),
  ];
}

/** Строка листа FEEDBACK из события feedback_submitted (только числа, без текстов). */
export function buildFeedbackRow(
  event: ExportableEventRow,
  cohortKey: string,
  minimizedPayload: Record<string, string | number | boolean | null>,
): SheetCell[] {
  return [
    event.user_id,
    cohortKey,
    event.day_index,
    payloadCell(minimizedPayload, "helpfulness"),
    payloadCell(minimizedPayload, "understood"),
    payloadCell(minimizedPayload, "continue_intent"),
    event.created_at,
  ];
}

export function buildUserRow(input: {
  userId: string;
  cohortKey: string;
  trainerId: string | null;
  firstEventAt: string;
}): SheetCell[] {
  return [input.userId, input.cohortKey, input.trainerId, input.firstEventAt];
}

export function buildDailyRow(input: {
  userId: string;
  cohortKey: string;
  dayIndex: number;
  engaged: boolean;
  actionsStarted: number;
  actionsCompleted: number;
}): SheetCell[] {
  return [
    input.userId,
    input.cohortKey,
    input.dayIndex,
    input.engaged ? 1 : 0,
    input.actionsStarted,
    input.actionsCompleted,
  ];
}

export function buildCohortRow(input: {
  cohortKey: string;
  productVersion: string;
  users: number;
  d2: number;
  d3: number;
  d7: number;
  actionsStarted: number;
  actionsCompleted: number;
}): SheetCell[] {
  return [
    input.cohortKey,
    input.productVersion,
    input.users,
    input.d2,
    input.d3,
    input.d7,
    input.actionsStarted,
    input.actionsCompleted,
  ];
}

export const SHEET_HEADERS: Record<SheetTab, readonly string[]> = {
  USERS: USERS_COLUMNS,
  EVENTS: EVENTS_COLUMNS,
  DAILY: DAILY_COLUMNS,
  FEEDBACK: FEEDBACK_COLUMNS,
  COHORTS: COHORTS_COLUMNS,
};
