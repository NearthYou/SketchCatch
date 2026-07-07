ALTER TABLE "git_cicd_handoffs" ADD COLUMN "source_deployment_id" varchar(36);--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "deployment_mode" varchar(32) DEFAULT 'infra_and_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "requires_environment_approval" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "pull_request_number" integer;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "merge_commit_sha" varchar(64);--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "environment_name" varchar(128) DEFAULT 'sketchcatch-production' NOT NULL;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "infra_pipeline_run_url" text;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "infra_pipeline_status" varchar(32) DEFAULT 'waiting_for_merge' NOT NULL;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "app_pipeline_run_url" text;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "app_pipeline_status" varchar(32) DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "destroy_pipeline_run_url" text;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "destroy_pipeline_status" varchar(32) DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "static_site_url" text;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "api_base_url" text;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "repository_settings_preview" jsonb;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "aws_role_diff" jsonb;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "github_oauth_required" boolean DEFAULT true NOT NULL;
