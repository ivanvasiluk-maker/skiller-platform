-- Additive bridge for both published and GitHub migration histories.
-- Keep both namespaces; canonical rows win conflicts. No historical files changed.
CREATE TABLE IF NOT EXISTS behavioral_memory_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  action_urge TEXT NOT NULL,
  topic TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT '',
  thought TEXT NOT NULL DEFAULT '',
  emotion_body TEXT NOT NULL DEFAULT '',
  urge TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  consequences TEXT NOT NULL DEFAULT '',
  intervention_point TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS behavioral_memory_v2_user_pattern
  ON behavioral_memory_v2(user_id, kind, action_urge, created_at);

-- PATCH 1.1: персистентная память — success factors и intervention memory.
CREATE TABLE IF NOT EXISTS `success_factors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`loop_id` text,
	`factor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `success_factors_user` ON `success_factors` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `intervention_memory_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`loop_id` text,
	`outcome` text NOT NULL,
	`rejection_reason` text DEFAULT '' NOT NULL,
	`missing_link` text DEFAULT '' NOT NULL,
	`chain_break_point` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `intervention_memory_v2_user_skill` ON `intervention_memory_v2` (`user_id`, `skill_id`, `created_at`);

-- PATCH 1.1: персистентная память — success factors и intervention memory.
CREATE TABLE IF NOT EXISTS `success_factors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`loop_id` text,
	`factor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `success_factors_user` ON `success_factors` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `intervention_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`loop_id` text,
	`outcome` text NOT NULL,
	`rejection_reason` text DEFAULT '' NOT NULL,
	`missing_link` text DEFAULT '' NOT NULL,
	`chain_break_point` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `intervention_memory_user_skill` ON `intervention_memory` (`user_id`, `skill_id`, `created_at`);

CREATE TABLE IF NOT EXISTS behavioral_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  action_urge TEXT NOT NULL,
  topic TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT '',
  thought TEXT NOT NULL DEFAULT '',
  emotion_body TEXT NOT NULL DEFAULT '',
  urge TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  consequences TEXT NOT NULL DEFAULT '',
  intervention_point TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS behavioral_memory_user_pattern
  ON behavioral_memory(user_id, kind, action_urge, created_at);

INSERT OR IGNORE INTO behavioral_memory SELECT * FROM behavioral_memory_v2;
INSERT OR IGNORE INTO intervention_memory SELECT * FROM intervention_memory_v2;
