ALTER TABLE `situations` ADD `confirmed_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `situations` ADD `chain_json` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `situations` ADD `ai_analysis_json` text DEFAULT '' NOT NULL;
