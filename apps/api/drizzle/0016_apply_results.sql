ALTER TYPE "public"."deployment_failure_stage" ADD VALUE 'apply';--> statement-breakpoint
CREATE TABLE "deployed_resources" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"deployment_id" varchar(36) NOT NULL,
	"terraform_address" text NOT NULL,
	"terraform_type" varchar(128) NOT NULL,
	"provider_name" text,
	"resource_id" text,
	"region" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terraform_outputs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"deployment_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"value" jsonb,
	"sensitive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "state_object_key" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "result_warning_summary" text;--> statement-breakpoint
ALTER TABLE "deployed_resources" ADD CONSTRAINT "deployed_resources_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terraform_outputs" ADD CONSTRAINT "terraform_outputs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployed_resources_deployment_id_idx" ON "deployed_resources" USING btree ("deployment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deployed_resources_deployment_address_unique" ON "deployed_resources" USING btree ("deployment_id","terraform_address");--> statement-breakpoint
CREATE INDEX "terraform_outputs_deployment_id_idx" ON "terraform_outputs" USING btree ("deployment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terraform_outputs_deployment_name_unique" ON "terraform_outputs" USING btree ("deployment_id","name");