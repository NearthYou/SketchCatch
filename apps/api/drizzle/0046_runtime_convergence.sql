ALTER TABLE "project_deployment_targets" ADD COLUMN "runtime_target" jsonb;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD COLUMN "deployment_target_fingerprint" varchar(64);
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD CONSTRAINT "project_deployment_targets_runtime_convergence_check" CHECK ((
	"runtime_target" is null
	and "deployment_target_fingerprint" is null
) or (
	jsonb_typeof("runtime_target") = 'object'
	and "runtime_target"->>'adapterKind' in ('ecs_service_fargate', 'ecs_service_ec2_capacity_provider', 'ec2_instance', 'ec2_auto_scaling_group', 'eks_managed_node_group', 'eks_self_managed_node', 'eks_fargate_profile', 'kubernetes_deployment', 'lambda_alias', 'static_s3_cloudfront')
	and "deployment_target_fingerprint" ~ '^[0-9a-f]{64}$'
));
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "runtime_adapter_kind" varchar(64);
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "deployment_target_fingerprint" varchar(64);
--> statement-breakpoint
ALTER TABLE "application_releases" ADD COLUMN "convergence_outcome" varchar(32);
--> statement-breakpoint
ALTER TABLE "application_releases" ADD CONSTRAINT "application_releases_runtime_convergence_check" CHECK ((
	"runtime_adapter_kind" is null
	and "deployment_target_fingerprint" is null
	and "convergence_outcome" is null
) or (
	"runtime_adapter_kind" in ('ecs_service_fargate', 'ecs_service_ec2_capacity_provider', 'ec2_instance', 'ec2_auto_scaling_group', 'eks_managed_node_group', 'eks_self_managed_node', 'eks_fargate_profile', 'kubernetes_deployment', 'lambda_alias', 'static_s3_cloudfront')
	and "deployment_target_fingerprint" ~ '^[0-9a-f]{64}$'
	and ("convergence_outcome" is null or "convergence_outcome" in ('already_active', 'rolled_out'))
));
