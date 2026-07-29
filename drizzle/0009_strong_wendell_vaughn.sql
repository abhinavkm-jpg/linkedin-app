CREATE TABLE "account_prompt_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"ai_prompt_id" uuid,
	"share_content" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"section" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linkedin_accounts" ADD COLUMN "sitemap_url" text;--> statement-breakpoint
ALTER TABLE "linkedin_accounts" ADD COLUMN "content_sections" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "account_prompt_sets" ADD CONSTRAINT "account_prompt_sets_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_prompt_sets" ADD CONSTRAINT "account_prompt_sets_ai_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("ai_prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_account_id_linkedin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."linkedin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_prompt_sets_account_stage_idx" ON "account_prompt_sets" USING btree ("account_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "content_assets_account_url_idx" ON "content_assets" USING btree ("account_id","url");--> statement-breakpoint
CREATE INDEX "content_assets_account_idx" ON "content_assets" USING btree ("account_id");