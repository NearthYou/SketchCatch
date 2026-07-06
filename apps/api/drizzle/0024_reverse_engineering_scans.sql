CREATE TYPE "public"."reverse_engineering_scan_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."reverse_engineering_scan_stage" AS ENUM('credential', 'region', 'provider_api', 'normalize', 'draft', 'analysis', 'import_suggestion');
CREATE TYPE "public"."reverse_engineering_scan_log_level" AS ENUM('INFO', 'WARN', 'ERROR');

CREATE TABLE "reverse_engineering_scans" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "aws_connection_id" varchar(36) NOT NULL,
  "provider" varchar(32) DEFAULT 'aws' NOT NULL,
  "region" varchar(32) NOT NULL,
  "resource_types" jsonb NOT NULL,
  "status" "reverse_engineering_scan_status" DEFAULT 'queued' NOT NULL,
  "result" jsonb,
  "error_summary" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancel_requested_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "reverse_engineering_scan_logs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "scan_id" varchar(36) NOT NULL,
  "sequence" integer NOT NULL,
  "stage" "reverse_engineering_scan_stage" NOT NULL,
  "level" "reverse_engineering_scan_log_level" NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "reverse_engineering_scans"
  ADD CONSTRAINT "reverse_engineering_scans_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "reverse_engineering_scans"
  ADD CONSTRAINT "reverse_engineering_scans_aws_connection_id_aws_connections_id_fk"
  FOREIGN KEY ("aws_connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "reverse_engineering_scan_logs"
  ADD CONSTRAINT "reverse_engineering_scan_logs_scan_id_reverse_engineering_scans_id_fk"
  FOREIGN KEY ("scan_id") REFERENCES "public"."reverse_engineering_scans"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "reverse_engineering_scans_project_id_idx" ON "reverse_engineering_scans" USING btree ("project_id");
CREATE INDEX "reverse_engineering_scans_status_idx" ON "reverse_engineering_scans" USING btree ("status");
CREATE INDEX "reverse_engineering_scans_aws_connection_id_idx" ON "reverse_engineering_scans" USING btree ("aws_connection_id");
CREATE INDEX "reverse_engineering_scan_logs_scan_id_idx" ON "reverse_engineering_scan_logs" USING btree ("scan_id");
CREATE UNIQUE INDEX "reverse_engineering_scan_logs_scan_sequence_unique" ON "reverse_engineering_scan_logs" USING btree ("scan_id", "sequence");
