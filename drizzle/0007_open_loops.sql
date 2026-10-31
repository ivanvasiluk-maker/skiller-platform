-- PATCH 1.1 — Conversational Relationship Layer: персистентные open loops.
-- Заменяет runtime CREATE TABLE из lib/conversation-orchestrator.ts (бриф §10: только миграции).
CREATE TABLE IF NOT EXISTS `open_loops` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text,
	`topic` text NOT NULL,
	`planned_action` text NOT NULL,
	`entry_mode` text DEFAULT 'stuck' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`expected_time` text,
	`follow_up_due` text NOT NULL,
	`follow_up_shown_at` text,
	`answered_at` text,
	`outcome` text,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `open_loops_user_status` ON `open_loops` (`user_id`, `status`, `follow_up_due`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `open_loops_plan_active` ON `open_loops` (`plan_id`) WHERE `status` IN ('active','answered');
