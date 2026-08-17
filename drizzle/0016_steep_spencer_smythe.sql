CREATE TABLE "comment_campaign_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"post_url" text,
	"title" text,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"last_comment_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"template_id" uuid,
	"filter_mode" text DEFAULT 'none' NOT NULL,
	"keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_dm_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"commenter_key" text NOT NULL,
	"commenter_provider_id" text,
	"commenter_public_id" text,
	"commenter_name" text,
	"comment_text" text,
	"matched_keyword" text,
	"connected" boolean DEFAULT false NOT NULL,
	"channel" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"chat_id" text,
	"unipile_message_id" text,
	"unipile_invitation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comment_campaign_posts" ADD CONSTRAINT "comment_campaign_posts_campaign_id_comment_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."comment_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_campaigns" ADD CONSTRAINT "comment_campaigns_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_campaigns" ADD CONSTRAINT "comment_campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_campaigns" ADD CONSTRAINT "comment_campaigns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_dm_targets" ADD CONSTRAINT "comment_dm_targets_campaign_id_comment_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."comment_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_dm_targets" ADD CONSTRAINT "comment_dm_targets_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_campaign_posts_campaign_post_idx" ON "comment_campaign_posts" USING btree ("campaign_id","post_id");--> statement-breakpoint
CREATE INDEX "comment_campaigns_account_idx" ON "comment_campaigns" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_dm_targets_campaign_commenter_idx" ON "comment_dm_targets" USING btree ("campaign_id","commenter_key");--> statement-breakpoint
CREATE INDEX "comment_dm_targets_due_idx" ON "comment_dm_targets" USING btree ("state","account_id");