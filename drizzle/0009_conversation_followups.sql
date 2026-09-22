CREATE TABLE IF NOT EXISTS `conversation_followups` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `loop_id` text,
  `skill_id` text NOT NULL,
  `kind` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `answer` text DEFAULT '' NOT NULL,
  `prompted_at` text NOT NULL,
  `answered_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversation_followups_user_status` ON `conversation_followups` (`user_id`,`status`,`prompted_at`);
