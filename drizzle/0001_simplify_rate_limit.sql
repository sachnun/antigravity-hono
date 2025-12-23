ALTER TABLE `tokens` ADD COLUMN `rate_limit_until` integer;--> statement-breakpoint
DROP INDEX IF EXISTS `gemini_rate_limit_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `claude_rate_limit_idx`;--> statement-breakpoint
CREATE INDEX `rate_limit_idx` ON `tokens` (`rate_limit_until`);--> statement-breakpoint
ALTER TABLE `tokens` DROP COLUMN `gemini_rate_limit_until`;--> statement-breakpoint
ALTER TABLE `tokens` DROP COLUMN `claude_rate_limit_until`;
