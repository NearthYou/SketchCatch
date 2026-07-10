CREATE TYPE "public"."source_repository_status" AS ENUM('active', 'inactive');

CREATE TABLE "source_repositories" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "provider" "git_cicd_repository_provider" NOT NULL,
  "status" "source_repository_status" DEFAULT 'active' NOT NULL,
  "github_installation_id" varchar(128),
  "github_repository_id" varchar(128),
  "owner" varchar(120) NOT NULL,
  "name" varchar(120) NOT NULL,
  "default_branch" varchar(255) NOT NULL,
  "repository_url" text,
  "visibility" varchar(20),
  "archived" boolean DEFAULT false NOT NULL,
  "disconnected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "source_repositories"
  ADD CONSTRAINT "source_repositories_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "source_repositories"
  ADD CONSTRAINT "source_repositories_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;

CREATE INDEX "source_repositories_project_id_idx"
  ON "source_repositories" USING btree ("project_id");

CREATE INDEX "source_repositories_created_by_user_id_idx"
  ON "source_repositories" USING btree ("created_by_user_id");

CREATE INDEX "source_repositories_provider_status_idx"
  ON "source_repositories" USING btree ("provider", "status");

CREATE UNIQUE INDEX "source_repositories_active_project_provider_unique"
  ON "source_repositories" USING btree ("project_id", "provider")
  WHERE "source_repositories"."status" = 'active';

CREATE UNIQUE INDEX "source_repositories_github_repository_unique"
  ON "source_repositories" USING btree ("project_id", "provider", "github_repository_id")
  WHERE "source_repositories"."status" = 'active'
    AND "source_repositories"."github_repository_id" IS NOT NULL;

ALTER TABLE "git_cicd_handoffs"
  ADD COLUMN "pull_request_head_sha" varchar(64);
