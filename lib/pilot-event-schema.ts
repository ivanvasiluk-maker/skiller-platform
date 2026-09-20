// Frozen MVP pilot event schema (Этап 3, задача «Зафиксировать event schema»).
// Источник имён: Frozen Spec audit (DoD L) и существующие вызовы в lib/trainer-data.ts,
// lib/trainer-settings.ts. Новые события должны добавляться сюда до записи в D1,
// чтобы schema оставалась единственным реестром обязательных событий пилота.

export const EVENT_SCHEMA_VERSION = "event-schema-v2";

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
  { name: "distress_flow_completed", description: "Distress-практика завершена с замером интенсивности", requiredPayloadKeys: ["skill_id"] },
  { name: "safety_flow_used", description: "Сработал safety route", requiredPayloadKeys: [] },
  { name: "safety_check_completed", description: "Пользователь подтвердил отсутствие опасности", requiredPayloadKeys: [] },
  { name: "situation_submitted", description: "Ситуация отправлена на разбор", requiredPayloadKeys: [] },
  { name: "mechanism_generated", description: "AI выдал разбор поведенческой цепочки", requiredPayloadKeys: [] },
  { name: "skill_recommended", description: "Skill Engine выдал рекомендацию", requiredPayloadKeys: ["skill_id", "decision_reason_code"] },
  { name: "action_started", description: "Пользователь начал микро-действие", requiredPayloadKeys: ["skill_id"] },
  { name: "action_done", description: "Действие выполнено или сделано больше запланированного", requiredPayloadKeys: ["skill_id", "outcome"] },
  { name: "action_failed", description: "Честно отмечен невыполненный шаг", requiredPayloadKeys: ["skill_id", "outcome"] },
  { name: "helpfulness_rated", description: "Получена оценка полезности результата", requiredPayloadKeys: ["skill_id", "score"] },
  { name: "action_resized", description: "Пользователь принял уменьшенный шаг", requiredPayloadKeys: ["skill_id", "decision_reason_code"] },
  { name: "action_replaced", description: "Пользователь принял замену навыка", requiredPayloadKeys: ["skill_id", "decision_reason_code"] },
  { name: "day_completed", description: "День завершён зафиксированным результатом", requiredPayloadKeys: ["skill_id"] },
  { name: "training_completed", description: "Практика в режиме training завершена", requiredPayloadKeys: ["skill_id"] },
  { name: "recap_3d_viewed", description: "Показан recap Day 3", requiredPayloadKeys: [] },
  { name: "recap_7d_viewed", description: "Показан recap Day 7", requiredPayloadKeys: [] },
  { name: "engaged_return", description: "Возврат с взаимодействием в день N", requiredPayloadKeys: [] },
  { name: "return_D2", description: "Engaged возврат на Day 2", requiredPayloadKeys: [] },
  { name: "return_D3", description: "Engaged возврат на Day 3", requiredPayloadKeys: [] },
  { name: "return_D7", description: "Engaged возврат на Day 7", requiredPayloadKeys: [] },
  { name: "feedback_submitted", description: "Отправлен Day 3/7 feedback", requiredPayloadKeys: ["helpfulness", "understood", "continue_intent"] },
  { name: "trainer_changed", description: "Смена тренера без потери прогресса", requiredPayloadKeys: ["from_trainer_id", "to_trainer_id"] },
  { name: "interaction_mode_changed", description: "Смена interaction mode", requiredPayloadKeys: ["from_interaction_mode", "to_interaction_mode"] },
  // PATCH 1.1 — Conversational Relationship Layer. Существующие события не удаляются.
  { name: "conversation_started", description: "Разговор начат после onboarding или входа", requiredPayloadKeys: [] },
  { name: "follow_up_shown", description: "Показан контекстный follow-up по due open loop", requiredPayloadKeys: ["loop_id"] },
  { name: "follow_up_answered", description: "Пользователь ответил на follow-up", requiredPayloadKeys: ["loop_id"] },
  { name: "open_loop_created", description: "Сохранена договорённость (open loop)", requiredPayloadKeys: ["loop_id", "entry_mode"] },
  { name: "open_loop_resolved", description: "Open loop закрыт исходом", requiredPayloadKeys: ["loop_id", "outcome"] },
  { name: "outcome_done", description: "Исход DONE", requiredPayloadKeys: ["loop_id"] },
  { name: "outcome_partial", description: "Исход PARTIAL", requiredPayloadKeys: ["loop_id"] },
  { name: "outcome_not_done", description: "Исход NOT_DONE", requiredPayloadKeys: ["loop_id"] },
  { name: "skill_rejected", description: "Пользователь отклонил рекомендацию", requiredPayloadKeys: ["loop_id", "skill_id"] },
  { name: "missing_link_started", description: "Начат Missing Link Analysis", requiredPayloadKeys: ["loop_id"] },
  { name: "missing_link_completed", description: "Missing Link Analysis завершён", requiredPayloadKeys: ["loop_id"] },
  { name: "chain_analysis_started", description: "Начат Behavioral Chain Analysis", requiredPayloadKeys: ["loop_id"] },
  { name: "chain_analysis_completed", description: "Behavioral Chain Analysis завершён", requiredPayloadKeys: ["loop_id"] },
  { name: "success_factor_identified", description: "Сохранён success factor после DONE", requiredPayloadKeys: ["loop_id"] },
  { name: "voice_message_sent", description: "Голосовое сообщение транскрибировано и отправлено", requiredPayloadKeys: [] },
] as const;

const specByName = new Map(PILOT_EVENT_SPECS.map((spec) => [spec.name, spec]));

export function isPilotEventName(name: string): boolean {
  return specByName.has(name);
}

/**
 * Проверяет, что payload события содержит все обязательные ключи реестра.
 * Пустой набор обязательных ключей трактуется как валидный — само имя события
 * уже проверено вызовом isPilotEventName.
 */
export function eventPayloadComplete(
  name: string,
  payload: Record<string, unknown>,
): boolean {
  const spec = specByName.get(name);
  if (!spec) return false;
  return spec.requiredPayloadKeys.every(
    (key) => payload[key] !== undefined && payload[key] !== null,
  );
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
