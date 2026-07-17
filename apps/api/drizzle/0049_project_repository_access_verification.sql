ALTER TABLE "project_build_environments"
  ADD COLUMN "repository_verification_status" varchar(32) DEFAULT 'not_checked' NOT NULL,
  ADD COLUMN "repository_verification_requested_commit_sha" varchar(64),
  ADD COLUMN "repository_verification_resolved_commit_sha" varchar(64),
  ADD COLUMN "repository_verification_build_arn" text,
  ADD COLUMN "repository_verification_status_reason" text,
  ADD COLUMN "repository_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "project_build_environments"
  ADD CONSTRAINT "project_build_environments_repository_verification_status_check"
  CHECK ("repository_verification_status" in ('not_checked', 'verified', 'failed'));
--> statement-breakpoint
ALTER TABLE "project_build_environments"
  ADD CONSTRAINT "project_build_environments_repository_verification_requested_sha_check"
  CHECK ("repository_verification_requested_commit_sha" is null or "repository_verification_requested_commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
--> statement-breakpoint
ALTER TABLE "project_build_environments"
  ADD CONSTRAINT "project_build_environments_repository_verification_resolved_sha_check"
  CHECK ("repository_verification_resolved_commit_sha" is null or "repository_verification_resolved_commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
--> statement-breakpoint
ALTER TABLE "project_build_environments"
  ADD CONSTRAINT "project_build_environments_repository_verification_evidence_check"
  CHECK (
    "repository_verification_status" <> 'verified'
    or (
      "repository_verification_requested_commit_sha" is not null
      and "repository_verification_resolved_commit_sha" = "repository_verification_requested_commit_sha"
      and "repository_verification_build_arn" is not null
      and "repository_verification_status_reason" is null
      and "repository_verified_at" is not null
    )
  );
