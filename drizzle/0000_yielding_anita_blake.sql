CREATE TYPE "public"."account_status" AS ENUM('OK', 'CONNECTING', 'CREDENTIALS', 'PERMISSIONS', 'ERROR', 'STOPPED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('pending', 'success', 'failed', 'throttled');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('invite', 'message', 'enrich', 'sync');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."enrollment_state" AS ENUM('queued', 'enriching', 'invite_pending', 'awaiting_accept', 'accepted', 'messaging', 'messaged', 'in_followup', 'replied', 'completed', 'paused', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."relationship_status" AS ENUM('connection', 'not_connected', 'invite_queued', 'invited', 'pending', 'accepted', 'messaged', 'replied', 'do_not_contact');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('template', 'ai');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('invite', 'message');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('idle', 'running', 'error');--> statement-breakpoint
CREATE TYPE "public"."template_type" AS ENUM('invite', 'message');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid,
	"campaign_id" uuid,
	"enrollment_id" uuid,
	"type" "activity_type" NOT NULL,
	"status" "activity_status" DEFAULT 'pending' NOT NULL,
	"content" text,
	"unipile_invitation_id" text,
	"unipile_chat_id" text,
	"unipile_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"system_prompt" text NOT NULL,
	"model" text DEFAULT 'claude-sonnet-5' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"targeting" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_before_send" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid,
	"unipile_chat_id" text NOT NULL,
	"attendee_provider_id" text,
	"attendee_name" text,
	"last_message_text" text,
	"last_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_unipile_chat_id_unique" UNIQUE("unipile_chat_id")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"member_id" text,
	"member_urn" text,
	"connection_urn" text,
	"public_identifier" text,
	"public_profile_url" text,
	"first_name" text,
	"last_name" text,
	"headline" text,
	"profile_picture_url" text,
	"provider_id" text,
	"location_country" text,
	"company" text,
	"position" text,
	"enrichment" jsonb,
	"enriched_at" timestamp with time zone,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"relationship_status" "relationship_status" DEFAULT 'connection' NOT NULL,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"invites_sent" integer DEFAULT 0 NOT NULL,
	"messages_sent" integer DEFAULT 0 NOT NULL,
	"inmails_sent" integer DEFAULT 0 NOT NULL,
	"enrichments" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"state" "enrollment_state" DEFAULT 'queued' NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now(),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unipile_account_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_provider_id" text,
	"status" "account_status" DEFAULT 'CONNECTING' NOT NULL,
	"owner_user_id" uuid,
	"daily_invite_cap" integer DEFAULT 80 NOT NULL,
	"daily_message_cap" integer DEFAULT 100 NOT NULL,
	"daily_inmail_cap" integer DEFAULT 40 NOT NULL,
	"daily_enrich_cap" integer DEFAULT 100 NOT NULL,
	"sync_status" "sync_status" DEFAULT 'idle' NOT NULL,
	"sync_cursor" text,
	"synced_count" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_accounts_unipile_account_id_unique" UNIQUE("unipile_account_id")
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"type" "step_type" NOT NULL,
	"source_type" "source_type" DEFAULT 'template' NOT NULL,
	"template_id" uuid,
	"ai_prompt_id" uuid,
	"model" text,
	"delay_hours" integer DEFAULT 24 NOT NULL,
	"stop_on_reply" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"type" "template_type" DEFAULT 'message' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"role" "role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"event" text,
	"external_id" text,
	"payload" jsonb,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_counters" ADD CONSTRAINT "daily_counters_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_accounts" ADD CONSTRAINT "linkedin_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_ai_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("ai_prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_account_idx" ON "activities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "activities_created_idx" ON "activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chats_account_idx" ON "chats" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_account_member_idx" ON "connections" USING btree ("account_id","member_id");--> statement-breakpoint
CREATE INDEX "connections_account_idx" ON "connections" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "connections_public_identifier_idx" ON "connections" USING btree ("public_identifier");--> statement-breakpoint
CREATE INDEX "connections_country_idx" ON "connections" USING btree ("location_country");--> statement-breakpoint
CREATE INDEX "connections_status_idx" ON "connections" USING btree ("relationship_status");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_counters_account_day_idx" ON "daily_counters" USING btree ("account_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_campaign_connection_idx" ON "enrollments" USING btree ("campaign_id","connection_id");--> statement-breakpoint
CREATE INDEX "enrollments_due_idx" ON "enrollments" USING btree ("state","next_run_at");--> statement-breakpoint
CREATE INDEX "enrollments_account_idx" ON "enrollments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "linkedin_accounts_owner_idx" ON "linkedin_accounts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "sequence_steps_campaign_idx" ON "sequence_steps" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_external_idx" ON "webhook_events" USING btree ("source","external_id");