ALTER TABLE "source_repositories" ADD COLUMN "analysis_result" jsonb;--> statement-breakpoint
ALTER TABLE "source_repositories" ADD COLUMN "analysis_revision" varchar(128);--> statement-breakpoint
ALTER TABLE "source_repositories" ADD COLUMN "analyzed_at" timestamp with time zone;
