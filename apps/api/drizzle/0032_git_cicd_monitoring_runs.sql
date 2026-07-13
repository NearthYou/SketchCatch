CREATE TABLE "git_cicd_monitoring_configs" (
	"source_repository_id" varchar(36) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"monitor_branch" varchar(255) NOT NULL,
	"app_path" jsonb NOT NULL,
	"infra_path" jsonb NOT NULL,
	"validation_status" varchar(16) DEFAULT 'required' NOT NULL,
	"validation_message" text,
	"validated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "git_cicd_pipeline_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"source_repository_id" varchar(36) NOT NULL,
	"handoff_id" varchar(36),
	"commit_sha" varchar(64) NOT NULL,
	"commit_message" text NOT NULL,
	"branch" varchar(255) NOT NULL,
	"change_scope" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"status_message" text,
	"pipeline_run_url" text,
	"app_url" text,
	"api_url" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "git_cicd_pipeline_stages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"pipeline_run_id" varchar(36) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"run_url" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "git_cicd_pipeline_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"pipeline_run_id" varchar(36) NOT NULL,
	"stage_id" varchar(36),
	"sequence" integer NOT NULL,
	"level" varchar(16) NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "git_cicd_monitoring_configs" ADD CONSTRAINT "git_cicd_monitoring_configs_source_repository_id_source_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."source_repositories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD CONSTRAINT "git_cicd_pipeline_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD CONSTRAINT "git_cicd_pipeline_runs_source_repository_id_source_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."source_repositories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD CONSTRAINT "git_cicd_pipeline_runs_handoff_id_git_cicd_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."git_cicd_handoffs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_stages" ADD CONSTRAINT "git_cicd_pipeline_stages_pipeline_run_id_git_cicd_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."git_cicd_pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_logs" ADD CONSTRAINT "git_cicd_pipeline_logs_pipeline_run_id_git_cicd_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."git_cicd_pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_logs" ADD CONSTRAINT "git_cicd_pipeline_logs_stage_id_git_cicd_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."git_cicd_pipeline_stages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "git_cicd_pipeline_runs_repository_commit_unique" ON "git_cicd_pipeline_runs" USING btree ("source_repository_id","commit_sha");
--> statement-breakpoint
CREATE INDEX "git_cicd_pipeline_runs_project_id_idx" ON "git_cicd_pipeline_runs" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "git_cicd_pipeline_runs_project_created_id_idx" ON "git_cicd_pipeline_runs" USING btree ("project_id","created_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX "git_cicd_pipeline_runs_status_idx" ON "git_cicd_pipeline_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "git_cicd_pipeline_runs_created_at_idx" ON "git_cicd_pipeline_runs" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "git_cicd_pipeline_stages_run_kind_unique" ON "git_cicd_pipeline_stages" USING btree ("pipeline_run_id","kind");
--> statement-breakpoint
CREATE UNIQUE INDEX "git_cicd_pipeline_logs_run_sequence_unique" ON "git_cicd_pipeline_logs" USING btree ("pipeline_run_id","sequence");
--> statement-breakpoint
INSERT INTO "git_cicd_monitoring_configs" (
	"source_repository_id", "enabled", "monitor_branch", "app_path", "infra_path", "validation_status"
)
SELECT "id", true, "default_branch", '{"mode":"repository_root","path":"."}'::jsonb,
	'{"mode":"repository_root","path":"."}'::jsonb, 'required'
FROM "source_repositories"
WHERE "status" = 'active';
