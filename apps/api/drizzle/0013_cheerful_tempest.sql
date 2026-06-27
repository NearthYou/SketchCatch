ALTER TABLE "deployments" ADD COLUMN "approved_plan_artifact_id" varchar(36);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "approved_terraform_artifact_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "approved_tfplan_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "approved_aws_account_id" varchar(12);--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "approved_aws_region" varchar(32);--> statement-breakpoint
CREATE INDEX "deployments_approved_plan_artifact_id_idx" ON "deployments" USING btree ("approved_plan_artifact_id");