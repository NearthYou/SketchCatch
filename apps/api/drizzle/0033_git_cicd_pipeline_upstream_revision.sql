ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "upstream_ordering_token" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "log_revision" text DEFAULT '' NOT NULL;
