CREATE TABLE `outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`relief_delta` integer NOT NULL,
	`goal_progress` integer NOT NULL,
	`helpfulness` integer NOT NULL,
	`avoidance` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `skill_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outcomes_attempt_unique` ON `outcomes` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_outcomes_user_created` ON `outcomes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `personal_skill_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`completions` integer DEFAULT 0 NOT NULL,
	`helpful_sum` integer DEFAULT 0 NOT NULL,
	`goal_sum` integer DEFAULT 0 NOT NULL,
	`relief_sum` integer DEFAULT 0 NOT NULL,
	`avoidance_count` integer DEFAULT 0 NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_evidence_user_skill_unique` ON `personal_skill_evidence` (`user_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `idx_evidence_user_confidence` ON `personal_skill_evidence` (`user_id`,`confidence`);--> statement-breakpoint
CREATE TABLE `psychologist_access` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sharing_enabled` integer DEFAULT false NOT NULL,
	`share_protocol` integer DEFAULT true NOT NULL,
	`share_attempts` integer DEFAULT true NOT NULL,
	`share_notes` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `situations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`intensity` integer NOT NULL,
	`safety_status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_situations_user_created` ON `situations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `skill_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`situation_id` text,
	`skill_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'started' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`situation_id`) REFERENCES `situations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_user_started` ON `skill_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`approach` text NOT NULL,
	`track` text NOT NULL,
	`description` text NOT NULL,
	`why` text NOT NULL,
	`steps_json` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`autonomous` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
