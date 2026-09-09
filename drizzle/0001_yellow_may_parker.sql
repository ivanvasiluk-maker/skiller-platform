ALTER TABLE `situations` ADD `first_signal` text DEFAULT 'emotion' NOT NULL;--> statement-breakpoint
ALTER TABLE `situations` ADD `action_urge` text DEFAULT 'pause' NOT NULL;--> statement-breakpoint
ALTER TABLE `situations` ADD `desired_direction` text DEFAULT 'stabilize' NOT NULL;--> statement-breakpoint
ALTER TABLE `situations` ADD `important_goal` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `situations` ADD `change_point` text DEFAULT 'before_action' NOT NULL;--> statement-breakpoint
ALTER TABLE `situations` ADD `recommendation_reason` text DEFAULT '' NOT NULL;