ALTER TABLE "deployment_plan_artifacts"
  ADD COLUMN "state_baseline_deployment_id" varchar(36),
  ADD COLUMN "state_object_key" text,
  ADD COLUMN "state_lineage_sha256" varchar(64),
  ADD COLUMN "state_serial" integer;
--> statement-breakpoint
ALTER TABLE "deployment_plan_artifacts"
  ADD CONSTRAINT "deployment_plan_artifacts_state_serial_check"
  CHECK ("state_serial" IS NULL OR "state_serial" >= 0);
--> statement-breakpoint
ALTER TABLE "deployment_plan_artifacts"
  ADD CONSTRAINT "deployment_plan_artifacts_state_identity_check"
  CHECK (
    (
      "state_baseline_deployment_id" IS NULL
      AND "state_object_key" IS NULL
      AND "state_lineage_sha256" IS NULL
      AND "state_serial" IS NULL
    )
    OR
    (
      "state_baseline_deployment_id" IS NOT NULL
      AND "state_object_key" IS NOT NULL
      AND "state_lineage_sha256" IS NOT NULL
      AND "state_serial" IS NOT NULL
    )
  );
