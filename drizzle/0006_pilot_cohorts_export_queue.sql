CREATE TABLE `cohorts` (
	`key` text PRIMARY KEY NOT NULL,
	`product_version` text NOT NULL,
	`starts_on` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cohort_members` (
	`cohort_key` text NOT NULL,
	`user_id` text NOT NULL,
	`first_event_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`cohort_key`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `export_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retry_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_export_queue_status_retry` ON `export_queue` (`status`, `retry_at`);
