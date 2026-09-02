CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_currency` text DEFAULT 'EGP' NOT NULL,
	`timezone` text DEFAULT 'Africa/Cairo' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`invited_by` text NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitations_role_check" CHECK("invitations"."role" in ('admin', 'member', 'viewer'))
);
--> statement-breakpoint
CREATE INDEX `invitations_household_idx` ON `invitations` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_household_id_unique` ON `invitations` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memberships_role_check" CHECK("memberships"."role" in ('owner', 'admin', 'member', 'viewer'))
);
--> statement-breakpoint
CREATE INDEX `memberships_household_idx` ON `memberships` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_household_id_unique` ON `memberships` (`household_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_household_user_unique` ON `memberships` (`household_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`image` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`asset_class` text NOT NULL,
	`is_investment` integer NOT NULL,
	`balance_mode` text NOT NULL,
	`quantity_minor` integer,
	`opening_quantity_minor` integer,
	`opening_date` text,
	`as_of` text,
	`sort_order` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounts_kind_check" CHECK("accounts"."kind" in ('asset', 'liability')),
	CONSTRAINT "accounts_class_check" CHECK("accounts"."asset_class" in ('EGP', 'USD', 'GOLD', 'SILVER')),
	CONSTRAINT "accounts_investment_check" CHECK("accounts"."is_investment" in (0, 1)),
	CONSTRAINT "accounts_balance_mode_check" CHECK("accounts"."balance_mode" in ('stated', 'derived')),
	CONSTRAINT "accounts_balance_mode_consistency" CHECK((
        ("accounts"."balance_mode" = 'stated'
          and "accounts"."quantity_minor" is not null
          and "accounts"."opening_quantity_minor" is null
          and "accounts"."opening_date" is null)
        or
        ("accounts"."balance_mode" = 'derived'
          and "accounts"."quantity_minor" is null
          and "accounts"."opening_quantity_minor" is not null
          and "accounts"."opening_date" is not null)
      ))
);
--> statement-breakpoint
CREATE INDEX `accounts_household_idx` ON `accounts` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_household_id_unique` ON `accounts` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `liabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `liabilities_household_idx` ON `liabilities` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `liabilities_household_id_unique` ON `liabilities` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `property_holdings` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`paid_to_date_minor` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `property_holdings_household_idx` ON `property_holdings` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `property_holdings_household_id_unique` ON `property_holdings` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `card_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`card_id` text NOT NULL,
	`due_on` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`,`card_id`) REFERENCES `cards`(`household_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_payments_household_idx` ON `card_payments` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_payments_household_id_unique` ON `card_payments` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`limit_minor` integer,
	`statement_day` integer,
	`due_day` integer,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cards_household_idx` ON `cards` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_household_id_unique` ON `cards` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `income_settings` (
	`household_id` text PRIMARY KEY NOT NULL,
	`salary_minor` integer,
	`salary_currency` text NOT NULL,
	`pay_day` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "income_settings_currency_check" CHECK("income_settings"."salary_currency" in ('EGP', 'USD'))
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`plan_name` text NOT NULL,
	`due_on` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`kind` text,
	`paid_at` integer,
	`paid_by` text,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `installments_household_idx` ON `installments` (`household_id`);--> statement-breakpoint
CREATE INDEX `installments_due_idx` ON `installments` (`household_id`,`due_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `installments_household_id_unique` ON `installments` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`occurred_on` text NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`account_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`rate_id` text,
	`note` text,
	`reverses_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`,`account_id`) REFERENCES `accounts`(`household_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`,`rate_id`) REFERENCES `rates`(`household_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`,`reverses_id`) REFERENCES `transactions`(`household_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_kind_check" CHECK("transactions"."kind" in ('income', 'expense', 'transfer')),
	CONSTRAINT "transactions_currency_check" CHECK("transactions"."currency" in ('EGP', 'USD')),
	CONSTRAINT "transactions_usd_needs_rate" CHECK(("transactions"."currency" = 'USD' and "transactions"."rate_id" is not null) or "transactions"."currency" != 'USD'),
	CONSTRAINT "transactions_no_self_reversal" CHECK("transactions"."reverses_id" is null or "transactions"."reverses_id" != "transactions"."id")
);
--> statement-breakpoint
CREATE INDEX `transactions_household_idx` ON `transactions` (`household_id`);--> statement-breakpoint
CREATE INDEX `transactions_occurred_idx` ON `transactions` (`household_id`,`occurred_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_reverses_unique` ON `transactions` (`household_id`,`reverses_id`) WHERE reverses_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_household_id_unique` ON `transactions` (`household_id`,`id`);--> statement-breakpoint
CREATE TABLE `rates` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`asset_class` text NOT NULL,
	`rate_minor` integer NOT NULL,
	`scale` integer NOT NULL,
	`as_of` text NOT NULL,
	`source` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rates_class_check" CHECK("rates"."asset_class" in ('USD', 'GOLD', 'SILVER')),
	CONSTRAINT "rates_source_check" CHECK("rates"."source" in ('manual', 'fetch', 'imported')),
	CONSTRAINT "rates_fetch_actor_check" CHECK(("rates"."source" = 'fetch' and "rates"."created_by" is null) or ("rates"."source" != 'fetch'))
);
--> statement-breakpoint
CREATE INDEX `rates_household_idx` ON `rates` (`household_id`);--> statement-breakpoint
CREATE INDEX `rates_lookup_idx` ON `rates` (`household_id`,`asset_class`,`as_of`);--> statement-breakpoint
CREATE UNIQUE INDEX `rates_household_id_unique` ON `rates` (`household_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rates_household_class_asof_unique` ON `rates` (`household_id`,`asset_class`,`as_of`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`taken_on` text NOT NULL,
	`liquid_minor` integer NOT NULL,
	`investments_minor` integer NOT NULL,
	`property_paid_minor` integer NOT NULL,
	`short_term_liabilities_minor` integer NOT NULL,
	`remaining_installments_minor` integer NOT NULL,
	`net_worth_excl_installments_minor` integer NOT NULL,
	`net_worth_incl_installments_minor` integer,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "snapshots_source_check" CHECK("snapshots"."source" in ('imported', 'app')),
	CONSTRAINT "snapshots_app_records_both" CHECK("snapshots"."source" != 'app' or "snapshots"."net_worth_incl_installments_minor" is not null)
);
--> statement-breakpoint
CREATE INDEX `snapshots_household_idx` ON `snapshots` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_household_id_unique` ON `snapshots` (`household_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_household_taken_on_unique` ON `snapshots` (`household_id`,`taken_on`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_id` text,
	`actor_kind` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_log_actor_kind_check" CHECK("audit_log"."actor_kind" in ('user', 'system')),
	CONSTRAINT "audit_log_action_check" CHECK("audit_log"."action" in ('create', 'update', 'archive', 'import')),
	CONSTRAINT "audit_log_system_actor_check" CHECK(("audit_log"."actor_kind" = 'system' and "audit_log"."actor_id" is null) or "audit_log"."actor_kind" = 'user')
);
--> statement-breakpoint
CREATE INDEX `audit_log_household_idx` ON `audit_log` (`household_id`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`household_id`,`entity`,`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_household_id_unique` ON `audit_log` (`household_id`,`id`);