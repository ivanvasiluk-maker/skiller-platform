import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
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
  status: "working" | "testing" | "uncertain";
};

export type DashboardData = {
  user: { displayName: string; email: string };
  skills: SkillView[];
  protocol: ProtocolItem[];
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
  const [skillRows, evidenceRows, attemptStats, accessRow] = await Promise.all([
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
  ]);

  const attempts = Number(attemptStats[0]?.attempts ?? 0);
  const completions = Number(attemptStats[0]?.completions ?? 0);
  return {
    user: { displayName: user.displayName, email: user.email },
    skills: skillRows.map(toSkillView),
    protocol: evidenceRows.map(({ evidence, skill }) => ({
      skillId: skill.id,
      title: skill.title,
      track: skill.track,
      attempts: evidence.attempts,
      completions: evidence.completions,
      helpfulness: evidence.completions ? Math.round((evidence.helpfulSum / evidence.completions) * 10) / 10 : null,
      goalProgress: evidence.completions ? Math.round((evidence.goalSum / evidence.completions) * 10) / 10 : null,
      relief: evidence.completions ? Math.round((evidence.reliefSum / evidence.completions) * 10) / 10 : null,
      avoidanceCount: evidence.avoidanceCount,
      confidence: evidence.confidence,
      status: evidence.completions >= 3 && evidence.confidence >= 60 ? "working" : evidence.completions >= 1 ? "testing" : "uncertain",
    })),
    stats: { attempts, completions, completionRate: attempts ? Math.round((completions / attempts) * 100) : 0 },
    access: accessRow ?? { sharingEnabled: false, shareProtocol: true, shareAttempts: true, shareNotes: false },
  };
}

export async function recommendSkill(user: ChatGPTUser, input: { kind: string; description: string; intensity: number; risk: string }) {
  await ensureUser(user);
  await ensureSkillCatalog();
  const db = getDb();
  const situationId = crypto.randomUUID();
  const unsafe = input.risk !== "no";
  await db.insert(situations).values({
    id: situationId,
    userId: user.userId,
    kind: input.kind,
    description: input.description.slice(0, 1200),
    intensity: Math.max(1, Math.min(10, input.intensity)),
    safetyStatus: unsafe ? "escalate" : "self-guided",
  });
  if (unsafe) return { situationId, safetyStatus: "escalate" as const, skill: null };

  const skillId = input.kind === "conflict" ? "dear-man" : input.kind === "emotion" || input.intensity >= 8 ? "stop" : "micro-start";
  const skill = await db.select().from(skills).where(and(eq(skills.id, skillId), eq(skills.active, true))).get();
  if (!skill) throw new Error("Skill catalog is unavailable");
  return { situationId, safetyStatus: "self-guided" as const, skill: toSkillView(skill) };
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

export async function updateAccess(user: ChatGPTUser, input: { sharingEnabled: boolean; shareProtocol: boolean; shareAttempts: boolean; shareNotes: boolean }) {
  const db = getDb();
  await ensureUser(user);
  await db.insert(psychologistAccess).values({ userId: user.userId, ...input }).onConflictDoUpdate({
    target: psychologistAccess.userId,
    set: { ...input, updatedAt: sql`CURRENT_TIMESTAMP` },
  });
  return input;
}
