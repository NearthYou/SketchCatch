CREATE TYPE "public"."asset_type" AS ENUM('diagram_png', 'diagram_svg', 'terraform_file', 'project_export_zip', 'thumbnail');--> statement-breakpoint
CREATE TABLE "anonymous_workspaces" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "architectures" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"version" integer NOT NULL,
	"source" varchar(64) DEFAULT 'manual' NOT NULL,
	"architecture_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_assets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"architecture_id" varchar(36),
	"asset_type" "asset_type" NOT NULL,
	"object_key" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"byte_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(128) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "architectures" ADD CONSTRAINT "architectures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_architecture_id_architectures_id_fk" FOREIGN KEY ("architecture_id") REFERENCES "public"."architectures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_anonymous_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."anonymous_workspaces"("id") ON DELETE cascade ON UPDATE no action;