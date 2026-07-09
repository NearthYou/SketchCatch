CREATE TYPE "deployment_job_operation" AS ENUM('plan', 'apply', 'destroy_plan', 'destroy');--> statement-breakpoint
CREATE TYPE "deployment_job_status" AS ENUM('QUEUED', 'DISPATCHING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "deployment_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"deployment_id" varchar(36) NOT NULL,
	"operation" "deployment_job_operation" NOT NULL,
	"status" "deployment_job_status" DEFAULT 'QUEUED' NOT NULL,
	"requested_by_user_id" varchar(36) NOT NULL,
	"access_context" jsonb NOT NULL,
	"started_from_status" "deployment_status" NOT NULL,
	"started_from_failure_stage" "deployment_failure_stage",
	"ecs_task_arn" text,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment_jobs" ADD CONSTRAINT "deployment_jobs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_jobs" ADD CONSTRAINT "deployment_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_jobs_deployment_id_idx" ON "deployment_jobs" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "deployment_jobs_requested_by_user_id_idx" ON "deployment_jobs" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "deployment_jobs_status_idx" ON "deployment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deployment_jobs_ecs_task_arn_idx" ON "deployment_jobs" USING btree ("ecs_task_arn");--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_jobs_deployment_active_unique" ON "deployment_jobs" USING btree ("deployment_id") WHERE "deployment_jobs"."status" in ('QUEUED', 'DISPATCHING', 'RUNNING');
