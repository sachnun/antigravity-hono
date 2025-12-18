CREATE TABLE `tokens` (
	`email` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`project_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`tier` text,
	`gemini_rate_limit_until` integer,
	`claude_rate_limit_until` integer,
	`updated_at` integer
);
