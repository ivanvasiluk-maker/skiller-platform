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
