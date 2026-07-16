CREATE TABLE "application_artifacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"source_repository_id" varchar(36),
	"kind" varchar(32) NOT NULL,
	"artifact_fingerprint" varchar(64) NOT NULL,
	"repository_identity" text NOT NULL,
	"commit_sha" varchar(64) NOT NULL,
	"build_config_sha256" varchar(64) NOT NULL,
	"build_contract_version" varchar(128) NOT NULL,
	"target_os" varchar(64) NOT NULL,
	"target_architecture" varchar(64) NOT NULL,
	"build_input_identity_sha256" varchar(64) NOT NULL,
	"digest_algorithm" varchar(16),
	"digest" varchar(64),
	"provider" varchar(32),
	"provider_account_id" varchar(128),
	"provider_region" varchar(64),
	"storage_namespace" text,
	"artifact_reference" text,
	"ownership_scope" varchar(128),
	"status" varchar(16) DEFAULT 'building' NOT NULL,
	"claim_token_sha256" varchar(64),
	"claim_expires_at" timestamp with time zone,
	"failure_reason" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_artifacts_kind_check" CHECK ("kind" in ('container_image', 'lambda_zip', 'codedeploy_bundle', 'static_bundle', 'kubernetes_manifest', 'helm_chart', 'machine_image')),
	CONSTRAINT "application_artifacts_status_check" CHECK ("status" in ('building', 'available', 'invalid', 'failed')),
	CONSTRAINT "application_artifacts_identity_hashes_check" CHECK ("artifact_fingerprint" ~ '^[0-9a-f]{64}$' and "build_config_sha256" ~ '^[0-9a-f]{64}$' and "build_input_identity_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "application_artifacts_commit_sha_check" CHECK ("commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
	CONSTRAINT "application_artifacts_payload_check" CHECK ((
		"status" = 'building'
		and "claim_token_sha256" ~ '^[0-9a-f]{64}$'
		and "claim_expires_at" is not null
		and "digest" is null
	) or (
		"status" in ('available', 'invalid')
		and "claim_token_sha256" is null
		and "claim_expires_at" is null
		and "digest_algorithm" = 'sha256'
		and "digest" ~ '^[0-9a-f]{64}$'
		and "provider" in ('aws', 'kubernetes')
		and "provider_account_id" is not null
		and "provider_region" is not null
		and "storage_namespace" is not null
		and "artifact_reference" is not null
		and "ownership_scope" is not null
	) or (
		"status" = 'failed'
		and "claim_token_sha256" is null
		and "claim_expires_at" is null
	))
);
--> statement-breakpoint
ALTER TABLE "application_artifacts" ADD CONSTRAINT "application_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_artifacts" ADD CONSTRAINT "application_artifacts_source_repository_id_source_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."source_repositories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "application_artifacts_id_project_unique" ON "application_artifacts" USING btree ("id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_artifacts_project_fingerprint_active_unique" ON "application_artifacts" USING btree ("project_id","artifact_fingerprint") WHERE "status" in ('building', 'available');
--> statement-breakpoint
CREATE INDEX "application_artifacts_project_created_id_idx" ON "application_artifacts" USING btree ("project_id","created_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX "application_artifacts_source_repository_id_idx" ON "application_artifacts" USING btree ("source_repository_id");
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "artifact_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_artifact_project_fk" FOREIGN KEY ("artifact_id","project_id") REFERENCES "public"."application_artifacts"("id","project_id") ON DELETE no action ON UPDATE no action;
