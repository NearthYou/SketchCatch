CREATE TABLE "repository_analysis_records" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"repository_url" text NOT NULL,
	"owner" varchar(120) NOT NULL,
	"name" varchar(120) NOT NULL,
	"branch" varchar(255) NOT NULL,
	"repository_revision" varchar(128) NOT NULL,
	"analysis_result" jsonb NOT NULL,
	"selected_template_id" varchar(128),
	"source_repository_id" varchar(36),
	"analyzed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_analysis_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "repository_analysis_records_source_repository_id_source_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."source_repositories"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "repository_analysis_records_provider_check" CHECK ("repository_analysis_records"."provider" = 'github')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "repository_analysis_records_project_unique" ON "repository_analysis_records" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "repository_analysis_records_source_repository_idx" ON "repository_analysis_records" USING btree ("source_repository_id");
