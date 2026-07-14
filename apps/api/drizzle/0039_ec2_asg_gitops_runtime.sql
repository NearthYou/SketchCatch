ALTER TABLE "project_deployment_targets"
  DROP CONSTRAINT "project_deployment_targets_runtime_config_check";
--> statement-breakpoint
ALTER TABLE "project_deployment_targets"
  ADD CONSTRAINT "project_deployment_targets_runtime_config_check"
  CHECK (
    "runtime_config" IS NULL
    OR (
      jsonb_typeof("runtime_config") = 'object'
      AND (
        ("runtime_target_kind" = 'ecs_fargate' AND "runtime_config"->>'runtimeTargetKind' = 'ecs_fargate')
        OR ("runtime_target_kind" = 'lambda' AND "runtime_config"->>'runtimeTargetKind' = 'lambda')
        OR ("runtime_target_kind" = 'ec2_asg' AND "runtime_config"->>'runtimeTargetKind' = 'ec2_asg')
      )
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets"
  VALIDATE CONSTRAINT "project_deployment_targets_runtime_config_check";
