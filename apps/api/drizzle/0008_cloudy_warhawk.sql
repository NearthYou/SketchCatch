CREATE TYPE "public"."aws_connection_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TABLE "aws_connections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"account_id" varchar(12),
	"role_arn" text,
	"external_id" varchar(256) NOT NULL,
	"region" varchar(32) NOT NULL,
	"status" "aws_connection_status" DEFAULT 'pending' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aws_connections" ADD CONSTRAINT "aws_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_connections" ADD CONSTRAINT "aws_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aws_connections_project_id_idx" ON "aws_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "aws_connections_user_id_idx" ON "aws_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aws_connections_external_id_unique" ON "aws_connections" USING btree ("external_id");