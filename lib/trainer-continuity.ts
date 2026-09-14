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
  nextCheckAt: string | null;
};

function nextCheckAt(createdAt: string) {
  const value = new Date(createdAt).getTime();
  return Number.isFinite(value)
    ? new Date(value + 24 * 60 * 60 * 1000).toISOString()
    : null;
}

export function buildTrainerContinuity(
  plans: ContinuityPlan[],
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
    nextCheckAt:
      current && current.result === null ? nextCheckAt(current.created_at) : null,
  };
}
