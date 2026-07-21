DROP INDEX "enrollments_campaign_connection_idx";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "dedupe_contacts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "enrollments_campaign_connection_idx" ON "enrollments" USING btree ("campaign_id","connection_id");