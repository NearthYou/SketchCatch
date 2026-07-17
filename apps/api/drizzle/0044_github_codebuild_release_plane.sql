-- sketchcatch:contract-migration-after: v0.1.0
-- The only ALTER COLUMN TYPE in this migration widens application_releases.status from varchar(16) to varchar(24).
ALTER TYPE "deployment_job_operation" ADD VALUE IF NOT EXISTS 'recover_application_release' AFTER 'apply';
ALTER TYPE "deployment_job_operation" ADD VALUE IF NOT EXISTS 'retry_application_frontend' AFTER 'recover_application_release';
ALTER TABLE "projects" ADD COLUMN "deletion_error_summary" text;
ALTER TABLE "aws_connections" ADD COLUMN "deletion_error_summary" text;
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "infrastructure_deployment_id" varchar(36);
ALTER TABLE "git_cicd_pipeline_runs" ADD CONSTRAINT "git_cicd_pipeline_runs_infrastructure_deployment_id_deployments_id_fk" FOREIGN KEY ("infrastructure_deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TYPE "deployment_status" ADD VALUE IF NOT EXISTS 'PARTIALLY_FAILED';
--> statement-breakpoint
ALTER TYPE "deployment_status" ADD VALUE IF NOT EXISTS 'PARTIALLY_CANCELED';
--> statement-breakpoint
ALTER TYPE "deployment_stage" ADD VALUE IF NOT EXISTS 'preflight';
--> statement-breakpoint
ALTER TYPE "deployment_stage" ADD VALUE IF NOT EXISTS 'application_release';
--> statement-breakpoint
ALTER TYPE "deployment_stage" ADD VALUE IF NOT EXISTS 'rollback';
--> statement-breakpoint
ALTER TYPE "deployment_failure_stage" ADD VALUE IF NOT EXISTS 'build_environment';
--> statement-breakpoint
ALTER TYPE "deployment_failure_stage" ADD VALUE IF NOT EXISTS 'preflight';
--> statement-breakpoint
ALTER TYPE "deployment_failure_stage" ADD VALUE IF NOT EXISTS 'application_release';
--> statement-breakpoint
ALTER TYPE "deployment_failure_stage" ADD VALUE IF NOT EXISTS 'rollback';
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "release_request_key" varchar(160);
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "github_repository_id" varchar(32);
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "github_workflow_ref" text;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "github_workflow_run_id" varchar(32);
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "github_workflow_run_attempt" integer;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "github_oidc_subject" text;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "github_environment" text;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "cancellation_requested_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deletion_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "aws_connections" ADD COLUMN "deletion_started_at" timestamp with time zone;
--> statement-breakpoint
DROP INDEX "git_cicd_pipeline_runs_repository_commit_unique";
--> statement-breakpoint
CREATE TABLE "aws_code_connections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"aws_connection_id" varchar(36) NOT NULL,
	"connection_arn" text,
	"provider_type" varchar(32) DEFAULT 'GitHub' NOT NULL,
	"status" varchar(24) DEFAULT 'CREATING' NOT NULL,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aws_code_connections_aws_connection_unique" UNIQUE("aws_connection_id"),
	CONSTRAINT "aws_code_connections_connection_arn_unique" UNIQUE("connection_arn"),
	CONSTRAINT "aws_code_connections_provider_check" CHECK ("provider_type" = 'GitHub'),
	CONSTRAINT "aws_code_connections_status_check" CHECK ("status" in ('CREATING', 'PENDING', 'AVAILABLE', 'ERROR', 'DELETING'))
);
--> statement-breakpoint
CREATE TABLE "project_build_environments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"aws_connection_id" varchar(36),
	"aws_code_connection_id" varchar(36),
	"codebuild_project_name" varchar(255) NOT NULL,
	"codebuild_service_role_arn" text NOT NULL,
	"permissions_boundary_arn" text NOT NULL,
	"source_repository_url" text NOT NULL,
	"runtime_fingerprint" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'preparing' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_build_environments_project_unique" UNIQUE("project_id"),
	CONSTRAINT "project_build_environments_fingerprint_check" CHECK ("runtime_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "project_build_environments_status_check" CHECK ("status" in ('preparing', 'ready', 'verification_failed', 'disconnected'))
);
--> statement-breakpoint
CREATE TABLE "project_execution_leases" (
	"project_id" varchar(36) PRIMARY KEY NOT NULL,
	"holder_id" varchar(128) NOT NULL,
	"source" varchar(16) NOT NULL,
	"fencing_version" integer NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"active_codebuild_id" text,
	"active_worker_task_arn" text,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_execution_leases_fencing_check" CHECK ("fencing_version" > 0),
	CONSTRAINT "project_execution_leases_source_check" CHECK ("source" in ('direct', 'gitops')),
	CONSTRAINT "project_execution_leases_status_check" CHECK ("status" in ('active', 'releasing', 'released'))
);
--> statement-breakpoint
CREATE TABLE "release_candidates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"deployment_id" varchar(36),
	"pipeline_run_id" varchar(36),
	"build_environment_id" varchar(36),
	"commit_sha" varchar(64) NOT NULL,
	"config_fingerprint" varchar(64) NOT NULL,
	"composite_digest" varchar(64) NOT NULL,
	"api_oci_digest" varchar(64) NOT NULL,
	"api_archive_digest" varchar(64) NOT NULL,
	"frontend_archive_digest" varchar(64) NOT NULL,
	"frontend_manifest_digest" varchar(64) NOT NULL,
	"frontend_index_digest" varchar(64) NOT NULL,
	"api_archive_object_key" text NOT NULL,
	"api_archive_object_version_id" text NOT NULL,
	"api_archive_byte_size" bigint NOT NULL,
	"frontend_archive_object_key" text NOT NULL,
	"frontend_archive_object_version_id" text NOT NULL,
	"frontend_archive_byte_size" bigint NOT NULL,
	"frontend_manifest_object_key" text NOT NULL,
	"frontend_manifest_object_version_id" text NOT NULL,
	"manifest_object_key" text NOT NULL,
	"manifest_object_version_id" text NOT NULL,
	"status" varchar(16) DEFAULT 'building' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"frontend_retry_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_candidates_reference_check" CHECK (num_nonnulls("deployment_id", "pipeline_run_id") = 1),
	CONSTRAINT "release_candidates_digest_check" CHECK (
		"config_fingerprint" ~ '^[0-9a-f]{64}$'
		AND "composite_digest" ~ '^[0-9a-f]{64}$'
		AND "api_oci_digest" ~ '^[0-9a-f]{64}$'
		AND "api_archive_digest" ~ '^[0-9a-f]{64}$'
		AND "frontend_archive_digest" ~ '^[0-9a-f]{64}$'
		AND "frontend_manifest_digest" ~ '^[0-9a-f]{64}$'
		AND "frontend_index_digest" ~ '^[0-9a-f]{64}$'
	),
	CONSTRAINT "release_candidates_commit_sha_check" CHECK ("commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
	CONSTRAINT "release_candidates_size_check" CHECK ("api_archive_byte_size" > 0 AND "frontend_archive_byte_size" > 0),
	CONSTRAINT "release_candidates_status_check" CHECK ("status" in ('building', 'pending', 'activating', 'partially_failed', 'succeeded', 'failed', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "application_release_steps" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"release_id" varchar(36) NOT NULL,
	"sequence" integer NOT NULL,
	"step" varchar(40) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"fencing_version" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"evidence" jsonb,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_release_steps_release_sequence_unique" UNIQUE("release_id", "sequence"),
	CONSTRAINT "application_release_steps_sequence_check" CHECK ("sequence" > 0),
	CONSTRAINT "application_release_steps_fencing_check" CHECK ("fencing_version" > 0),
	CONSTRAINT "application_release_steps_attempt_check" CHECK ("attempt" > 0),
	CONSTRAINT "application_release_steps_status_check" CHECK ("status" in ('pending', 'running', 'succeeded', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "aws_account_id_snapshot" varchar(12);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "aws_region_snapshot" varchar(32);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "aws_connection_name_snapshot" text;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "release_candidate_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "rollback_of_deployment_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "rollback_target_deployment_id" varchar(36);
--> statement-breakpoint
UPDATE "deployments" AS "deployment"
SET
	"aws_account_id_snapshot" = COALESCE("deployment"."approved_aws_account_id", "connection"."account_id"),
	"aws_region_snapshot" = COALESCE("deployment"."approved_aws_region", "connection"."region"),
	"aws_connection_name_snapshot" = COALESCE("connection"."account_id", "connection"."role_arn", "connection"."id")
FROM "aws_connections" AS "connection"
WHERE "deployment"."aws_connection_id" = "connection"."id";
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ALTER COLUMN "connection_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" DROP CONSTRAINT IF EXISTS "project_deployment_targets_connection_id_aws_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD CONSTRAINT "project_deployment_targets_connection_id_aws_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" DROP CONSTRAINT IF EXISTS "deployments_aws_connection_id_aws_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_aws_connection_id_aws_connections_id_fk" FOREIGN KEY ("aws_connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_releases" ALTER COLUMN "status" TYPE varchar(24);
--> statement-breakpoint
ALTER TABLE "application_releases" DROP CONSTRAINT IF EXISTS "application_releases_status_check";
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_status_check" CHECK ("status" in ('pending', 'building', 'deploying', 'retrying', 'partially_failed', 'partially_cancelled', 'succeeded', 'failed', 'rolled_back', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "release_candidate_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "composite_digest" jsonb;
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "frontend_evidence" jsonb;
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "failure_stage" varchar(40);
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "baseline_release_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_failure_stage_check" CHECK ("failure_stage" IS NULL OR "failure_stage" in ('preflight_checkout', 'preflight_api_build', 'preflight_api_health', 'preflight_frontend_build', 'candidate_upload', 'runtime_verification', 'ecr_publish', 'ecs_activation', 'ecs_health', 'frontend_upload', 'frontend_activation', 'cloudfront_invalidation', 'public_health', 'rollback'));
--> statement-breakpoint
ALTER TABLE "aws_code_connections" ADD CONSTRAINT "aws_code_connections_aws_connection_id_aws_connections_id_fk" FOREIGN KEY ("aws_connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_build_environments" ADD CONSTRAINT "project_build_environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_build_environments" ADD CONSTRAINT "project_build_environments_aws_connection_id_aws_connections_id_fk" FOREIGN KEY ("aws_connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_build_environments" ADD CONSTRAINT "project_build_environments_aws_code_connection_id_aws_code_connections_id_fk" FOREIGN KEY ("aws_code_connection_id") REFERENCES "public"."aws_code_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_execution_leases" ADD CONSTRAINT "project_execution_leases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_candidates" ADD CONSTRAINT "release_candidates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_candidates" ADD CONSTRAINT "release_candidates_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_candidates" ADD CONSTRAINT "release_candidates_pipeline_run_id_git_cicd_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."git_cicd_pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_candidates" ADD CONSTRAINT "release_candidates_build_environment_id_project_build_environments_id_fk" FOREIGN KEY ("build_environment_id") REFERENCES "public"."project_build_environments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_release_steps" ADD CONSTRAINT "application_release_steps_release_id_application_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."application_releases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_release_candidate_id_release_candidates_id_fk" FOREIGN KEY ("release_candidate_id") REFERENCES "public"."release_candidates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_rollback_of_deployment_id_deployments_id_fk" FOREIGN KEY ("rollback_of_deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_rollback_target_deployment_id_deployments_id_fk" FOREIGN KEY ("rollback_target_deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_release_candidate_id_release_candidates_id_fk" FOREIGN KEY ("release_candidate_id") REFERENCES "public"."release_candidates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_baseline_release_id_application_releases_id_fk" FOREIGN KEY ("baseline_release_id") REFERENCES "public"."application_releases"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_build_environments_aws_connection_idx" ON "project_build_environments" USING btree ("aws_connection_id");
--> statement-breakpoint
CREATE INDEX "project_build_environments_code_connection_idx" ON "project_build_environments" USING btree ("aws_code_connection_id");
--> statement-breakpoint
CREATE INDEX "project_execution_leases_expires_at_idx" ON "project_execution_leases" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "release_candidates_project_created_idx" ON "release_candidates" USING btree ("project_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "release_candidates_expires_at_idx" ON "release_candidates" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "release_candidates_deployment_id_idx" ON "release_candidates" USING btree ("deployment_id");
--> statement-breakpoint
CREATE INDEX "release_candidates_pipeline_run_id_idx" ON "release_candidates" USING btree ("pipeline_run_id");
--> statement-breakpoint
CREATE INDEX "application_release_steps_release_status_idx" ON "application_release_steps" USING btree ("release_id", "status");
--> statement-breakpoint
CREATE INDEX "deployments_release_candidate_id_idx" ON "deployments" USING btree ("release_candidate_id");
--> statement-breakpoint
CREATE INDEX "deployments_rollback_of_id_idx" ON "deployments" USING btree ("rollback_of_deployment_id");
--> statement-breakpoint
CREATE INDEX "deployments_rollback_target_id_idx" ON "deployments" USING btree ("rollback_target_deployment_id");
--> statement-breakpoint
CREATE INDEX "application_releases_candidate_id_idx" ON "application_releases" USING btree ("release_candidate_id");
--> statement-breakpoint
CREATE INDEX "application_releases_baseline_id_idx" ON "application_releases" USING btree ("baseline_release_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "git_cicd_pipeline_runs_release_request_key_unique" ON "git_cicd_pipeline_runs" USING btree ("release_request_key") WHERE "release_request_key" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "git_cicd_pipeline_runs_repository_commit_unique" ON "git_cicd_pipeline_runs" USING btree ("source_repository_id", "commit_sha") WHERE "release_request_key" is null;
