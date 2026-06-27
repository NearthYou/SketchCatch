CREATE TABLE "deployment_plan_artifacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"deployment_id" varchar(36) NOT NULL,
	"terraform_artifact_id" varchar(36) NOT NULL,
	"object_key" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"account_id" varchar(12) NOT NULL,
	"region" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "current_plan_artifact_id" varchar(36);--> statement-breakpoint
ALTER TABLE "deployment_plan_artifacts" ADD CONSTRAINT "deployment_plan_artifacts_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_plan_artifacts" ADD CONSTRAINT "deployment_plan_artifacts_terraform_artifact_id_project_assets_id_fk" FOREIGN KEY ("terraform_artifact_id") REFERENCES "public"."project_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_plan_artifacts_deployment_id_idx" ON "deployment_plan_artifacts" USING btree ("deployment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_plan_artifacts_object_key_unique" ON "deployment_plan_artifacts" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "deployments_current_plan_artifact_id_idx" ON "deployments" USING btree ("current_plan_artifact_id");