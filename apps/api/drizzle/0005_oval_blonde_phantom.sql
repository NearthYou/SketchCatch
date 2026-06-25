CREATE TABLE "project_drafts" (
	"project_id" varchar(36) PRIMARY KEY NOT NULL,
	"diagram_json" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"server_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_drafts" ADD CONSTRAINT "project_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;