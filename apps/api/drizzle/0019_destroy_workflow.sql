CREATE TYPE "public"."deployment_plan_operation" AS ENUM('apply', 'destroy');--> statement-breakpoint
ALTER TYPE "public"."deployment_status" ADD VALUE 'DESTROYED';--> statement-breakpoint
ALTER TYPE "public"."deployment_failure_stage" ADD VALUE 'destroy';--> statement-breakpoint
ALTER TYPE "public"."deployment_stage" ADD VALUE 'destroy';--> statement-breakpoint
ALTER TABLE "deployment_plan_artifacts" ADD COLUMN "operation" "deployment_plan_operation" DEFAULT 'apply' NOT NULL;
