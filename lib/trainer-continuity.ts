import {
  decideNextStep,
  OUTCOME_REASON_CODES,
  type OutcomeReasonCode,
} from "./outcome-policy.ts";

export type ContinuityPlan = {
  id: string;
  skill_title: string;
  entry_mode: string;
  attempt_id: string | null;
  result: "done" | "failed" | "more" | null;
  helpfulness: number | null;
  created_at: string;
};

export type TrainerContinuity = {
  lastAction: {
    planId: string;
    skillTitle: string;
    started: boolean;
    createdAt: string;
  } | null;
  lastOutcome: {
    planId: string;
    result: "done" | "failed" | "more";
    helpfulness: number | null;
    createdAt: string;
  } | null;
  openLoop: {
    planId: string;
    skillTitle: string;
    entryMode: string;
    kind: "suggested" | "started" | "failed";
    prompt: string;
    actionLabel: string;
  } | null;
  day2CheckIn: {
    planId: string;
    skillTitle: string;
    entryMode: string;
    result: "done" | "failed" | "more" | null;
    prompt: string;
    actionLabel: string;
  } | null;
  days4to6: {
    planId: string;
    skillTitle: string;
    entryMode: string;
    kind: "repeat" | "resize" | "replace" | "new";
    reasonCode: OutcomeReasonCode;
    prompt: string;
    actionLabel: string;
  } | null;
  nextCheckAt: string | null;
};

type ContinuityContext = {
  day?: number;
  startedAt?: string;
  safetyAllowsPractice?: boolean;
};

function timestamp(value: string) {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextCheckAt(createdAt: string) {
  const value = timestamp(createdAt);
  return value === null
    ? null
    : new Date(value + 24 * 60 * 60 * 1000).toISOString();
}

function dayOnePlan(plans: ContinuityPlan[], startedAt?: string) {
  if (!startedAt) return null;
  const started = timestamp(startedAt);
  if (started === null) return null;
  const dayTwoStarts = started + 24 * 60 * 60 * 1000;
  return (
    plans.find((plan) => {
      const created = timestamp(plan.created_at);
      return created !== null && created >= started && created < dayTwoStarts;
    }) ?? null
  );
}

function outcomeLabel(result: NonNullable<ContinuityPlan["result"]>) {
  if (result === "done") return "получилось";
  if (result === "more") return "сделал больше запланированного";
  return "не получилось";
}

function buildDay2CheckIn(
  plans: ContinuityPlan[],
  context: ContinuityContext,
): TrainerContinuity["day2CheckIn"] {
  if (context.day !== 2) return null;
  const plan = dayOnePlan(plans, context.startedAt);
  if (!plan) return null;

  if (plan.result === null) {
    return {
      planId: plan.id,
      skillTitle: plan.skill_title,
      entryMode: plan.entry_mode,
      result: null,
      prompt: `Вчера выбрали действие «${plan.skill_title}». Что получилось по факту: сделал, не получилось или сделал больше?`,
      actionLabel: "Отметить результат",
    };
  }

  const score =
    plan.helpfulness === null ? "" : `, полезность — ${plan.helpfulness}/10`;
  return {
    planId: plan.id,
    skillTitle: plan.skill_title,
    entryMode: plan.entry_mode,
    result: plan.result,
    prompt:
      plan.result === "failed"
        ? `Вчера по действию «${plan.skill_title}» ты отметил: ${outcomeLabel(plan.result)}${score}. Что помешало по факту?`
        : `Вчера по действию «${plan.skill_title}» ты отметил: ${outcomeLabel(plan.result)}${score}. Что изменилось после этого шага по факту?`,
    actionLabel:
      plan.result === "failed" ? "Разобрать и изменить шаг" : "Ответить тренеру",
  };
}

function buildDays4to6(
  plans: ContinuityPlan[],
  context: ContinuityContext,
): TrainerContinuity["days4to6"] {
  if (
    context.day === undefined ||
    context.day < 4 ||
    context.day > 6 ||
    context.safetyAllowsPractice === false
  ) {
    return null;
  }

  const current = plans[0] ?? null;
  if (!current || current.result === null) return null;

  const decision = decideNextStep({
    safetyAllowsPractice: true,
    hasCompatibleEvidence: true,
    completed: current.result !== "failed",
    helpfulness: current.helpfulness,
    avoidanceIncreased: false,
  });
  if (!decision) return null;

  const score =
    current.helpfulness === null
      ? "полезность не оценена"
      : `полезность — ${current.helpfulness}/10`;
  const savedFact = `Последний сохранённый результат для «${current.skill_title}»: ${outcomeLabel(current.result)}, ${score}.`;
  const base = {
    planId: current.id,
    skillTitle: current.skill_title,
    entryMode: current.entry_mode,
    reasonCode: decision,
  };

  if (decision === OUTCOME_REASON_CODES.repeatHelpful) {
    return {
      ...base,
      kind: "repeat",
      prompt: `${savedFact} Это основание проверить навык ещё раз, но не доказательство, что он работает всегда. Опиши похожий эпизод — сначала проверим безопасность и совместимость.`,
      actionLabel: "Проверить в похожей ситуации",
    };
  }
  if (decision === OUTCOME_REASON_CODES.resizeAfterFailed) {
    return {
      ...base,
      kind: "resize",
      prompt: `${savedFact} Можно проверить более маленький первый шаг. Опиши текущий эпизод — тренер не будет повторять прежний размер автоматически.`,
      actionLabel: "Уменьшить следующий шаг",
    };
  }
  if (decision === OUTCOME_REASON_CODES.replaceLowFit) {
    return {
      ...base,
      kind: "replace",
      prompt: `${savedFact} Автоматически повторять этот навык не будем. Опиши текущий эпизод, чтобы подобрать безопасную альтернативу.`,
      actionLabel: "Подобрать другой навык",
    };
  }
  return {
    ...base,
    kind: "new",
    prompt: `${savedFact} Данных недостаточно для автоматического повтора. Разберём текущий эпизод как новый и снова проверим результат.`,
    actionLabel: "Разобрать новый эпизод",
  };
}

export function buildTrainerContinuity(
  plans: ContinuityPlan[],
  context: ContinuityContext = {},
): TrainerContinuity {
  const current = plans[0] ?? null;
  const outcome = plans.find((plan) => plan.result !== null) ?? null;
  let openLoop: TrainerContinuity["openLoop"] = null;

  if (current?.result === "failed") {
    openLoop = {
      planId: current.id,
      skillTitle: current.skill_title,
      entryMode: current.entry_mode,
      kind: "failed",
      prompt:
        "В прошлый раз действие не получилось. Можно уменьшить его до первого шага или выбрать другой навык.",
      actionLabel: "Изменить шаг",
    };
  } else if (current && current.result === null) {
    const started = Boolean(current.attempt_id);
    openLoop = {
      planId: current.id,
      skillTitle: current.skill_title,
      entryMode: current.entry_mode,
      kind: started ? "started" : "suggested",
      prompt: started
        ? "Ты уже начал это действие. Вернёмся и честно отметим, чем закончилась попытка."
        : "Этот шаг уже выбран и сохранён. Можно вернуться к нему без нового разбора ситуации.",
      actionLabel: started ? "Отметить результат" : "Открыть действие",
    };
  }

  return {
    lastAction: current
      ? {
          planId: current.id,
          skillTitle: current.skill_title,
          started: Boolean(current.attempt_id),
          createdAt: current.created_at,
        }
      : null,
    lastOutcome: outcome?.result
      ? {
          planId: outcome.id,
          result: outcome.result,
          helpfulness: outcome.helpfulness,
          createdAt: outcome.created_at,
        }
      : null,
    openLoop,
    day2CheckIn: buildDay2CheckIn(plans, context),
    days4to6: buildDays4to6(plans, context),
    nextCheckAt:
      current && current.result === null ? nextCheckAt(current.created_at) : null,
  };
}
