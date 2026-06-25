CREATE TABLE "deployments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"architecture_id" varchar(36) NOT NULL,
	"terraform_artifact_id" varchar(36) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_architecture_id_architectures_id_fk" FOREIGN KEY ("architecture_id") REFERENCES "public"."architectures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_terraform_artifact_id_project_assets_id_fk" FOREIGN KEY ("terraform_artifact_id") REFERENCES "public"."project_assets"("id") ON DELETE restrict ON UPDATE no action;