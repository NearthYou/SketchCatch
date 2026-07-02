ALTER TYPE "public"."deployment_failure_stage" ADD VALUE 'aws_connection' BEFORE 'mock_run';--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "active_stage" "deployment_stage";--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_project_running_unique" ON "deployments" USING btree ("project_id") WHERE "deployments"."status" = 'RUNNING';