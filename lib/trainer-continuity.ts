import {
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
  decision_reason_code: OutcomeReasonCode;
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
    kind: "repeat" | "transfer" | "resize" | "replace" | "new";
    reasonCode: OutcomeReasonCode;
    reasonExplanation: string;
    prompt: string;
    actionLabel: string;
  } | null;
  gapReturn: {
    currentDay: number;
    lastEngagedDay: number;
    missedDays: number;
    planId: string | null;
    skillTitle: string | null;
    entryMode: string;
    safetyBlocked: boolean;
    prompt: string;
    actionLabel: string;
  } | null;
  nextCheckAt: string | null;
};

type ContinuityContext = {
  day?: number;
  startedAt?: string;
  safetyAllowsPractice?: boolean;
  engagedDays?: number[];
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

const decisionReasonExplanations: Record<OutcomeReasonCode, string> = {
  [OUTCOME_REASON_CODES.repeatHelpful]:
    "Сохранённое решение предлагает ещё раз проверить этот навык в похожей ситуации.",
  [OUTCOME_REASON_CODES.transferHelpful]:
    "Сохранённое решение предлагает проверить перенос навыка в новый совместимый контекст.",
  [OUTCOME_REASON_CODES.resizeAfterFailed]:
    "Сохранённое решение предлагает уменьшить шаг перед следующей попыткой.",
  [OUTCOME_REASON_CODES.replaceLowFit]:
    "Сохранённое решение не поддерживает автоматический повтор и предлагает другой навык.",
  [OUTCOME_REASON_CODES.firstTry]:
    "В сохранённом решении нет основания для автоматического повтора: это новая проверка.",
};

export function explainDecisionReason(reasonCode: OutcomeReasonCode) {
  return decisionReasonExplanations[reasonCode];
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
        ? `Вчера по действию «${plan.skill_title}» Вы отметили: ${outcomeLabel(plan.result)}${score}. Что помешало по факту?`
        : `Вчера по действию «${plan.skill_title}» Вы отметили: ${outcomeLabel(plan.result)}${score}. Что изменилось после этого шага по факту?`,
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

  const decision = current.decision_reason_code;

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
    reasonExplanation: explainDecisionReason(decision),
  };

  if (decision === OUTCOME_REASON_CODES.repeatHelpful) {
    return {
      ...base,
      kind: "repeat",
      prompt: `${savedFact} Это основание проверить навык ещё раз, но не доказательство, что он работает всегда. Опиши похожий эпизод — сначала проверим безопасность и совместимость.`,
      actionLabel: "Проверить в похожей ситуации",
    };
  }
  if (decision === OUTCOME_REASON_CODES.transferHelpful) {
    return {
      ...base,
      kind: "transfer",
      prompt: `${savedFact} Это основание проверить перенос навыка в новый контекст, но не доказательство, что он работает везде. Опиши новый эпизод — сначала проверим безопасность и совместимость.`,
      actionLabel: "Проверить в новом контексте",
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

function engagementGap(
  currentDay: number,
  engagedDays: number[] = [],
) {
  if (currentDay <= 2 || engagedDays.includes(currentDay)) return null;
  const priorDays = [1, ...engagedDays].filter(
    (day) => day >= 1 && day < currentDay,
  );
  const lastEngagedDay = Math.max(...priorDays);
  const missedDays = currentDay - lastEngagedDay - 1;
  return missedDays > 0 ? { lastEngagedDay, missedDays } : null;
}

export function missedDaysFromEngagement(
  currentDay: number,
  engagedDays: number[] = [],
) {
  return engagementGap(currentDay, engagedDays)?.missedDays ?? 0;
}

function gapDayLabel(days: number) {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${days} дня`;
  }
  return `${days} дней`;
}

function buildGapReturn(
  current: ContinuityPlan | null,
  openLoop: TrainerContinuity["openLoop"],
  context: ContinuityContext,
): TrainerContinuity["gapReturn"] {
  if (context.day === undefined) return null;
  const gap = engagementGap(context.day, context.engagedDays);
  if (!gap) return null;

  const base = {
    currentDay: context.day,
    lastEngagedDay: gap.lastEngagedDay,
    missedDays: gap.missedDays,
    planId: current?.id ?? null,
    skillTitle: current?.skill_title ?? null,
    entryMode: current?.entry_mode ?? "stuck",
  };
  const pause = gapDayLabel(gap.missedDays);

  if (context.safetyAllowsPractice === false) {
    return {
      ...base,
      safetyBlocked: true,
      prompt: `Ты вернулся после перерыва в ${pause}. Прогресс и сохранённые результаты на месте. Сначала спокойно проверим безопасность, затем решим, продолжать ли практику.`,
      actionLabel: "Проверить безопасность",
    };
  }

  if (openLoop) {
    const next =
      openLoop.kind === "failed"
        ? "Сохранённый результат остаётся на месте: можно уменьшить шаг или выбрать другой навык."
        : `Сохранённое действие «${openLoop.skillTitle}» всё ещё ждёт фактического результата.`;
    return {
      ...base,
      planId: openLoop.planId,
      skillTitle: openLoop.skillTitle,
      entryMode: openLoop.entryMode,
      safetyBlocked: false,
      prompt: `Ты вернулся после перерыва в ${pause}. Ничего не сброшено. ${next} Продолжим без штрафа и без попытки догонять дни.`,
      actionLabel: openLoop.actionLabel,
    };
  }

  if (current?.result) {
    const score =
      current.helpfulness === null
        ? "полезность не оценена"
        : `полезность — ${current.helpfulness}/10`;
    return {
      ...base,
      safetyBlocked: false,
      prompt: `Вы вернулись после перерыва в ${pause}. Ничего не сброшено: для «${current.skill_title}» сохранено «${outcomeLabel(current.result)}», ${score}. Продолжим с текущей точки, без попытки догонять дни.`,
      actionLabel: "Продолжить с текущей точки",
    };
  }

  return {
    ...base,
    safetyBlocked: false,
    prompt: `Ты вернулся после перерыва в ${pause}. Профиль и день программы сохранены. Начнём с текущей точки, без штрафа и без попытки догонять дни.`,
    actionLabel: "Продолжить",
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
    gapReturn: buildGapReturn(current, openLoop, context),
    nextCheckAt:
      current && current.result === null ? nextCheckAt(current.created_at) : null,
  };
}
