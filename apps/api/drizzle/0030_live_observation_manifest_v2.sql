CREATE TYPE "public"."deployment_live_observation_manifest_status" AS ENUM('valid', 'manifest_invalid');--> statement-breakpoint
CREATE TABLE "deployment_live_observation_manifests" (
	"deployment_id" varchar(36) PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"status" "deployment_live_observation_manifest_status" NOT NULL,
	"manifest" jsonb,
	"invalid_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_live_observation_manifests_schema_version_check" CHECK ("deployment_live_observation_manifests"."schema_version" = 2)
);
--> statement-breakpoint
ALTER TABLE "deployment_live_observation_manifests" ADD CONSTRAINT "deployment_live_observation_manifests_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
