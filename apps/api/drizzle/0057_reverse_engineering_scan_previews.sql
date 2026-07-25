CREATE TABLE "reverse_engineering_scan_previews" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"aws_connection_id" varchar(36),
	"provider" varchar(32) DEFAULT 'aws' NOT NULL,
	"region" varchar(32) NOT NULL,
	"resource_types" jsonb NOT NULL,
	"raw_result" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_project_id" varchar(36),
	"claimed_scan_id" varchar(36),
	"claimed_draft_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reverse_engineering_scan_previews" ADD CONSTRAINT "reverse_engineering_previews_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reverse_engineering_scan_previews" ADD CONSTRAINT "reverse_engineering_previews_connection_fk" FOREIGN KEY ("aws_connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reverse_engineering_scan_previews" ADD CONSTRAINT "reverse_engineering_previews_project_fk" FOREIGN KEY ("claimed_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reverse_engineering_scan_previews" ADD CONSTRAINT "reverse_engineering_previews_scan_fk" FOREIGN KEY ("claimed_scan_id") REFERENCES "public"."reverse_engineering_scans"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reverse_engineering_scan_previews" ADD CONSTRAINT "reverse_engineering_previews_draft_fk" FOREIGN KEY ("claimed_draft_id") REFERENCES "public"."project_drafts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "reverse_engineering_scan_previews_user_id_idx" ON "reverse_engineering_scan_previews" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "reverse_engineering_scan_previews_expires_at_idx" ON "reverse_engineering_scan_previews" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "reverse_engineering_scan_previews_claimed_at_idx" ON "reverse_engineering_scan_previews" USING btree ("claimed_at");
