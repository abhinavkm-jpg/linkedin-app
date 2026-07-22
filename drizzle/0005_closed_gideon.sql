ALTER TABLE "connections" ADD COLUMN "enriched_text" text;--> statement-breakpoint
ALTER TABLE "daily_counters" ADD COLUMN "auto_enrichments" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "linkedin_accounts" ADD COLUMN "auto_enrich" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "linkedin_accounts" ADD COLUMN "auto_enrich_daily_cap" integer DEFAULT 150 NOT NULL;