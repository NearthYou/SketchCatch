-- sketchcatch:contract-migration-after: v0.1.0
ALTER TABLE "git_cicd_pipeline_runs" ADD COLUMN "execution_kind" varchar(16);
--> statement-breakpoint
UPDATE "git_cicd_pipeline_runs"
SET "execution_kind" = CASE
	WHEN "change_scope" = 'infra' THEN 'infra'
	ELSE 'app'
END;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ALTER COLUMN "execution_kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ALTER COLUMN "execution_kind" SET DEFAULT 'app';
--> statement-breakpoint
ALTER TABLE "git_cicd_pipeline_runs" ADD CONSTRAINT "git_cicd_pipeline_runs_execution_kind_check" CHECK ("execution_kind" IN ('app', 'infra'));
--> statement-breakpoint
DROP INDEX "git_cicd_pipeline_runs_repository_commit_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "git_cicd_pipeline_runs_github_run_unique" ON "git_cicd_pipeline_runs" USING btree ("source_repository_id", "github_workflow_run_id", "github_workflow_run_attempt") WHERE "github_workflow_run_id" IS NOT NULL AND "github_workflow_run_attempt" IS NOT NULL;
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
		COALESCE(
			NEW."status_message",
			CASE NEW."execution_kind"
				WHEN 'infra' THEN '인프라 배포 상태를 확인해 주세요.'
				ELSE '애플리케이션 배포 상태를 확인해 주세요.'
			END
		),
		COALESCE(NEW."finished_at", NEW."last_refreshed_at")
	);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
