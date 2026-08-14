CREATE TABLE "pipeline_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"chat_id" text,
	"stage" text DEFAULT 'new_response' NOT NULL,
	"intent" text,
	"last_inbound_text" text,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_text" text,
	"last_outbound_at" timestamp with time zone,
	"meeting_status" text DEFAULT 'none' NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_item_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid,
	"chat_id" text,
	"stage_at_draft" text,
	"intent" text,
	"objective" text,
	"draft_text" text,
	"reason" text,
	"suggested_stage" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"edited_text" text,
	"unipile_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_pipeline_item_id_pipeline_items_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_items_account_connection_idx" ON "pipeline_items" USING btree ("account_id","connection_id");--> statement-breakpoint
CREATE INDEX "pipeline_items_account_idx" ON "pipeline_items" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "reply_drafts_item_idx" ON "reply_drafts" USING btree ("pipeline_item_id");--> statement-breakpoint
CREATE INDEX "reply_drafts_status_idx" ON "reply_drafts" USING btree ("status");