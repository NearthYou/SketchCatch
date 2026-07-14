ALTER TABLE "deployments"
  ADD COLUMN "prepared_draft_revision" integer,
  ADD COLUMN "prepared_snapshot_hash" varchar(64),
  ADD COLUMN "approved_prepared_snapshot_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_prepared_snapshot_pair_check"
  CHECK (
    ("prepared_draft_revision" IS NULL AND "prepared_snapshot_hash" IS NULL)
    OR
    (
      "prepared_draft_revision" > 0
      AND "prepared_snapshot_hash" ~ '^[0-9a-f]{64}$'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE "deployments"
  VALIDATE CONSTRAINT "deployments_prepared_snapshot_pair_check";
--> statement-breakpoint
ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_approved_prepared_snapshot_hash_check"
  CHECK (
    "approved_prepared_snapshot_hash" IS NULL
    OR "approved_prepared_snapshot_hash" ~ '^[0-9a-f]{64}$'
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE "deployments"
  VALIDATE CONSTRAINT "deployments_approved_prepared_snapshot_hash_check";
--> statement-breakpoint
CREATE INDEX "deployments_project_prepared_revision_idx"
  ON "deployments" USING btree ("project_id", "prepared_draft_revision");
