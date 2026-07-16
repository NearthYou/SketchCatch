ALTER TABLE "project_deployment_targets"
  ADD COLUMN "runtime_config" jsonb;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets"
  ADD CONSTRAINT "project_deployment_targets_runtime_config_check"
  CHECK (
    "runtime_config" IS NULL
    OR (
      "runtime_target_kind" = 'ecs_fargate'
      AND jsonb_typeof("runtime_config") = 'object'
      AND "runtime_config"->>'runtimeTargetKind' = 'ecs_fargate'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets"
  VALIDATE CONSTRAINT "project_deployment_targets_runtime_config_check";
