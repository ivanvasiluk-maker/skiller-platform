import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const onboardingProfiles = sqliteTable("onboarding_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id),
  focus: text("focus").notNull(),
  goal: text("goal").notNull(),
  practiceStyle: text("practice_style").notNull(),
  supportMode: text("support_mode").notNull(),
  safetyAcknowledged: integer("safety_acknowledged", { mode: "boolean" }).notNull().default(false),
  completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  approach: text("approach").notNull(),
  track: text("track").notNull(),
  description: text("description").notNull(),
  why: text("why").notNull(),
  stepsJson: text("steps_json").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  autonomous: integer("autonomous", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp(),
});

export const situations = sqliteTable(
  "situations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    description: text("description").notNull().default(""),
    confirmedText: text("confirmed_text").notNull().default(""),
    firstSignal: text("first_signal").notNull().default("emotion"),
    actionUrge: text("action_urge").notNull().default("pause"),
    desiredDirection: text("desired_direction").notNull().default("stabilize"),
    importantGoal: text("important_goal").notNull().default(""),
    changePoint: text("change_point").notNull().default("before_action"),
    recommendationReason: text("recommendation_reason").notNull().default(""),
    chainJson: text("chain_json").notNull().default(""),
    aiAnalysisJson: text("ai_analysis_json").notNull().default(""),
    intensity: integer("intensity").notNull(),
    safetyStatus: text("safety_status").notNull(),
    createdAt: timestamp(),
  },
  (table) => [index("idx_situations_user_created").on(table.userId, table.createdAt)],
);

export const skillAttempts = sqliteTable(
  "skill_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    situationId: text("situation_id").references(() => situations.id),
    skillId: text("skill_id").notNull().references(() => skills.id),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("started"),
    startedAt: timestamp(),
    completedAt: text("completed_at"),
  },
  (table) => [index("idx_attempts_user_started").on(table.userId, table.startedAt)],
);

export const outcomes = sqliteTable(
  "outcomes",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull().references(() => skillAttempts.id),
    userId: text("user_id").notNull().references(() => users.id),
    completed: integer("completed", { mode: "boolean" }).notNull().default(true),
    reliefDelta: integer("relief_delta").notNull(),
    goalProgress: integer("goal_progress").notNull(),
    helpfulness: integer("helpfulness").notNull(),
    avoidance: integer("avoidance", { mode: "boolean" }).notNull().default(false),
    note: text("note").notNull().default(""),
    createdAt: timestamp(),
  },
  (table) => [
    uniqueIndex("idx_outcomes_attempt_unique").on(table.attemptId),
    index("idx_outcomes_user_created").on(table.userId, table.createdAt),
  ],
);

export const delayedOutcomes = sqliteTable(
  "delayed_outcomes",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull().references(() => skillAttempts.id),
    userId: text("user_id").notNull().references(() => users.id),
    goalProgress: integer("goal_progress").notNull(),
    helpfulness: integer("helpfulness").notNull(),
    avoidance: integer("avoidance", { mode: "boolean" }).notNull().default(false),
    note: text("note").notNull().default(""),
    createdAt: timestamp(),
  },
  (table) => [
    uniqueIndex("idx_delayed_outcomes_attempt_unique").on(table.attemptId),
    index("idx_delayed_outcomes_user_created").on(table.userId, table.createdAt),
  ],
);

export const personalSkillEvidence = sqliteTable(
  "personal_skill_evidence",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().references(() => users.id),
    skillId: text("skill_id").notNull().references(() => skills.id),
    attempts: integer("attempts").notNull().default(0),
    completions: integer("completions").notNull().default(0),
    helpfulSum: integer("helpful_sum").notNull().default(0),
    goalSum: integer("goal_sum").notNull().default(0),
    reliefSum: integer("relief_sum").notNull().default(0),
    avoidanceCount: integer("avoidance_count").notNull().default(0),
    confidence: integer("confidence").notNull().default(0),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    uniqueIndex("idx_evidence_user_skill_unique").on(table.userId, table.skillId),
    index("idx_evidence_user_confidence").on(table.userId, table.confidence),
  ],
);

export const psychologistAccess = sqliteTable("psychologist_access", {
  userId: text("user_id").primaryKey().references(() => users.id),
  sharingEnabled: integer("sharing_enabled", { mode: "boolean" }).notNull().default(false),
  shareProtocol: integer("share_protocol", { mode: "boolean" }).notNull().default(true),
  shareAttempts: integer("share_attempts", { mode: "boolean" }).notNull().default(true),
  shareNotes: integer("share_notes", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
