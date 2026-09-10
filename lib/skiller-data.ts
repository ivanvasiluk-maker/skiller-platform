import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  delayedOutcomes,
  onboardingProfiles,
  outcomes,
  personalSkillEvidence,
  psychologistAccess,
  skillAttempts,
  skills,
  situations,
  users,
} from "@/db/schema";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

export type SkillStep = { title: string; copy: string };
export type SkillView = {
  id: string;
  title: string;
  approach: string;
  track: string;
  description: string;
  why: string;
  durationSeconds: number;
  steps: SkillStep[];
};

export type ProtocolItem = {
  skillId: string;
  title: string;
  track: string;
  attempts: number;
  completions: number;
  helpfulness: number | null;
  goalProgress: number | null;
  relief: number | null;
  avoidanceCount: number;
  confidence: number;
  delayedFollowups: number;
  contextCount: number;
  status: "working" | "testing" | "uncertain";
};

export type OnboardingProfile = {
  focus: string;
  goal: string;
  practiceStyle: string;
  supportMode: string;
  safetyAcknowledged: boolean;
};

export type HistoryItem = {
  attemptId: string;
  skillTitle: string;
  track: string;
  situationKind: string | null;
  mode: string;
  completedAt: string;
  immediate: { reliefDelta: number; goalProgress: number; helpfulness: number; avoidance: boolean; note: string } | null;
  delayed: { goalProgress: number; helpfulness: number; avoidance: boolean; note: string; createdAt: string } | null;
};

export type PendingCheckIn = {
  attemptId: string;
  skillTitle: string;
  completedAt: string;
  immediateGoalProgress: number;
};

export type DashboardData = {
  user: { displayName: string; email: string };
  skills: SkillView[];
  protocol: ProtocolItem[];
  onboarding: OnboardingProfile | null;
  suggestedSkillId: string;
  pendingCheckIn: PendingCheckIn | null;
  history: HistoryItem[];
  suggestedSkillId: string;
  pendingCheckIn: PendingCheckIn | null;
  history: HistoryItem[];
  stats: { attempts: number; completions: number; completionRate: number };
  access: { sharingEnabled: boolean; shareProtocol: boolean; shareAttempts: boolean; shareNotes: boolean };
};

const seedSkills = [
  {
    id: "micro-start",
    title: "Минимальный законченный старт",
    approach: "CBT · поведенческий навык",
    track: "Работа и фокус",
    description: "Сведите вход в задачу к действию, которое оставит наблюдаемый след и займёт не больше двух минут.",
    why: "Снижает сложность входа, но сохраняет движение к важной задаче.",
    durationSeconds: 120,
    stepsJson: JSON.stringify([
      { title: "Назовите след", copy: "Что должно остаться после действия?" },
      { title: "Уменьшите до двух минут", copy: "Оставьте только начало, которое можно увидеть." },
      { title: "Сделайте без улучшения", copy: "Цель — проверить вход, а не закончить задачу." },
    ]),
  },
  {
    id: "stop",
    title: "STOP перед действием",
    approach: "DBT · стабилизация",
    track: "Стабилизация",
    description: "Создайте короткую паузу между импульсом и действием, не требуя от себя немедленно успокоиться.",
    why: "Возвращает возможность выбирать действие, когда эмоция уже сильная.",
    durationSeconds: 90,
    stepsJson: JSON.stringify([
      { title: "Стоп", copy: "Не отвечайте и не продолжайте действие несколько секунд." },
      { title: "Шаг назад", copy: "Отодвиньтесь, выдохните или положите телефон." },
      { title: "Наблюдайте и действуйте", copy: "Назовите импульс и выберите шаг, который не ухудшит ситуацию." },
    ]),
  },
  {
    id: "dear-man",
    title: "Просьба без оправданий",
    approach: "DBT · межличностная эффективность",
    track: "Отношения и границы",
    description: "Сформулируйте факт, просьбу и пользу коротко — без защиты и длинных объяснений.",
    why: "Репетиция до разговора помогает удержать цель и отношения под нагрузкой.",
    durationSeconds: 240,
    stepsJson: JSON.stringify([
      { title: "Опишите факт", copy: "Одно предложение без оценок и чтения мыслей." },
      { title: "Назовите просьбу", copy: "Что конкретно другой человек может сделать?" },
      { title: "Закрепите", copy: "Коротко скажите, чем это поможет вам обоим." },
    ]),
  },
  {
    id: "distract-delay",
    title: "Отложить отвлечение",
    approach: "CBT · управление отвлечением",
    track: "Работа и фокус",
    description: "Запишите отвлекающий импульс и отложите его на короткий, заранее выбранный интервал.",
    why: "Не запрещает отвлечение, но возвращает выбор и сохраняет контакт с задачей.",
    durationSeconds: 120,
    stepsJson: JSON.stringify([
      { title: "Назовите отвлечение", copy: "Куда именно хочется переключиться?" },
      { title: "Запишите", copy: "Сохраните мысль или действие в список «позже»." },
      { title: "Назначьте время", copy: "Вернитесь к задаче на пять минут, затем решите заново." },
    ]),
  },
  {
    id: "check-facts",
    title: "Проверить факты",
    approach: "DBT · регуляция эмоций",
    track: "Эмоции и мышление",
    description: "Отделите наблюдаемые факты от догадок и проверьте, соответствует ли сила эмоции ситуации.",
    why: "Полезно, когда реакцию усиливает интерпретация, которую пока нельзя считать фактом.",
    durationSeconds: 180,
    stepsJson: JSON.stringify([
      { title: "Назовите эмоцию", copy: "Что вы чувствуете и насколько сильно?" },
      { title: "Отделите факты", copy: "Что можно было бы записать на камеру без толкования?" },
      { title: "Проверьте вывод", copy: "Какие ещё объяснения согласуются с фактами?" },
    ]),
  },
  {
    id: "urge-surfing",
    title: "Переждать волну импульса",
    approach: "ACT / mindfulness · работа с импульсом",
    track: "Стабилизация",
    description: "Наблюдайте импульс как меняющуюся волну, не выполняя и не подавляя его автоматически.",
    why: "Создаёт расстояние между позывом и действием, когда борьба с импульсом только усиливает его.",
    durationSeconds: 180,
    stepsJson: JSON.stringify([
      { title: "Найдите ощущение", copy: "Где импульс заметнее всего в теле?" },
      { title: "Следите за волной", copy: "Отмечайте усиление, пик и ослабление без оценки." },
      { title: "Выберите действие", copy: "Что соответствует вашей цели после этой паузы?" },
    ]),
  },
  {
    id: "validate-first",
    title: "Сначала подтвердить понятное",
    approach: "DBT · межличностная эффективность",
    track: "Отношения и границы",
    description: "Перед своей позицией назовите, что в реакции другого человека можно понять, не соглашаясь со всем.",
    why: "Снижает борьбу за правоту и помогает сохранить контакт, если отношения сейчас важнее победы в споре.",
    durationSeconds: 150,
    stepsJson: JSON.stringify([
      { title: "Найдите понятное", copy: "Какая часть реакции логична с точки зрения другого?" },
      { title: "Скажите без «но»", copy: "Одно предложение подтверждения без немедленного возражения." },
      { title: "Добавьте свою цель", copy: "После паузы коротко скажите, чего хотите от разговора." },
    ]),
  },
  {
    id: "grounding-543",
    title: "Вернуться в настоящее",
    approach: "Mindfulness · ориентирование",
    track: "Стабилизация",
    description: "Переведите внимание на конкретные детали вокруг, чтобы восстановить контакт с текущим моментом.",
    why: "Подходит, когда телесное напряжение мешает анализировать ситуацию, но риск не требует экстренной помощи.",
    durationSeconds: 120,
    stepsJson: JSON.stringify([
      { title: "Пять вещей", copy: "Назовите пять предметов, которые видите." },
      { title: "Четыре ощущения", copy: "Заметьте четыре точки контакта тела с опорой или одеждой." },
      { title: "Три звука", copy: "Назовите три звука и затем один безопасный следующий шаг." },
    ]),
  },
] as const;

export async function ensureUser(user: ChatGPTUser) {
  const db = getDb();
  await db
    .insert(users)
    .values({ id: user.userId, email: user.email, displayName: user.displayName })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, displayName: user.displayName, updatedAt: sql`CURRENT_TIMESTAMP` },
    });
}

export async function ensureSkillCatalog() {
  const db = getDb();
  await db.insert(skills).values(seedSkills.map((skill) => ({ ...skill }))).onConflictDoNothing();
}

function toSkillView(row: typeof skills.$inferSelect): SkillView {
  return { ...row, steps: JSON.parse(row.stepsJson) as SkillStep[] };
}

export async function loadDashboard(user: ChatGPTUser): Promise<DashboardData> {
  await ensureUser(user);
  await ensureSkillCatalog();
  const db = getDb();
  const [skillRows, evidenceRows, attemptStats, accessRow, onboardingRow, historyRows, evidenceContextRows] = await Promise.all([
    db.select().from(skills).where(eq(skills.active, true)),
    db
      .select({ evidence: personalSkillEvidence, skill: skills })
      .from(personalSkillEvidence)
      .innerJoin(skills, eq(personalSkillEvidence.skillId, skills.id))
      .where(eq(personalSkillEvidence.userId, user.userId))
      .orderBy(desc(personalSkillEvidence.confidence), desc(personalSkillEvidence.lastUsedAt)),
    db
      .select({
        attempts: sql<number>`count(*)`,
        completions: sql<number>`sum(case when ${skillAttempts.status} = 'completed' then 1 else 0 end)`,
      })
      .from(skillAttempts)
      .where(eq(skillAttempts.userId, user.userId)),
    db.select().from(psychologistAccess).where(eq(psychologistAccess.userId, user.userId)).get(),
    db.select().from(onboardingProfiles).where(eq(onboardingProfiles.userId, user.userId)).get(),
    db
      .select({
        attemptId: skillAttempts.id,
        skillId: skillAttempts.skillId,
        skillTitle: skills.title,
        track: skills.track,
        situationKind: situations.kind,
        mode: skillAttempts.mode,
        completedAt: skillAttempts.completedAt,
        reliefDelta: outcomes.reliefDelta,
        immediateGoalProgress: outcomes.goalProgress,
        immediateHelpfulness: outcomes.helpfulness,
        immediateAvoidance: outcomes.avoidance,
        immediateNote: outcomes.note,
        delayedGoalProgress: delayedOutcomes.goalProgress,
        delayedHelpfulness: delayedOutcomes.helpfulness,
        delayedAvoidance: delayedOutcomes.avoidance,
        delayedNote: delayedOutcomes.note,
        delayedCreatedAt: delayedOutcomes.createdAt,
      })
      .from(skillAttempts)
      .innerJoin(skills, eq(skillAttempts.skillId, skills.id))
      .leftJoin(situations, eq(skillAttempts.situationId, situations.id))
      .leftJoin(outcomes, eq(skillAttempts.id, outcomes.attemptId))
      .leftJoin(delayedOutcomes, eq(skillAttempts.id, delayedOutcomes.attemptId))
      .where(and(eq(skillAttempts.userId, user.userId), eq(skillAttempts.status, "completed")))
      .orderBy(desc(skillAttempts.completedAt))
      .limit(40),
    db
      .select({
        skillId: skillAttempts.skillId,
        contextCount: sql<number>`count(distinct coalesce(${situations.kind}, ${skillAttempts.mode}))`,
        delayedFollowups: sql<number>`sum(case when ${delayedOutcomes.id} is not null then 1 else 0 end)`,
        delayedGoalSum: sql<number>`sum(coalesce(${delayedOutcomes.goalProgress}, 0))`,
        delayedHelpfulSum: sql<number>`sum(coalesce(${delayedOutcomes.helpfulness}, 0))`,
        delayedAvoidanceCount: sql<number>`sum(case when ${delayedOutcomes.avoidance} = 1 then 1 else 0 end)`,
      })
      .from(skillAttempts)
      .leftJoin(situations, eq(skillAttempts.situationId, situations.id))
      .leftJoin(delayedOutcomes, eq(skillAttempts.id, delayedOutcomes.attemptId))
      .where(and(eq(skillAttempts.userId, user.userId), eq(skillAttempts.status, "completed")))
      .groupBy(skillAttempts.skillId),
  ]);

  const attempts = Number(attemptStats[0]?.attempts ?? 0);
  const completions = Number(attemptStats[0]?.completions ?? 0);
  const contextBySkill = new Map(evidenceContextRows.map((row) => [row.skillId, {
    contextCount: Number(row.contextCount ?? 0),
    delayedFollowups: Number(row.delayedFollowups ?? 0),
    delayedGoalSum: Number(row.delayedGoalSum ?? 0),
    delayedHelpfulSum: Number(row.delayedHelpfulSum ?? 0),
    delayedAvoidanceCount: Number(row.delayedAvoidanceCount ?? 0),
  }]));
  const history: HistoryItem[] = historyRows.filter((row) => row.completedAt).map((row) => ({
    attemptId: row.attemptId,
    skillTitle: row.skillTitle,
    track: row.track,
    situationKind: row.situationKind,
    mode: row.mode,
    completedAt: row.completedAt!,
    immediate: row.immediateGoalProgress === null ? null : {
      reliefDelta: Number(row.reliefDelta ?? 0),
      goalProgress: Number(row.immediateGoalProgress),
      helpfulness: Number(row.immediateHelpfulness ?? 0),
      avoidance: Boolean(row.immediateAvoidance),
      note: row.immediateNote ?? "",
    },
    delayed: row.delayedGoalProgress === null ? null : {
      goalProgress: Number(row.delayedGoalProgress),
      helpfulness: Number(row.delayedHelpfulness ?? 0),
      avoidance: Boolean(row.delayedAvoidance),
      note: row.delayedNote ?? "",
      createdAt: row.delayedCreatedAt ?? row.completedAt!,
    },
  }));
  const pendingRow = history.find((item) => !item.delayed && Date.now() - Date.parse(item.completedAt) >= 6 * 60 * 60 * 1000);
  const focusSkill: Record<string, string> = {
    start: "micro-start",
    emotions: "check-facts",
    relationships: "validate-first",
    impulses: "urge-surfing",
    loneliness: "dear-man",
  };
  return {
    user: { displayName: user.displayName, email: user.email },
    skills: skillRows.map(toSkillView),
    protocol: evidenceRows.map(({ evidence, skill }) => {
      const context = contextBySkill.get(skill.id) ?? { contextCount: 0, delayedFollowups: 0, delayedGoalSum: 0, delayedHelpfulSum: 0, delayedAvoidanceCount: 0 };
      const immediateQuality = evidence.completions ? ((evidence.helpfulSum + evidence.goalSum) / evidence.completions / 20) * 28 : 0;
      const evidenceStrength = Math.min(32, evidence.completions * 10);
      const contextStrength = Math.min(15, context.contextCount * 5);
      const delayedQuality = context.delayedFollowups ? ((context.delayedGoalSum + context.delayedHelpfulSum) / context.delayedFollowups / 20) * 25 : 0;
      const avoidancePenalty = evidence.completions ? (evidence.avoidanceCount / evidence.completions) * 15 : 0;
      const delayedPenalty = context.delayedFollowups ? (context.delayedAvoidanceCount / context.delayedFollowups) * 20 : 0;
      let confidence = Math.round(evidenceStrength + immediateQuality + contextStrength + delayedQuality - avoidancePenalty - delayedPenalty);
      if (!context.delayedFollowups) confidence = Math.min(59, confidence);
      confidence = Math.max(0, Math.min(100, confidence));
      return {
        skillId: skill.id,
        title: skill.title,
        track: skill.track,
        attempts: evidence.attempts,
        completions: evidence.completions,
        helpfulness: evidence.completions ? Math.round((evidence.helpfulSum / evidence.completions) * 10) / 10 : null,
        goalProgress: evidence.completions ? Math.round((evidence.goalSum / evidence.completions) * 10) / 10 : null,
        relief: evidence.completions ? Math.round((evidence.reliefSum / evidence.completions) * 10) / 10 : null,
        avoidanceCount: evidence.avoidanceCount,
        confidence,
        delayedFollowups: context.delayedFollowups,
        contextCount: context.contextCount,
        status: evidence.completions >= 3 && context.delayedFollowups >= 1 && confidence >= 60 ? "working" : evidence.completions >= 1 ? "testing" : "uncertain",
      };
    }).sort((a, b) => b.confidence - a.confidence),
    onboarding: onboardingRow ? {
      focus: onboardingRow.focus,
      goal: onboardingRow.goal,
      practiceStyle: onboardingRow.practiceStyle,
      supportMode: onboardingRow.supportMode,
      safetyAcknowledged: onboardingRow.safetyAcknowledged,
    } : null,
    suggestedSkillId: focusSkill[onboardingRow?.focus ?? ""] ?? "micro-start",
    pendingCheckIn: pendingRow ? {
      attemptId: pendingRow.attemptId,
      skillTitle: pendingRow.skillTitle,
      completedAt: pendingRow.completedAt,
      immediateGoalProgress: pendingRow.immediate?.goalProgress ?? 0,
    } : null,
    history: history.slice(0, 20),
    stats: { attempts, completions, completionRate: attempts ? Math.round((completions / attempts) * 100) : 0 },
    access: accessRow ?? { sharingEnabled: false, shareProtocol: true, shareAttempts: true, shareNotes: false },
  };
}

type RecommendationInput = {
  kind: string;
  description: string;
  firstSignal: string;
  actionUrge: string;
  desiredDirection: string;
  importantGoal: string;
  intensity: number;
  risk: string;
};

function selectSkill(input: RecommendationInput) {
  if (input.intensity >= 8 || input.desiredDirection === "stabilize") {
    return input.firstSignal === "body"
      ? { skillId: "grounding-543", changePoint: "телесное напряжение до анализа", reason: "Сначала нужно вернуть контакт с настоящим, а затем решать проблему." }
      : { skillId: "stop", changePoint: "между импульсом и действием", reason: "При высокой интенсивности важнее восстановить возможность выбирать действие." };
  }
  if (input.kind === "conflict") {
    return input.desiredDirection === "relationship"
      ? { skillId: "validate-first", changePoint: "первые слова в разговоре", reason: "Цель — сохранить контакт, поэтому начинаем с подтверждения понятной части реакции другого." }
      : { skillId: "dear-man", changePoint: "формулировка просьбы", reason: "Сейчас важнее ясно обозначить цель разговора и конкретное действие." };
  }
  if (input.kind === "stuck") {
    return input.actionUrge === "distract"
      ? { skillId: "distract-delay", changePoint: "момент переключения", reason: "Проблему поддерживает автоматическое отвлечение, поэтому тренируем отсрочку, а не запрет." }
      : { skillId: "micro-start", changePoint: "вход в действие", reason: "Сложность находится перед началом, поэтому уменьшаем первый шаг, сохраняя движение к цели." };
  }
  if (input.firstSignal === "thought") {
    return { skillId: "check-facts", changePoint: "интерпретация ситуации", reason: "Эмоцию усиливает мысль; сначала отделим наблюдаемые факты от предположений." };
  }
  if (input.firstSignal === "urge") {
    return { skillId: "urge-surfing", changePoint: "реакция на импульс", reason: "Нужно переждать волну импульса, не подавляя её и не действуя автоматически." };
  }
  return { skillId: "grounding-543", changePoint: "возвращение внимания", reason: "Сначала восстанавливаем контакт с настоящим, затем выбираем действие по цели." };
}

export async function recommendSkill(user: ChatGPTUser, input: RecommendationInput) {
  await ensureUser(user);
  await ensureSkillCatalog();
  const db = getDb();
  const situationId = crypto.randomUUID();
  const unsafe = input.risk !== "no";
  const selection = unsafe
    ? { skillId: "", changePoint: "проверка безопасности", reason: "При возможном риске автоматический подбор навыков прекращается." }
    : selectSkill(input);
  await db.insert(situations).values({
    id: situationId,
    userId: user.userId,
    kind: input.kind,
    description: input.description.slice(0, 1200),
    firstSignal: input.firstSignal,
    actionUrge: input.actionUrge,
    desiredDirection: input.desiredDirection,
    importantGoal: input.importantGoal.slice(0, 500),
    changePoint: selection.changePoint,
    recommendationReason: selection.reason,
    intensity: Math.max(1, Math.min(10, input.intensity)),
    safetyStatus: unsafe ? "escalate" : "self-guided",
  });
  if (unsafe) return { situationId, safetyStatus: "escalate" as const, skill: null };

  const skill = await db.select().from(skills).where(and(eq(skills.id, selection.skillId), eq(skills.active, true))).get();
  if (!skill) throw new Error("Skill catalog is unavailable");
  return { situationId, safetyStatus: "self-guided" as const, skill: toSkillView(skill), changePoint: selection.changePoint, reason: selection.reason };
}

export async function startAttempt(user: ChatGPTUser, input: { skillId: string; situationId?: string; mode: string }) {
  await ensureUser(user);
  await ensureSkillCatalog();
  const id = crypto.randomUUID();
  await getDb().insert(skillAttempts).values({
    id,
    userId: user.userId,
    skillId: input.skillId,
    situationId: input.situationId || null,
    mode: input.mode === "help" ? "help" : "practice",
  });
  return { attemptId: id };
}

export async function completeAttempt(user: ChatGPTUser, input: { attemptId: string; reliefDelta: number; goalProgress: number; helpfulness: number; avoidance: boolean; note?: string }) {
  const db = getDb();
  const attempt = await db
    .select()
    .from(skillAttempts)
    .where(and(eq(skillAttempts.id, input.attemptId), eq(skillAttempts.userId, user.userId)))
    .get();
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.status === "completed") return loadDashboard(user);

  const completedAt = new Date().toISOString();
  const relief = Math.max(-5, Math.min(5, input.reliefDelta));
  const goal = Math.max(0, Math.min(10, input.goalProgress));
  const helpful = Math.max(0, Math.min(10, input.helpfulness));
  const avoidanceAdd = input.avoidance ? 1 : 0;
  const confidenceAdd = Math.max(6, Math.round((helpful + goal) / 2));

  await db.batch([
    db.update(skillAttempts).set({ status: "completed", completedAt }).where(eq(skillAttempts.id, attempt.id)),
    db.insert(outcomes).values({
      id: crypto.randomUUID(),
      attemptId: attempt.id,
      userId: user.userId,
      reliefDelta: relief,
      goalProgress: goal,
      helpfulness: helpful,
      avoidance: input.avoidance,
      note: (input.note ?? "").slice(0, 800),
    }).onConflictDoNothing(),
    db.insert(personalSkillEvidence).values({
      userId: user.userId,
      skillId: attempt.skillId,
      attempts: 1,
      completions: 1,
      helpfulSum: helpful,
      goalSum: goal,
      reliefSum: relief,
      avoidanceCount: avoidanceAdd,
      confidence: Math.min(100, confidenceAdd),
      lastUsedAt: completedAt,
    }).onConflictDoUpdate({
      target: [personalSkillEvidence.userId, personalSkillEvidence.skillId],
      set: {
        attempts: sql`${personalSkillEvidence.attempts} + 1`,
        completions: sql`${personalSkillEvidence.completions} + 1`,
        helpfulSum: sql`${personalSkillEvidence.helpfulSum} + ${helpful}`,
        goalSum: sql`${personalSkillEvidence.goalSum} + ${goal}`,
        reliefSum: sql`${personalSkillEvidence.reliefSum} + ${relief}`,
        avoidanceCount: sql`${personalSkillEvidence.avoidanceCount} + ${avoidanceAdd}`,
        confidence: sql`min(100, ${personalSkillEvidence.confidence} + ${confidenceAdd})`,
        lastUsedAt: completedAt,
      },
    }),
  ]);
  return loadDashboard(user);
}

export async function completeDelayedCheckIn(user: ChatGPTUser, input: { attemptId: string; goalProgress: number; helpfulness: number; avoidance: boolean; note?: string }) {
  const db = getDb();
  const attempt = await db
    .select()
    .from(skillAttempts)
    .where(and(eq(skillAttempts.id, input.attemptId), eq(skillAttempts.userId, user.userId), eq(skillAttempts.status, "completed")))
    .get();
  if (!attempt) throw new Error("Завершённая практика не найдена");

  await db.insert(delayedOutcomes).values({
    id: crypto.randomUUID(),
    attemptId: attempt.id,
    userId: user.userId,
    goalProgress: Math.max(0, Math.min(10, input.goalProgress)),
    helpfulness: Math.max(0, Math.min(10, input.helpfulness)),
    avoidance: input.avoidance,
    note: (input.note ?? "").slice(0, 800),
  }).onConflictDoNothing();
  return loadDashboard(user);
}

export async function completeOnboarding(user: ChatGPTUser, input: OnboardingProfile) {
  const focuses = new Set(["start", "emotions", "relationships", "impulses", "loneliness"]);
  const practiceStyles = new Set(["short", "guided", "mixed"]);
  const supportModes = new Set(["solo", "own_psychologist", "specialist_later"]);
  if (!focuses.has(input.focus)) throw new Error("Выберите основную трудность");
  if (input.goal.trim().length < 5) throw new Error("Опишите желаемое изменение чуть конкретнее");
  if (!practiceStyles.has(input.practiceStyle) || !supportModes.has(input.supportMode)) throw new Error("Проверьте ответы онбординга");
  if (!input.safetyAcknowledged) throw new Error("Подтвердите границы самостоятельной практики");

  await ensureUser(user);
  const profile = {
    userId: user.userId,
    focus: input.focus,
    goal: input.goal.trim().slice(0, 500),
    practiceStyle: input.practiceStyle,
    supportMode: input.supportMode,
    safetyAcknowledged: true,
  };
  await getDb().insert(onboardingProfiles).values(profile).onConflictDoUpdate({
    target: onboardingProfiles.userId,
    set: { ...profile, updatedAt: sql`CURRENT_TIMESTAMP` },
  });
  return loadDashboard(user);
}

export async function updateAccess(user: ChatGPTUser, input: { sharingEnabled: boolean; shareProtocol: boolean; shareAttempts: boolean; shareNotes: boolean }) {
  const db = getDb();
  await ensureUser(user);
  await db.insert(psychologistAccess).values({ userId: user.userId, ...input }).onConflictDoUpdate({
    target: psychologistAccess.userId,
    set: { ...input, updatedAt: sql`CURRENT_TIMESTAMP` },
  });
  return input;
}
