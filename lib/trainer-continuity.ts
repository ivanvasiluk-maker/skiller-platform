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
  nextCheckAt: string | null;
};

type ContinuityContext = {
  day?: number;
  startedAt?: string;
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
    nextCheckAt:
      current && current.result === null ? nextCheckAt(current.created_at) : null,
  };
}
