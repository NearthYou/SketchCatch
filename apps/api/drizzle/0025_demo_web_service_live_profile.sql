CREATE TYPE "public"."deployment_live_profile" AS ENUM('practice', 'demo_web_service', 'demo_web_service_with_rds');--> statement-breakpoint
CREATE TYPE "public"."git_cicd_handoff_kind" AS ENUM('terraform_iac', 'static_site');--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "live_profile" "deployment_live_profile" DEFAULT 'practice' NOT NULL;--> statement-breakpoint
ALTER TABLE "git_cicd_handoffs" ADD COLUMN "handoff_kind" "git_cicd_handoff_kind" DEFAULT 'terraform_iac' NOT NULL;
