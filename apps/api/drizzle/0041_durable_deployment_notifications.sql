CREATE TABLE "notifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"source" varchar(32) NOT NULL,
	"source_id" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"action_url" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "notifications_source_check" CHECK ("source" in ('direct_deployment', 'gitops_pipeline')),
	CONSTRAINT "notifications_status_check" CHECK ("status" in ('succeeded', 'failed', 'cancelled')),
	CONSTRAINT "notifications_action_url_check" CHECK ("action_url" ~ '^/dashboard/projects/[0-9a-f-]{36}$')
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"notification_id" varchar(36) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_notification_unique" UNIQUE("notification_id"),
	CONSTRAINT "notification_outbox_status_check" CHECK ("status" in ('pending', 'processing', 'retry', 'delivered', 'dead')),
	CONSTRAINT "notification_outbox_attempt_count_check" CHECK ("attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "web_push_subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"endpoint_hash" varchar(64) NOT NULL,
	"encrypted_payload" text NOT NULL,
	"key_version" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_push_subscriptions_endpoint_hash_unique" UNIQUE("endpoint_hash"),
	CONSTRAINT "web_push_subscriptions_failure_count_check" CHECK ("failure_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notifications_user_created_id_idx" ON "notifications" USING btree ("user_id","created_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX "notifications_expires_at_idx" ON "notifications" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "notification_outbox_dispatch_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX "web_push_subscriptions_user_id_idx" ON "web_push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "web_push_subscriptions_expires_at_idx" ON "web_push_subscriptions" USING btree ("expires_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sketchcatch_enqueue_deployment_notification"(
	"event_source" text,
	"event_source_id" text,
	"event_project_id" varchar(36),
	"event_status" text,
	"event_body" text,
	"event_created_at" timestamp with time zone
) RETURNS void AS $$
DECLARE
	"event_key" text := "event_source" || ':' || "event_source_id" || ':' || "event_status";
	"generated_notification_id" varchar(36) := 'ntf_' || md5("event_key");
	"owner_user_id" varchar(36);
BEGIN
	SELECT "user_id" INTO "owner_user_id" FROM "projects" WHERE "id" = "event_project_id";
	IF "owner_user_id" IS NULL THEN
		RETURN;
	END IF;

	INSERT INTO "notifications" (
		"id", "idempotency_key", "user_id", "project_id", "source", "source_id",
		"status", "title", "body", "action_url", "created_at", "expires_at"
	) VALUES (
		"generated_notification_id", "event_key", "owner_user_id", "event_project_id", "event_source",
		"event_source_id", "event_status",
		CASE "event_status"
			WHEN 'succeeded' THEN '배포 완료'
			WHEN 'cancelled' THEN '배포 취소'
			ELSE '배포 실패'
		END,
		"event_body", '/dashboard/projects/' || "event_project_id",
		COALESCE("event_created_at", now()), COALESCE("event_created_at", now()) + interval '90 days'
	) ON CONFLICT ("idempotency_key") DO NOTHING;

	IF FOUND THEN
		INSERT INTO "notification_outbox" ("id", "notification_id", "next_attempt_at")
		VALUES ('out_' || md5("event_key"), "generated_notification_id", now())
		ON CONFLICT ("notification_id") DO NOTHING;
	END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sketchcatch_deployment_notification_trigger"() RETURNS trigger AS $$
DECLARE
	"normalized_status" text;
BEGIN
	IF TG_OP <> 'INSERT' AND OLD."status" IS NOT DISTINCT FROM NEW."status" THEN
		RETURN NEW;
	END IF;
	IF NEW."source" <> 'direct' THEN
		RETURN NEW;
	END IF;
	IF NEW."status" NOT IN ('SUCCESS', 'FAILED', 'CANCELLED') THEN
		RETURN NEW;
	END IF;
	"normalized_status" := CASE NEW."status"
		WHEN 'SUCCESS' THEN 'succeeded'
		ELSE lower(NEW."status"::text)
	END;
	PERFORM "sketchcatch_enqueue_deployment_notification"(
		'direct_deployment', NEW."id", NEW."project_id", "normalized_status",
		'Direct · ' || substr(NEW."id", 1, 8) || ' · ' || "normalized_status",
		COALESCE(NEW."completed_at", NEW."failed_at", NEW."cancelled_at", NEW."updated_at")
	);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "deployments_terminal_notification" AFTER INSERT OR UPDATE OF "status" ON "deployments"
FOR EACH ROW EXECUTE FUNCTION "sketchcatch_deployment_notification_trigger"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sketchcatch_gitops_notification_trigger"() RETURNS trigger AS $$
BEGIN
	IF TG_OP <> 'INSERT' AND OLD."status" IS NOT DISTINCT FROM NEW."status" THEN
		RETURN NEW;
	END IF;
	IF NEW."status" NOT IN ('succeeded', 'failed', 'cancelled') THEN
		RETURN NEW;
	END IF;
	PERFORM "sketchcatch_enqueue_deployment_notification"(
		'gitops_pipeline', NEW."id", NEW."project_id", NEW."status",
		'GitOps · ' || NEW."branch" || ' · ' || substr(NEW."commit_sha", 1, 8) || ' · ' || NEW."status",
		COALESCE(NEW."finished_at", NEW."last_refreshed_at")
	);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "git_cicd_pipeline_runs_terminal_notification" AFTER INSERT OR UPDATE OF "status" ON "git_cicd_pipeline_runs"
FOR EACH ROW EXECUTE FUNCTION "sketchcatch_gitops_notification_trigger"();
