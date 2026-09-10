CREATE TABLE `delayed_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`goal_progress` integer NOT NULL,
	`helpfulness` integer NOT NULL,
	`avoidance` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `skill_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_delayed_outcomes_attempt_unique` ON `delayed_outcomes` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `idx_delayed_outcomes_user_created` ON `delayed_outcomes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `onboarding_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`focus` text NOT NULL,
	`goal` text NOT NULL,
	`practice_style` text NOT NULL,
	`support_mode` text NOT NULL,
	`safety_acknowledged` integer DEFAULT false NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
