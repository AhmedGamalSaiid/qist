CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`provider_id` text NOT NULL,
	`account_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_accounts_user_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_issuer_account_unique` ON `auth_accounts` (`issuer`,`account_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_token_idx` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier_idx` ON `auth_verifications` (`identifier`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-folded (data-model.md, T010): backfill every existing row's
-- updated_at to created_at rather than leaving the freshly-added column's
-- 0 default in place.
UPDATE `users` SET `updated_at` = `created_at`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_liabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`card_id` text,
	`reverses_id` text,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`,`card_id`) REFERENCES `cards`(`household_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`,`reverses_id`) REFERENCES `liabilities`(`household_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "liabilities_no_self_reversal" CHECK("__new_liabilities"."reverses_id" is null or "__new_liabilities"."reverses_id" != "__new_liabilities"."id")
);
--> statement-breakpoint
-- Hand-fixed (T010): drizzle-kit's own generated copy-statement selected
-- `card_id`/`reverses_id` from the *old* `liabilities` table, which does not
-- have those columns yet (they are new in this migration) — every existing
-- row backfills both as NULL, per data-model.md ("NULL for every imported
-- row").
INSERT INTO `__new_liabilities`("id", "household_id", "name", "amount_minor", "card_id", "reverses_id", "sort_order", "created_at") SELECT "id", "household_id", "name", "amount_minor", NULL, NULL, "sort_order", "created_at" FROM `liabilities`;--> statement-breakpoint
DROP TABLE `liabilities`;--> statement-breakpoint
ALTER TABLE `__new_liabilities` RENAME TO `liabilities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `liabilities_household_idx` ON `liabilities` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `liabilities_reverses_unique` ON `liabilities` (`household_id`,`reverses_id`) WHERE reverses_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `liabilities_household_id_unique` ON `liabilities` (`household_id`,`id`);--> statement-breakpoint
-- Hand-folded (data-model.md / research.md R7, T009-T010): a SQLite
-- expression index, which the installed drizzle-kit version does not emit
-- from the schema builder. Creating it here fails the migration outright if
-- any existing household already holds two cards whose names collide
-- case-insensitively — the pre-creation assertion this task calls for, made
-- structural rather than a separate check step. The migrated household's
-- four imported card names are distinct, so this passes today.
CREATE UNIQUE INDEX `cards_household_name_unique` ON `cards` (`household_id`, lower(`name`));