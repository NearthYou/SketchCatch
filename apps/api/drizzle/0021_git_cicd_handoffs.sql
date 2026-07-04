CREATE TYPE "public"."git_cicd_repository_provider" AS ENUM('internal');--> statement-breakpoint
CREATE TYPE "public"."git_cicd_handoff_status" AS ENUM('draft', 'pr_created', 'pipeline_running', 'pipeline_success', 'pipeline_failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "git_cicd_handoffs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"architecture_id" varchar(36) NOT NULL,
	"terraform_artifact_id" varchar(36) NOT NULL,
	"source_repository_id" varchar(128) NOT NULL,
	"repository_provider" "git_cicd_repository_provider" DEFAULT 'internal' NOT NULL,
	"repository_owner" varchar(120) NOT NULL,
	"repository_name" varchar(120) NOT NULL,
	"target_branch" varchar(255) NOT NULL,
	"source_branch" varchar(255),
	"commit_message" text,
	"pull_request_title" text,
	"pull_request_url" text,
	"pipeline_run_url" text,
	"status" "git_cicd_handoff_status" DEFAULT 'draft' NOT NULL,
	"status_message" text,
	"user_accepted_change_id" varchar(128) NOT NULL,
	"created_by_user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD CONSTRAINT "git_cicd_handoffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD CONSTRAINT "git_cicd_handoffs_architecture_id_architectures_id_fk" FOREIGN KEY ("architecture_id") REFERENCES "public"."architectures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD CONSTRAINT "git_cicd_handoffs_terraform_artifact_id_project_assets_id_fk" FOREIGN KEY ("terraform_artifact_id") REFERENCES "public"."project_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD CONSTRAINT "git_cicd_handoffs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "git_cicd_handoffs_project_id_idx" ON "git_cicd_handoffs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "git_cicd_handoffs_architecture_id_idx" ON "git_cicd_handoffs" USING btree ("architecture_id");--> statement-breakpoint
CREATE INDEX "git_cicd_handoffs_terraform_artifact_id_idx" ON "git_cicd_handoffs" USING btree ("terraform_artifact_id");--> statement-breakpoint
CREATE INDEX "git_cicd_handoffs_created_by_user_id_idx" ON "git_cicd_handoffs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "git_cicd_handoffs_status_idx" ON "git_cicd_handoffs" USING btree ("status");
