CREATE TABLE "github_installation_connections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"github_installation_id" varchar(128) NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"account_login" varchar(255) NOT NULL,
	"account_type" varchar(64),
	"repository_selection" varchar(32),
	"html_url" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installation_connections_status_check" CHECK ("github_installation_connections"."status" IN ('active', 'disconnected')),
	CONSTRAINT "github_installation_connections_repository_selection_check" CHECK ("github_installation_connections"."repository_selection" IS NULL OR "github_installation_connections"."repository_selection" IN ('all', 'selected'))
);
--> statement-breakpoint
ALTER TABLE "github_installation_connections" ADD CONSTRAINT "github_installation_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "github_installation_connections_installation_unique" ON "github_installation_connections" USING btree ("github_installation_id");
--> statement-breakpoint
CREATE INDEX "github_installation_connections_user_status_idx" ON "github_installation_connections" USING btree ("user_id","status");
