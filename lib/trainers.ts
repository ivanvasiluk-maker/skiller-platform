export const PRODUCT_VERSION = "frozen-mvp-1.0";
// Версия поведения персонажей = версия Character Bible (lib/character-bible.ts).
export const CHARACTER_VERSION = "1.1";
export const trainers = {
  marsha: {
    name: "Марша", initial: "М", color: "#31796a", background: "#e7f1eb", symbol: "◡",
    title: "Тепло. Опора. Маленький шаг.",
    description: "Помогу снизить давление и найти действие, которое сейчас по силам.",
    greeting: "Давай начнём с того, что сейчас непросто. Не нужно сразу справляться со всем.",
    success: "Вы попробовали — и у нас есть реальный результат. Давайте бережно посмотрим, что помогло.",
    failure: "Этот шаг сейчас не подошёл. Это информация, а не повод ругать себя. Сделаем его меньше?",
    return: "Можно продолжить с текущего места. Пропуск не обнуляет сделанное.",
    prompt: "Ты Марша, тёплый устойчивый AI-тренер. Валидируй переживание, не одобряй любое поведение. DBT/CFT: принятие плюс посильное изменение. Короткие мягкие фразы, без сюсюканья. Юмор редкий и добрый, никогда о боли. Ошибка — информация; избегание исследуй без стыда. Не требуй результата ради тебя.",
  },
  beck: {
    name: "Бек", initial: "Б", color: "#526a9a", background: "#e9edf7", symbol: "◇",
    title: "Понять. Проверить. Сделать вывод.",
    description: "Отделим факты от предположений и проверим один небольшой шаг.",
    greeting: "Возьмём один конкретный эпизод. Что произошло и что Вы хотели бы изменить?",
    success: "Есть наблюдаемый результат. Один опыт ещё не доказывает закономерность — можно проверить повторно.",
    failure: "Гипотеза не подтвердилась в этой попытке. Уменьшим шаг или проверим другой вариант.",
    return: "Продолжим исследование. Прошлые наблюдения сохранены, а текущую ситуацию уточним заново.",
    prompt: "Ты Бек, спокойный аналитический AI-тренер. CBT и функциональный анализ. Отделяй факт от мысли и гипотезы. Мотивация через любопытство, маленький эксперимент, проверяемый результат. Не читай лекций. Юмор сухой, редкий, без сарказма к пользователю. Неуспех уточняет гипотезу, не определяет личность.",
  },
  skinny: {
    name: "Скинни", initial: "С", color: "#af603e", background: "#f8ebdf", symbol: "↗",
    title: "Меньше разгона. Больше действия.",
    description: "Найдём конкретный микро-старт и уберём то, что мешает начать.",
    greeting: "Выберем одну задачу, на которой пока не получается продвинуться. Всю жизнь сегодня не перестраиваем — ищем первый шаг.",
    success: "Сделано. Теперь у нас есть факт, а не только план. Проверим, получится ли повторить в похожей ситуации.",
    failure: "Шаг оказался велик или не туда. Уменьшаем. Никакого штрафа за честный результат.",
    return: "Вы вернулись. Берём текущую точку и выбираем следующий посильный шаг.",
    prompt: "Ты Скинни, прямой энергичный AI-тренер действия. Поведенческая активация, shaping, микро-старт, управление отвлечениями. Короткие конкретные фразы. Лёгкая ирония только о ситуации, не о человеке. Никаких приказов, унижения, стыда, агрессии или обесценивания. Сопротивление — сигнал уменьшить нагрузку, а не давить сильнее.",
  },
} as const;
export type TrainerId = keyof typeof trainers;
export const interactionModes = { support: "Поддержи меня", explore: "Давай спокойно разберём", direct: "Говори прямо" } as const;
export type InteractionMode = keyof typeof interactionModes;
export type EntryMode = "practice" | "stuck" | "distress" | "talk";
export type ActionResult = "done" | "failed" | "more";

export function dayIndex(start: string, now = new Date()) {
  const parsed = Date.parse(start.includes("T") ? start : start.replace(" ", "T") + "Z");
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor((now.getTime() - parsed) / 86_400_000) + 1);
}

// Conservative routing, not a clinical risk assessment. Explicit uncertainty also stops skills.
export function requiresSafetyRoute(text: string, risk: string = "no") {
  return risk !== "no" || /суицид|самоубий|покончить с собой|убить себя|убью себя|не хочу жить|самоповреж|порезать себя|причинить (?:себе|кому-то) вред|убью (?:его|её|тебя)|передоз|suicid|kill myself|self.harm|overdose/i.test(text);
}

export const safetyMessage = "Сейчас важнее живая помощь. Если есть непосредственная опасность, свяжитесь с местной экстренной службой или попросите человека рядом помочь это сделать. По возможности останьтесь рядом с человеком, которому доверяете, и отойдите от того, чем можно причинить вред. SKILLER не является экстренной службой. Автоматическую практику сейчас остановим.";

export type RecapAttempt = {
  attempt_id: string | null;
  result: ActionResult | null;
  helpfulness: number | null;
  skill_title: string;
  created_at: string;
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function recapResult(result: ActionResult) {
  if (result === "done") return "получилось";
  if (result === "more") return "сделано больше запланированного";
  return "не получилось";
}

function recapTimestamp(value: string) {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstWeekPlans(plans: RecapAttempt[], startedAt?: string) {
  if (!startedAt) return plans;
  const start = recapTimestamp(startedAt);
  if (start === null) return plans;
  const dayEightStarts = start + 7 * 86_400_000;
  return plans.filter((plan) => {
    const created = recapTimestamp(plan.created_at);
    return created !== null && created >= start && created < dayEightStarts;
  });
}

function buildDay7Insight(input: {
  helpful: RecapAttempt[];
  difficult: RecapAttempt[];
  unresolved: RecapAttempt[];
  repeated: string[];
  outcomesRecorded: number;
}) {
  const repeatedTitle = input.repeated[0] ?? null;
  const oneHelpful = input.helpful[0] ?? null;
  const latestDifficult = input.difficult[0] ?? null;
  const openLoop = input.unresolved[0] ?? null;

  let workingHypothesis =
    "За первую неделю пока недостаточно сохранённых outcomes, чтобы выделить рабочий навык.";
  let confidenceLevel: "low" | "limited" = "low";
  let confidence =
    "Низкая уверенность: данных мало или они неполные. Итог описывает только сохранённые самоотчёты и не объясняет причины.";
  let nextExperiment = {
    kind: "first_try" as
      | "transfer"
      | "repeat"
      | "resize"
      | "replace"
      | "close_loop"
      | "first_try",
    title: "Проверить один новый маленький шаг",
    prompt:
      "Выбрать одно посильное действие, выполнить или честно не выполнить его и сохранить outcome с оценкой полезности.",
  };

  if (repeatedTitle) {
    const count = input.helpful.filter(
      (plan) => plan.skill_title === repeatedTitle,
    ).length;
    workingHypothesis = `Рабочая гипотеза: «${repeatedTitle}» может быть для тебя повторяемым полезным шагом. Основание — ${count} сохранённых outcomes с полезностью не ниже 6/10.`;
    confidenceLevel = "limited";
    confidence =
      "Ограниченная уверенность: результат повторился, но это самоотчёт за одну неделю без контрольного сравнения. Совпадение не доказывает причину улучшения.";
    nextExperiment = {
      kind: "transfer",
      title: `Проверить перенос «${repeatedTitle}»`,
      prompt:
        "Использовать навык в другом независимо подходящем типе ситуации и снова сохранить outcome и helpfulness.",
    };
  } else if (oneHelpful) {
    workingHypothesis = `Рабочая гипотеза: «${oneHelpful.skill_title}» стоит проверить повторно. Основание — один завершённый outcome с полезностью ${oneHelpful.helpfulness}/10.`;
    nextExperiment = {
      kind: "repeat",
      title: `Повторить «${oneHelpful.skill_title}»`,
      prompt:
        "Проверить тот же навык в похожей конкретной ситуации и снова отметить фактический результат.",
    };
  } else if (latestDifficult) {
    const lowFit =
      latestDifficult.helpfulness !== null &&
      latestDifficult.helpfulness <= 3;
    const evidence =
      latestDifficult.helpfulness === null
        ? recapResult(latestDifficult.result!)
        : `${recapResult(latestDifficult.result!)}, полезность ${latestDifficult.helpfulness}/10`;
    workingHypothesis = `Рабочая гипотеза: «${latestDifficult.skill_title}» в прежнем виде пока не подтверждён как полезный. Основание — сохранённый outcome: ${evidence}. Причина результата неизвестна.`;
    nextExperiment = lowFit
      ? {
          kind: "replace",
          title: `Подобрать замену для «${latestDifficult.skill_title}»`,
          prompt:
            "В новом конкретном эпизоде выбрать другой безопасный навык и сравнить outcome.",
        }
      : {
          kind: "resize",
          title: `Уменьшить «${latestDifficult.skill_title}»`,
          prompt:
            "Оставить только первый короткий элемент действия и отдельно оценить его результат.",
        };
  } else if (openLoop) {
    workingHypothesis = `По «${openLoop.skill_title}» нельзя сделать вывод: действие сохранено, но фактический outcome неизвестен.`;
    nextExperiment = {
      kind: "close_loop",
      title: `Закрыть результат «${openLoop.skill_title}»`,
      prompt:
        "Сначала отметить, была ли попытка и чем она закончилась; до этого новый вывод не строится.",
    };
  } else if (input.outcomesRecorded > 0) {
    workingHypothesis =
      "За неделю outcomes сохранены, но ни один навык ещё не получил устойчивого полезного сигнала.";
  }

  return {
    workingHypothesis,
    confidenceLevel,
    confidence,
    nextExperiment,
  };
}

export function buildRecap(
  plans: RecapAttempt[],
  eventDays: number[] = [],
  startedAt?: string,
) {
  const scopedPlans = firstWeekPlans(plans, startedAt);
  const attempted = scopedPlans.filter(
    (plan) => Boolean(plan.attempt_id) || plan.result !== null,
  );
  const outcomes = scopedPlans.filter((plan) => plan.result !== null);
  const successful = outcomes.filter(
    (plan) => plan.result === "done" || plan.result === "more",
  );
  const helpful = successful.filter((plan) => (plan.helpfulness ?? 0) >= 6);
  const difficult = outcomes.filter(
    (plan) =>
      plan.result === "failed" ||
      (plan.helpfulness !== null && plan.helpfulness < 4),
  );
  const helpfulSkills = unique(helpful.map((plan) => plan.skill_title));
  const repeated = helpfulSkills.filter(
    (title) =>
      helpful.filter((plan) => plan.skill_title === title).length >= 2,
  );
  const unresolved = scopedPlans.filter((plan) => plan.result === null);
  const missingHelpfulness = outcomes.filter(
    (plan) => plan.helpfulness === null,
  );

  const facts = scopedPlans.map((plan) => {
    if (plan.result === null) {
      return plan.attempt_id
        ? `«${plan.skill_title}»: попытка начата; итог не отмечен.`
        : `«${plan.skill_title}»: действие предложено; неизвестно, была ли попытка.`;
    }
    const helpfulness =
      plan.helpfulness === null
        ? "полезность не оценена"
        : `полезность ${plan.helpfulness}/10`;
    return `«${plan.skill_title}»: ${recapResult(plan.result)}; ${helpfulness}.`;
  });

  const unknown = unique([
    ...unresolved.map(
      (plan) => `Для «${plan.skill_title}» результат пока неизвестен.`,
    ),
    ...missingHelpfulness.map(
      (plan) => `Для «${plan.skill_title}» полезность не оценена.`,
    ),
  ]);

  let next =
    "Сначала выберем одно небольшое действие и сохраним наблюдаемый результат.";
  if (repeated.length) {
    next =
      "Полезность этого навыка отмечена повторно. Следующим отдельным шагом можно проверить его в другом контексте; причина улучшения пока не доказана.";
  } else if (helpful.length) {
    next =
      "Есть одна полезная попытка. Можно повторить тот же посильный шаг в похожей ситуации; одного результата недостаточно для общего вывода.";
  } else if (difficult.length) {
    next =
      "Сохранён неудачный или низко оценённый результат. Следующим шагом можно уменьшить действие или выбрать другой навык.";
  } else if (unresolved.length) {
    next =
      "Сначала отметим фактический итог незакрытого действия. Без результата вывод делать рано.";
  } else if (outcomes.length) {
    next =
      "Результат сохранён, но данных о выраженной полезности пока недостаточно. Уточним оценку перед следующим выводом.";
  }

  return {
    proposed: scopedPlans.length,
    attempts: attempted.length,
    outcomesRecorded: outcomes.length,
    completed: successful.length,
    engagedDays: [...new Set(eventDays)]
      .filter((day) => day >= 1 && day <= 7)
      .sort((a, b) => a - b),
    skills: unique(scopedPlans.map((plan) => plan.skill_title)),
    facts,
    helpful: helpfulSkills,
    difficult: unique(difficult.map((plan) => plan.skill_title)),
    repeated,
    unknown,
    next,
    day7: buildDay7Insight({
      helpful,
      difficult,
      unresolved,
      repeated,
      outcomesRecorded: outcomes.length,
    }),
  };
}
