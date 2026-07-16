ALTER TABLE "deployments" ADD COLUMN "scope" varchar(32) DEFAULT 'infrastructure' NOT NULL;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "target_kind" varchar(32);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "source" varchar(16) DEFAULT 'direct' NOT NULL;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "release_id" varchar(36);
--> statement-breakpoint
UPDATE "deployments"
SET "scope" = 'full_stack', "target_kind" = 'ecs_fargate'
WHERE "live_profile" IN ('demo_web_service', 'demo_web_service_with_rds');
--> statement-breakpoint
CREATE TABLE "project_deployment_targets" (
	"project_id" varchar(36) PRIMARY KEY NOT NULL,
	"provider" varchar(32) DEFAULT 'aws' NOT NULL,
	"connection_id" varchar(36) NOT NULL,
	"region" varchar(32) NOT NULL,
	"runtime_target_kind" varchar(32) NOT NULL,
	"confirmed_build_config" jsonb,
	"rollout_strategy" varchar(32) DEFAULT 'all_at_once' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_deployment_targets_provider_check" CHECK ("provider" = 'aws'),
	CONSTRAINT "project_deployment_targets_runtime_kind_check" CHECK ("runtime_target_kind" in ('ecs_fargate', 'lambda', 'ec2_asg', 'static_site')),
	CONSTRAINT "project_deployment_targets_rollout_check" CHECK ("rollout_strategy" = 'all_at_once')
);
--> statement-breakpoint
CREATE TABLE "application_releases" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"deployment_id" varchar(36),
	"pipeline_run_id" varchar(36),
	"source" varchar(16) NOT NULL,
	"runtime_target_kind" varchar(32) NOT NULL,
	"version" varchar(128) NOT NULL,
	"commit_sha" varchar(64) NOT NULL,
	"artifact_digest_algorithm" varchar(16) DEFAULT 'sha256' NOT NULL,
	"artifact_digest" varchar(64) NOT NULL,
	"provider_revision" jsonb,
	"output_url" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"health_evidence" jsonb,
	"rollback_evidence" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_releases_source_check" CHECK ("source" in ('direct', 'gitops')),
	CONSTRAINT "application_releases_runtime_kind_check" CHECK ("runtime_target_kind" in ('ecs_fargate', 'lambda', 'ec2_asg', 'static_site')),
	CONSTRAINT "application_releases_status_check" CHECK ("status" in ('pending', 'building', 'deploying', 'succeeded', 'failed', 'rolled_back', 'cancelled')),
	CONSTRAINT "application_releases_digest_check" CHECK ("artifact_digest_algorithm" = 'sha256' and "artifact_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "application_releases_commit_sha_check" CHECK ("commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$')
);
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD CONSTRAINT "project_deployment_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD CONSTRAINT "project_deployment_targets_connection_id_aws_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_pipeline_run_id_git_cicd_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."git_cicd_pipeline_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_release_id_application_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."application_releases"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_deployment_targets_connection_id_idx" ON "project_deployment_targets" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "application_releases_project_created_id_idx" ON "application_releases" USING btree ("project_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "application_releases_deployment_unique" ON "application_releases" USING btree ("deployment_id") WHERE "deployment_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "application_releases_pipeline_run_unique" ON "application_releases" USING btree ("pipeline_run_id") WHERE "pipeline_run_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_release_id_unique" ON "deployments" USING btree ("release_id") WHERE "release_id" is not null;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_scope_check" CHECK ("scope" in ('infrastructure', 'application', 'full_stack')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_target_kind_check" CHECK ("target_kind" is null or "target_kind" in ('ecs_fargate', 'lambda', 'ec2_asg', 'static_site')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_source_check" CHECK ("source" in ('direct', 'gitops')) NOT VALID;
--> statement-breakpoint
INSERT INTO "project_deployment_targets" (
  "project_id", "provider", "connection_id", "region", "runtime_target_kind", "confirmed_build_config", "rollout_strategy"
)
SELECT DISTINCT ON (deployment."project_id")
  deployment."project_id",
  'aws',
  deployment."aws_connection_id",
  COALESCE(deployment."approved_aws_region", connection."region"),
  'ecs_fargate',
  NULL,
  'all_at_once'
FROM "deployments" AS deployment
JOIN "aws_connections" AS connection ON connection."id" = deployment."aws_connection_id"
WHERE deployment."live_profile" IN ('demo_web_service', 'demo_web_service_with_rds')
  AND connection."status" = 'verified'
ORDER BY deployment."project_id", deployment."created_at" DESC, deployment."id" DESC
ON CONFLICT ("project_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "deployments" VALIDATE CONSTRAINT "deployments_scope_check";
--> statement-breakpoint
ALTER TABLE "deployments" VALIDATE CONSTRAINT "deployments_target_kind_check";
--> statement-breakpoint
ALTER TABLE "deployments" VALIDATE CONSTRAINT "deployments_source_check";
