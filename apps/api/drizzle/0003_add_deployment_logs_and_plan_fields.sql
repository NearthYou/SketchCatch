CREATE TYPE "public"."deployment_blocked_by" AS ENUM('risk_analysis', 'cost_analysis', 'missing_approval');--> statement-breakpoint
CREATE TYPE "public"."deployment_failure_stage" AS ENUM('validation', 'plan', 'approval', 'mock_run');--> statement-breakpoint
CREATE TYPE "public"."deployment_log_level" AS ENUM('INFO', 'WARN', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."deployment_stage" AS ENUM('validate', 'plan', 'apply');--> statement-breakpoint
CREATE TABLE "deployment_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"deployment_id" varchar(36) NOT NULL,
	"sequence" integer NOT NULL,
	"stage" "deployment_stage" NOT NULL,
	"level" "deployment_log_level" NOT NULL,
	"message" text NOT NULL,
	"related_resource_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "plan_summary" jsonb;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "is_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "blocked_by" "deployment_blocked_by";--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "failure_stage" "deployment_failure_stage";--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "error_summary" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "approved_by" varchar(128);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "approved_terraform_artifact_id" varchar(36);--> statement-breakpoint
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_approved_terraform_artifact_id_project_assets_id_fk" FOREIGN KEY ("approved_terraform_artifact_id") REFERENCES "public"."project_assets"("id") ON DELETE set null ON UPDATE no action;
