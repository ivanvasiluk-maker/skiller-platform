// Frozen MVP pilot event schema (Этап 3, задача «Зафиксировать event schema»).
// Источник имён: Frozen Spec audit (DoD L) и существующие вызовы в lib/trainer-data.ts,
// lib/trainer-settings.ts. Новые события должны добавляться сюда до записи в D1,
// чтобы schema оставалась единственным реестром обязательных событий пилота.

export const EVENT_SCHEMA_VERSION = "event-schema-v1";

export type PilotEventSpec = {
  name: string;
  description: string;
  /** Ключи, обязательные в payload_json помимо version envelope. */
  requiredPayloadKeys: readonly string[];
};

export const PILOT_EVENT_SPECS: readonly PilotEventSpec[] = [
  { name: "app_open", description: "Пользователь открыл приложение", requiredPayloadKeys: [] },
  { name: "onboarding_started", description: "Начало onboarding", requiredPayloadKeys: [] },
  { name: "trainer_viewed", description: "Экран выбора тренера показан", requiredPayloadKeys: [] },
  { name: "trainer_selected", description: "Тренер выбран", requiredPayloadKeys: [] },
  { name: "onboarding_completed", description: "Onboarding завершён", requiredPayloadKeys: [] },
  { name: "message_sent", description: "Сообщение пользователя", requiredPayloadKeys: [] },
  { name: "chat_started", description: "Начат диалог с тренером", requiredPayloadKeys: [] },
  { name: "free_talk_started", description: "Начат Free Talk", requiredPayloadKeys: [] },
  { name: "distress_flow_started", description: "Пользователь вошёл через режим distress", requiredPayloadKeys: [] },
  { name: "safety_flow_used", description: "Сработал safety route", requiredPayloadKeys: [] },
  { name: "safety_check_completed", description: "Пользователь подтвердил отсутствие опасности", requiredPayloadKeys: [] },
  { name: "situation_confirmed", description: "Ситуация разобрана и подтверждена", requiredPayloadKeys: [] },
  { name: "skill_recommended", description: "Skill Engine выдал рекомендацию", requiredPayloadKeys: ["skill_id"] },
  { name: "action_started", description: "Пользователь начал микро-действие", requiredPayloadKeys: ["skill_id"] },
  { name: "action_completed", description: "Действие выполнено", requiredPayloadKeys: ["skill_id"] },
  { name: "action_rated", description: "Получена оценка результата", requiredPayloadKeys: ["skill_id", "helpfulness"] },
  { name: "action_failed_honest", description: "Честно отмечен невыполненный шаг", requiredPayloadKeys: ["skill_id"] },
  { name: "resize_accepted", description: "Пользователь принял уменьшенный шаг", requiredPayloadKeys: ["skill_id"] },
  { name: "replacement_accepted", description: "Пользователь принял замену навыка", requiredPayloadKeys: ["skill_id"] },
  { name: "recap_shown", description: "Показан recap Day 3/7", requiredPayloadKeys: ["recap_day"] },
  { name: "engaged_return", description: "Возврат с взаимодействием в день N", requiredPayloadKeys: [] },
  { name: "return_D2", description: "Engaged возврат на Day 2", requiredPayloadKeys: [] },
  { name: "return_D3", description: "Engaged возврат на Day 3", requiredPayloadKeys: [] },
  { name: "return_D7", description: "Engaged возврат на Day 7", requiredPayloadKeys: [] },
  { name: "feedback_submitted", description: "Отправлен Day 3/7 feedback", requiredPayloadKeys: ["helpfulness", "understood", "continue_intent"] },
  { name: "trainer_changed", description: "Смена тренера без потери прогресса", requiredPayloadKeys: ["from_trainer_id", "to_trainer_id"] },
  { name: "interaction_mode_changed", description: "Смена interaction mode", requiredPayloadKeys: ["from_interaction_mode", "to_interaction_mode"] },
] as const;

const specByName = new Map(PILOT_EVENT_SPECS.map((spec) => [spec.name, spec]));

export function isPilotEventName(name: string): boolean {
  return specByName.has(name);
}

/** Ключи payload, которые никогда не экспортируются в Sheets (приватность). */
const NON_EXPORTABLE_PAYLOAD_KEYS = new Set([
  "text",
  "note",
  "message",
  "description",
  "main_problem",
  "helptext",
]);

export function exportablePayloadKeys(name: string): readonly string[] {
  const spec = specByName.get(name);
  if (!spec) return [];
  return spec.requiredPayloadKeys.filter((key) => !NON_EXPORTABLE_PAYLOAD_KEYS.has(key));
}
