CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"unipile_dsn" text,
	"unipile_api_key" text,
	"unipile_webhook_secret" text,
	"anthropic_api_key" text,
	"qstash_token" text,
	"qstash_current_signing_key" text,
	"qstash_next_signing_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;