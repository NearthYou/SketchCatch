import type {
  CloudProvider,
  ResourceType,
  ReverseEngineeringResourceSelection,
  TerraformBlockType
} from "./index.js";
import type { RuntimeAdapterKind } from "./runtime-convergence.js";

export type ResourceDeploymentOptimizationProfile =
  | {
      readonly desiredStateReuse: "verified";
      readonly artifactReuse: "none";
      readonly runtimeNoOp: "none";
      readonly healthVerification: "terraform_plan";
    }
  | {
      readonly desiredStateReuse: "none";
      readonly artifactReuse: "none";
      readonly runtimeNoOp: "none";
      readonly healthVerification: "none";
    }
  | {
      readonly desiredStateReuse: "verified";
      readonly artifactReuse: "verified";
      readonly runtimeNoOp: "provider_verified";
      readonly healthVerification: "provider";
      readonly runtimeAdapters: readonly RuntimeAdapterKind[];
    };

export type ResourceDeploymentCapability =
  | {
      readonly status: "supported";
      readonly provisioner: "terraform";
      readonly executionRole: "managed_resource";
      readonly optimization: Extract<
        ResourceDeploymentOptimizationProfile,
        { readonly desiredStateReuse: "verified" }
      >;
    }
  | {
      readonly status: "excluded";
      readonly provisioner: "terraform";
      readonly executionRole: "managed_resource" | "data_source" | "catalog_resource";
      readonly reason: "terraform_data_source" | "unmodeled_resource" | "catalog_only";
      readonly optimization: Extract<
        ResourceDeploymentOptimizationProfile,
        { readonly desiredStateReuse: "none" }
      >;
    };

export type ResourceCapability = {
  readonly terraformPreview: boolean;
  readonly terraformSync: boolean;
  readonly parameterPanel: boolean;
  readonly deployment: ResourceDeploymentCapability;
};

export type ResourceDefinition = {
  readonly id: string;
  readonly provider: CloudProvider;
  readonly resourceType: ResourceType;
  readonly terraform: {
    readonly blockType: TerraformBlockType;
    readonly resourceType: string;
  };
  readonly capabilities: ResourceCapability;
};

type AwsResourceDefinitionInput = {
  readonly id: string;
  readonly parameterPanel?: boolean | undefined;
  readonly resourceType?: ResourceType | undefined;
  readonly terraformBlockType?: TerraformBlockType | undefined;
  readonly terraformPreview?: boolean | undefined;
  readonly terraformResourceType: string;
  readonly terraformSync?: boolean | undefined;
};

export type ResourceDefinitionInput = Omit<AwsResourceDefinitionInput, "terraformResourceType"> & {
  readonly provider: CloudProvider;
  readonly terraformResourceType: string;
};

const DEFAULT_RESOURCE_TYPE: ResourceType = "UNKNOWN";
const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const RUNTIME_ADAPTERS_BY_TERRAFORM_RESOURCE = {
  aws_cloudfront_distribution: ["static_s3_cloudfront"],
  aws_instance: ["ec2_instance"],
  aws_autoscaling_group: ["ec2_auto_scaling_group", "eks_self_managed_node"],
  aws_s3_bucket: ["static_s3_cloudfront"],
  aws_lambda_alias: ["lambda_alias"],
  aws_ecs_service: ["ecs_service_fargate", "ecs_service_ec2_capacity_provider"],
  aws_eks_node_group: ["eks_managed_node_group"],
  aws_eks_fargate_profile: ["eks_fargate_profile"],
  kubernetes_deployment: ["kubernetes_deployment"]
} as const satisfies Readonly<Record<string, readonly RuntimeAdapterKind[]>>;

export const runtimeAdapterResourceCoverage = Object.freeze(
  Object.entries(RUNTIME_ADAPTERS_BY_TERRAFORM_RESOURCE).flatMap(
    ([terraformResourceType, adapterKinds]) =>
      adapterKinds.map((adapterKind) => ({ adapterKind, terraformResourceType }))
  )
);
const DEFAULT_RESOURCE_DEFINITION_ALIASES = [
  ["RDS_READ_REPLICA", "aws-rds-instance"]
] as const satisfies readonly (readonly [ResourceType, string])[];

export const resourceDefinitions = [
  createResourceDefinition({
    id: "terraform-random-password",
    provider: "aws",
    resourceType: "RANDOM_PASSWORD",
    parameterPanel: false,
    terraformPreview: true,
    terraformResourceType: "random_password",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-vpc",
    resourceType: "VPC",
    terraformPreview: true,
    terraformResourceType: "aws_vpc",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-subnet",
    resourceType: "SUBNET",
    terraformPreview: true,
    terraformResourceType: "aws_subnet",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-internet-gateway",
    resourceType: "INTERNET_GATEWAY",
    terraformPreview: true,
    terraformResourceType: "aws_internet_gateway",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-route-table",
    resourceType: "ROUTE_TABLE",
    terraformPreview: true,
    terraformResourceType: "aws_route_table",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-route-table-association",
    resourceType: "ROUTE_TABLE_ASSOCIATION",
    terraformPreview: true,
    terraformResourceType: "aws_route_table_association",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-route",
    resourceType: "ROUTE_TABLE",
    terraformPreview: true,
    terraformResourceType: "aws_route",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-network-acl",
    resourceType: "NETWORK_ACL",
    terraformPreview: true,
    terraformResourceType: "aws_network_acl",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-network-acl-rule",
    resourceType: "NETWORK_ACL_RULE",
    terraformPreview: true,
    terraformResourceType: "aws_network_acl_rule",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudfront-distribution",
    resourceType: "CLOUDFRONT",
    terraformPreview: true,
    terraformResourceType: "aws_cloudfront_distribution",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudfront-origin-access-control",
    resourceType: "CLOUDFRONT",
    terraformPreview: true,
    terraformResourceType: "aws_cloudfront_origin_access_control",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudfront-cache-policy",
    resourceType: "CLOUDFRONT",
    terraformPreview: true,
    terraformResourceType: "aws_cloudfront_cache_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudfront-origin-request-policy",
    resourceType: "CLOUDFRONT",
    terraformPreview: true,
    terraformResourceType: "aws_cloudfront_origin_request_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-route53-record",
    resourceType: "ROUTE53_RECORD",
    terraformPreview: true,
    terraformResourceType: "aws_route53_record",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-route53-zone",
    resourceType: "ROUTE53_ZONE",
    terraformPreview: true,
    terraformResourceType: "aws_route53_zone",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-wafv2-web-acl",
    resourceType: "WAF_WEB_ACL",
    terraformPreview: true,
    terraformResourceType: "aws_wafv2_web_acl",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-wafv2-web-acl-association",
    resourceType: "WAF_WEB_ACL_ASSOCIATION",
    terraformPreview: true,
    terraformResourceType: "aws_wafv2_web_acl_association",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-nat-gateway",
    resourceType: "NAT_GATEWAY",
    terraformPreview: true,
    terraformResourceType: "aws_nat_gateway",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-vpc-endpoint",
    resourceType: "VPC_ENDPOINT",
    terraformPreview: true,
    terraformResourceType: "aws_vpc_endpoint",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-vpc-peering-connection",
    resourceType: "VPC_PEERING_CONNECTION",
    terraformPreview: true,
    terraformResourceType: "aws_vpc_peering_connection",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-security-group",
    resourceType: "SECURITY_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_security_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-security-group-rule",
    resourceType: "SECURITY_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_security_group_rule",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-role",
    resourceType: "IAM_ROLE",
    terraformPreview: true,
    terraformResourceType: "aws_iam_role",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-policy",
    resourceType: "IAM_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_iam_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-role-policy",
    resourceType: "IAM_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_iam_role_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-role-policy-attachment",
    resourceType: "IAM_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_iam_role_policy_attachment",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-instance-profile",
    resourceType: "IAM_INSTANCE_PROFILE",
    terraformPreview: true,
    terraformResourceType: "aws_iam_instance_profile",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-kms-key",
    resourceType: "KMS_KEY",
    terraformPreview: true,
    terraformResourceType: "aws_kms_key",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-kms-alias",
    resourceType: "KMS_ALIAS",
    terraformPreview: true,
    terraformResourceType: "aws_kms_alias",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ec2-instance",
    resourceType: "EC2",
    terraformPreview: true,
    terraformResourceType: "aws_instance",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ami",
    resourceType: "AMI",
    terraformBlockType: "data",
    terraformPreview: true,
    terraformResourceType: "aws_ami",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-caller-identity",
    resourceType: "AWS_CALLER_IDENTITY",
    parameterPanel: false,
    terraformBlockType: "data",
    terraformPreview: true,
    terraformResourceType: "aws_caller_identity",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ssm-parameter",
    resourceType: "SSM_PARAMETER",
    terraformBlockType: "data",
    terraformPreview: true,
    terraformResourceType: "aws_ssm_parameter",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ec2-managed-prefix-list",
    resourceType: "UNKNOWN",
    terraformBlockType: "data",
    terraformPreview: true,
    terraformResourceType: "aws_ec2_managed_prefix_list",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-key-pair",
    resourceType: "KEY_PAIR",
    terraformPreview: true,
    terraformResourceType: "aws_key_pair",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eip",
    resourceType: "ELASTIC_IP",
    terraformPreview: true,
    terraformResourceType: "aws_eip",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-launch-template",
    resourceType: "LAUNCH_TEMPLATE",
    terraformPreview: true,
    terraformResourceType: "aws_launch_template",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-autoscaling-group",
    resourceType: "AUTO_SCALING_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_autoscaling_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-autoscaling-policy",
    resourceType: "AUTO_SCALING_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_autoscaling_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lb",
    resourceType: "LOAD_BALANCER",
    terraformPreview: true,
    terraformResourceType: "aws_lb",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lb-target-group",
    resourceType: "LOAD_BALANCER_TARGET_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_lb_target_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lb-target-group-attachment",
    resourceType: "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT",
    terraformPreview: true,
    terraformResourceType: "aws_lb_target_group_attachment",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lb-listener",
    resourceType: "LOAD_BALANCER_LISTENER",
    terraformPreview: true,
    terraformResourceType: "aws_lb_listener",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-object",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_object",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-policy",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-website-configuration",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_website_configuration",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-public-access-block",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_public_access_block",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-versioning",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_versioning",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-encryption",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_server_side_encryption_configuration",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-lifecycle",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_lifecycle_configuration",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ebs-volume",
    resourceType: "EBS_VOLUME",
    terraformPreview: true,
    terraformResourceType: "aws_ebs_volume",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-volume-attachment",
    resourceType: "VOLUME_ATTACHMENT",
    terraformPreview: true,
    terraformResourceType: "aws_volume_attachment",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-efs-file-system",
    resourceType: "EFS_FILE_SYSTEM",
    terraformPreview: true,
    terraformResourceType: "aws_efs_file_system",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-efs-mount-target",
    resourceType: "EFS_MOUNT_TARGET",
    terraformPreview: true,
    terraformResourceType: "aws_efs_mount_target",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-efs-access-point",
    resourceType: "EFS_ACCESS_POINT",
    terraformPreview: true,
    terraformResourceType: "aws_efs_access_point",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-rds-instance",
    resourceType: "RDS",
    terraformPreview: true,
    terraformResourceType: "aws_db_instance",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-rds-cluster",
    resourceType: "RDS_CLUSTER",
    terraformPreview: true,
    terraformResourceType: "aws_rds_cluster",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-rds-cluster-instance",
    resourceType: "RDS_CLUSTER_INSTANCE",
    terraformPreview: true,
    terraformResourceType: "aws_rds_cluster_instance",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-db-subnet-group",
    resourceType: "DB_SUBNET_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_db_subnet_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-db-parameter-group",
    resourceType: "RDS",
    terraformPreview: true,
    terraformResourceType: "aws_db_parameter_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-db-option-group",
    resourceType: "RDS",
    terraformPreview: true,
    terraformResourceType: "aws_db_option_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-db-snapshot",
    resourceType: "RDS",
    terraformPreview: true,
    terraformResourceType: "aws_db_snapshot",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-dynamodb-table",
    resourceType: "DYNAMODB_TABLE",
    terraformPreview: true,
    terraformResourceType: "aws_dynamodb_table",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-elasticache-redis",
    resourceType: "ELASTICACHE_REDIS",
    terraformPreview: true,
    terraformResourceType: "aws_elasticache_replication_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-elasticache-subnet-group",
    resourceType: "ELASTICACHE_SUBNET_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_elasticache_subnet_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-elasticache-parameter-group",
    resourceType: "ELASTICACHE_PARAMETER_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_elasticache_parameter_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-secretsmanager-secret",
    resourceType: "SECRETS_MANAGER_SECRET",
    terraformPreview: true,
    terraformResourceType: "aws_secretsmanager_secret",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-secretsmanager-secret-version",
    resourceType: "SECRETS_MANAGER_SECRET",
    terraformPreview: true,
    terraformResourceType: "aws_secretsmanager_secret_version",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lambda-function",
    resourceType: "LAMBDA",
    terraformPreview: true,
    terraformResourceType: "aws_lambda_function",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lambda-permission",
    resourceType: "LAMBDA_PERMISSION",
    terraformPreview: true,
    terraformResourceType: "aws_lambda_permission",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lambda-alias",
    resourceType: "LAMBDA_ALIAS",
    terraformPreview: true,
    terraformResourceType: "aws_lambda_alias",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lambda-event-source-mapping",
    resourceType: "LAMBDA_EVENT_SOURCE_MAPPING",
    terraformPreview: true,
    terraformResourceType: "aws_lambda_event_source_mapping",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-rest-api",
    resourceType: "API_GATEWAY_REST_API",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_rest_api",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-authorizer",
    resourceType: "API_GATEWAY_AUTHORIZER",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_authorizer",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-websocket-api",
    resourceType: "API_GATEWAY_WEBSOCKET_API",
    terraformPreview: true,
    terraformResourceType: "aws_apigatewayv2_api",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-v2-route",
    resourceType: "API_GATEWAY_V2_ROUTE",
    terraformPreview: true,
    terraformResourceType: "aws_apigatewayv2_route",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-v2-integration",
    resourceType: "API_GATEWAY_V2_INTEGRATION",
    terraformPreview: true,
    terraformResourceType: "aws_apigatewayv2_integration",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-v2-stage",
    resourceType: "API_GATEWAY_V2_STAGE",
    terraformPreview: true,
    terraformResourceType: "aws_apigatewayv2_stage",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-resource",
    resourceType: "API_GATEWAY_RESOURCE",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_resource",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-method",
    resourceType: "API_GATEWAY_METHOD",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_method",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-integration",
    resourceType: "API_GATEWAY_INTEGRATION",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_integration",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-deployment",
    resourceType: "API_GATEWAY_DEPLOYMENT",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_deployment",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-stage",
    resourceType: "API_GATEWAY_STAGE",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_stage",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-log-group",
    resourceType: "CLOUDWATCH_LOG_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_log_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-log-stream",
    resourceType: "CLOUDWATCH_LOG_STREAM",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_log_stream",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-log-resource-policy",
    resourceType: "CLOUDWATCH_LOG_RESOURCE_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_log_resource_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-metric-alarm",
    resourceType: "CLOUDWATCH_METRIC_ALARM",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_metric_alarm",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-dashboard",
    resourceType: "CLOUDWATCH_DASHBOARD",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_dashboard",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eventbridge-rule",
    resourceType: "EVENTBRIDGE_RULE",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_event_rule",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eventbridge-target",
    resourceType: "EVENTBRIDGE_TARGET",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_event_target",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eventbridge-permission",
    resourceType: "EVENTBRIDGE_PERMISSION",
    terraformPreview: true,
    terraformResourceType: "aws_cloudwatch_event_permission",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-scheduler-schedule",
    resourceType: "SCHEDULER_SCHEDULE",
    terraformPreview: true,
    terraformResourceType: "aws_scheduler_schedule",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codebuild-project",
    resourceType: "CODEBUILD_PROJECT",
    terraformPreview: true,
    terraformResourceType: "aws_codebuild_project",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codedeploy-app",
    resourceType: "CODEDEPLOY_APP",
    terraformPreview: true,
    terraformResourceType: "aws_codedeploy_app",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codedeploy-deployment-group",
    resourceType: "CODEDEPLOY_DEPLOYMENT_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_codedeploy_deployment_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codepipeline",
    resourceType: "CODEPIPELINE",
    terraformPreview: true,
    terraformResourceType: "aws_codepipeline",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codestarconnections-connection",
    resourceType: "CODESTAR_CONNECTION",
    terraformPreview: true,
    terraformResourceType: "aws_codestarconnections_connection",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-sns-topic",
    resourceType: "SNS_TOPIC",
    terraformPreview: true,
    terraformResourceType: "aws_sns_topic",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-sns-topic-subscription",
    resourceType: "SNS_TOPIC_SUBSCRIPTION",
    terraformPreview: true,
    terraformResourceType: "aws_sns_topic_subscription",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-sqs-queue",
    resourceType: "SQS_QUEUE",
    terraformPreview: true,
    terraformResourceType: "aws_sqs_queue",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-step-functions-state-machine",
    resourceType: "STEP_FUNCTIONS_STATE_MACHINE",
    terraformPreview: true,
    terraformResourceType: "aws_sfn_state_machine",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-acm-certificate",
    resourceType: "ACM_CERTIFICATE",
    terraformPreview: true,
    terraformResourceType: "aws_acm_certificate",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-acm-certificate-validation",
    resourceType: "ACM_CERTIFICATE_VALIDATION",
    terraformPreview: true,
    terraformResourceType: "aws_acm_certificate_validation",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cognito-user-pool",
    resourceType: "COGNITO_USER_POOL",
    terraformPreview: true,
    terraformResourceType: "aws_cognito_user_pool",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cognito-user-pool-client",
    resourceType: "COGNITO_USER_POOL_CLIENT",
    terraformPreview: true,
    terraformResourceType: "aws_cognito_user_pool_client",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-amplify-app",
    resourceType: "AMPLIFY_APP",
    terraformPreview: true,
    terraformResourceType: "aws_amplify_app",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecr-repository",
    resourceType: "ECR_REPOSITORY",
    terraformPreview: true,
    terraformResourceType: "aws_ecr_repository",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecr-lifecycle-policy",
    resourceType: "ECR_LIFECYCLE_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_ecr_lifecycle_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecs-cluster",
    resourceType: "ECS_CLUSTER",
    terraformPreview: true,
    terraformResourceType: "aws_ecs_cluster",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecs-service",
    resourceType: "ECS_SERVICE",
    terraformPreview: true,
    terraformResourceType: "aws_ecs_service",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-appautoscaling-target",
    resourceType: "APPLICATION_AUTO_SCALING_TARGET",
    terraformPreview: true,
    terraformResourceType: "aws_appautoscaling_target",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-appautoscaling-policy",
    resourceType: "APPLICATION_AUTO_SCALING_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_appautoscaling_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecs-task-definition",
    resourceType: "ECS_TASK_DEFINITION",
    terraformPreview: true,
    terraformResourceType: "aws_ecs_task_definition",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecs-capacity-provider",
    resourceType: "ECS_CAPACITY_PROVIDER",
    terraformPreview: true,
    terraformResourceType: "aws_ecs_capacity_provider",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eks-cluster",
    resourceType: "EKS_CLUSTER",
    terraformPreview: true,
    terraformResourceType: "aws_eks_cluster",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eks-node-group",
    resourceType: "EKS_NODE_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_eks_node_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eks-fargate-profile",
    resourceType: "EKS_FARGATE_PROFILE",
    terraformPreview: true,
    terraformResourceType: "aws_eks_fargate_profile",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eks-addon",
    resourceType: "EKS_ADDON",
    terraformPreview: true,
    terraformResourceType: "aws_eks_addon",
    terraformSync: true
  }),
  createResourceDefinition({
    id: "kubernetes-namespace",
    provider: "kubernetes",
    resourceType: "KUBERNETES_NAMESPACE",
    terraformPreview: true,
    terraformResourceType: "kubernetes_namespace",
    terraformSync: true
  }),
  createResourceDefinition({
    id: "kubernetes-deployment",
    provider: "kubernetes",
    resourceType: "KUBERNETES_DEPLOYMENT",
    terraformPreview: true,
    terraformResourceType: "kubernetes_deployment",
    terraformSync: true
  }),
  createResourceDefinition({
    id: "kubernetes-service",
    provider: "kubernetes",
    resourceType: "KUBERNETES_SERVICE",
    terraformPreview: true,
    terraformResourceType: "kubernetes_service",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-config-configuration-recorder",
    resourceType: "CONFIG_CONFIGURATION_RECORDER",
    terraformPreview: true,
    terraformResourceType: "aws_config_configuration_recorder",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-config-delivery-channel",
    resourceType: "CONFIG_DELIVERY_CHANNEL",
    terraformPreview: true,
    terraformResourceType: "aws_config_delivery_channel",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-config-rule",
    resourceType: "CONFIG_RULE",
    terraformPreview: true,
    terraformResourceType: "aws_config_config_rule",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudtrail",
    resourceType: "CLOUDTRAIL",
    terraformPreview: true,
    terraformResourceType: "aws_cloudtrail",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-xray-group",
    resourceType: "XRAY_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_xray_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-xray-sampling-rule",
    resourceType: "XRAY_SAMPLING_RULE",
    terraformPreview: true,
    terraformResourceType: "aws_xray_sampling_rule",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-shield-protection",
    resourceType: "SHIELD_PROTECTION",
    terraformPreview: true,
    terraformResourceType: "aws_shield_protection",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-guardduty-detector",
    resourceType: "GUARDDUTY_DETECTOR",
    terraformPreview: true,
    terraformResourceType: "aws_guardduty_detector",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-integration-response",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_integration_response",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-method-response",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_api_gateway_method_response",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-budgets-budget",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_budgets_budget",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cloudfront-origin-access-identity",
    resourceType: "CLOUDFRONT",
    terraformPreview: true,
    terraformResourceType: "aws_cloudfront_origin_access_identity",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-docdb-cluster",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_docdb_cluster",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-dynamodb-global-table",
    resourceType: "DYNAMODB_TABLE",
    terraformPreview: true,
    terraformResourceType: "aws_dynamodb_global_table",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-elastic-beanstalk-application",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_elastic_beanstalk_application",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-elastic-beanstalk-environment",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_elastic_beanstalk_environment",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-elb",
    resourceType: "LOAD_BALANCER",
    terraformPreview: true,
    terraformResourceType: "aws_elb",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-flow-log",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_flow_log",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-fsx-lustre-file-system",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_fsx_lustre_file_system",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-group",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_iam_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-group-policy-attachment",
    resourceType: "IAM_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_iam_group_policy_attachment",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-user",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_iam_user",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-user-group-membership",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_iam_user_group_membership",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-user-login-profile",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_iam_user_login_profile",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-launch-configuration",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_launch_configuration",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-main-route-table-association",
    resourceType: "ROUTE_TABLE_ASSOCIATION",
    terraformPreview: true,
    terraformResourceType: "aws_main_route_table_association",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-network-interface",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_network_interface",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-organizations-account",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_organizations_account",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-acl",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_acl",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-logging",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_logging",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-notification",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_notification",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-object",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_object",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-replication-configuration",
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_bucket_replication_configuration",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ses-email-identity",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_ses_email_identity",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-vpc-peering-connection-accepter",
    resourceType: "VPC_PEERING_CONNECTION",
    terraformPreview: true,
    terraformResourceType: "aws_vpc_peering_connection_accepter",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-waf-ipset",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_waf_ipset",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-waf-rule",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_waf_rule",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-waf-web-acl",
    resourceType: "WAF_WEB_ACL",
    terraformPreview: true,
    terraformResourceType: "aws_waf_web_acl",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-policy-data",
    resourceType: "IAM_POLICY",
    terraformBlockType: "data",
    terraformPreview: true,
    terraformResourceType: "aws_iam_policy",
    terraformSync: true
  })
] as const satisfies readonly ResourceDefinition[];

export type ReverseEngineeringAwsResourceCatalogEntry = {
  readonly resourceType: ResourceType;
  readonly providerResourceTypes: readonly string[];
  readonly scanSelection: ResourceType;
  readonly terraformResourceTypes: readonly string[];
};

const REVERSE_ENGINEERING_AWS_PROVIDER_TYPE_ALIASES = [
  ["AWS::EC2::VPC", "VPC"],
  ["AWS::EC2::Subnet", "SUBNET"],
  ["AWS::EC2::InternetGateway", "INTERNET_GATEWAY"],
  ["AWS::EC2::RouteTable", "ROUTE_TABLE"],
  ["AWS::EC2::RouteTableAssociation", "ROUTE_TABLE_ASSOCIATION"],
  ["AWS::EC2::NetworkAcl", "NETWORK_ACL"],
  ["AWS::EC2::NetworkAclEntry", "NETWORK_ACL_RULE"],
  ["AWS::EC2::EIP", "ELASTIC_IP"],
  ["AWS::EC2::NatGateway", "NAT_GATEWAY"],
  ["AWS::EC2::VPCEndpoint", "VPC_ENDPOINT"],
  ["AWS::EC2::VPCPeeringConnection", "VPC_PEERING_CONNECTION"],
  ["AWS::EC2::VPCPeeringConnectionAccepter", "VPC_PEERING_CONNECTION"],
  ["AWS::EC2::SecurityGroup", "SECURITY_GROUP"],
  ["AWS::EC2::Instance", "EC2"],
  ["AWS::EC2::Image", "AMI"],
  ["AWS::EC2::KeyPair", "KEY_PAIR"],
  ["AWS::EC2::LaunchTemplate", "LAUNCH_TEMPLATE"],
  ["AWS::EC2::Volume", "EBS_VOLUME"],
  ["AWS::EC2::VolumeAttachment", "VOLUME_ATTACHMENT"],
  ["AWS::AutoScaling::AutoScalingGroup", "AUTO_SCALING_GROUP"],
  ["AWS::AutoScaling::ScalingPolicy", "AUTO_SCALING_POLICY"],
  ["AWS::ElasticLoadBalancingV2::LoadBalancer", "LOAD_BALANCER"],
  ["AWS::ElasticLoadBalancingV2::TargetGroup", "LOAD_BALANCER_TARGET_GROUP"],
  ["AWS::ElasticLoadBalancingV2::TargetGroupAttachment", "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT"],
  ["AWS::ElasticLoadBalancingV2::Listener", "LOAD_BALANCER_LISTENER"],
  ["AWS::EFS::FileSystem", "EFS_FILE_SYSTEM"],
  ["AWS::EFS::MountTarget", "EFS_MOUNT_TARGET"],
  ["AWS::EFS::AccessPoint", "EFS_ACCESS_POINT"],
  ["AWS::RDS::DBInstance", "RDS"],
  ["AWS::RDS::DBCluster", "RDS_CLUSTER"],
  ["AWS::RDS::DBClusterInstance", "RDS_CLUSTER_INSTANCE"],
  ["AWS::RDS::DBSubnetGroup", "DB_SUBNET_GROUP"],
  ["AWS::DynamoDB::Table", "DYNAMODB_TABLE"],
  ["AWS::DynamoDB::GlobalTable", "DYNAMODB_TABLE"],
  ["AWS::ElastiCache::ReplicationGroup", "ELASTICACHE_REDIS"],
  ["AWS::ElastiCache::SubnetGroup", "ELASTICACHE_SUBNET_GROUP"],
  ["AWS::ElastiCache::ParameterGroup", "ELASTICACHE_PARAMETER_GROUP"],
  ["AWS::S3::Bucket", "S3"],
  ["AWS::S3::BucketVersioning", "S3"],
  ["AWS::S3::BucketPublicAccessBlock", "S3"],
  ["AWS::S3::BucketPolicy", "S3"],
  ["AWS::S3::Object", "S3"],
  ["AWS::SecretsManager::Secret", "SECRETS_MANAGER_SECRET"],
  ["AWS::KMS::Key", "KMS_KEY"],
  ["AWS::KMS::Alias", "KMS_ALIAS"],
  ["AWS::Lambda::Function", "LAMBDA"],
  ["AWS::Lambda::Permission", "LAMBDA_PERMISSION"],
  ["AWS::Lambda::Alias", "LAMBDA_ALIAS"],
  ["AWS::Lambda::EventSourceMapping", "LAMBDA_EVENT_SOURCE_MAPPING"],
  ["AWS::ApiGateway::RestApi", "API_GATEWAY_REST_API"],
  ["AWS::ApiGateway::Authorizer", "API_GATEWAY_AUTHORIZER"],
  ["AWS::ApiGateway::Resource", "API_GATEWAY_RESOURCE"],
  ["AWS::ApiGateway::Method", "API_GATEWAY_METHOD"],
  ["AWS::ApiGateway::Integration", "API_GATEWAY_INTEGRATION"],
  ["AWS::ApiGateway::Deployment", "API_GATEWAY_DEPLOYMENT"],
  ["AWS::ApiGateway::Stage", "API_GATEWAY_STAGE"],
  ["AWS::ApiGatewayV2::Api", "API_GATEWAY_WEBSOCKET_API"],
  ["AWS::ApiGatewayV2::Route", "API_GATEWAY_V2_ROUTE"],
  ["AWS::ApiGatewayV2::Integration", "API_GATEWAY_V2_INTEGRATION"],
  ["AWS::ApiGatewayV2::Stage", "API_GATEWAY_V2_STAGE"],
  ["AWS::SNS::Topic", "SNS_TOPIC"],
  ["AWS::SNS::Subscription", "SNS_TOPIC_SUBSCRIPTION"],
  ["AWS::SQS::Queue", "SQS_QUEUE"],
  ["AWS::StepFunctions::StateMachine", "STEP_FUNCTIONS_STATE_MACHINE"],
  ["AWS::Events::Rule", "EVENTBRIDGE_RULE"],
  ["AWS::Events::Target", "EVENTBRIDGE_TARGET"],
  ["AWS::Events::EventBusPolicy", "EVENTBRIDGE_PERMISSION"],
  ["AWS::Scheduler::Schedule", "SCHEDULER_SCHEDULE"],
  ["AWS::CodeBuild::Project", "CODEBUILD_PROJECT"],
  ["AWS::CodeDeploy::Application", "CODEDEPLOY_APP"],
  ["AWS::CodeDeploy::DeploymentGroup", "CODEDEPLOY_DEPLOYMENT_GROUP"],
  ["AWS::CodePipeline::Pipeline", "CODEPIPELINE"],
  ["AWS::CodeStarConnections::Connection", "CODESTAR_CONNECTION"],
  ["AWS::IAM::Role", "IAM_ROLE"],
  ["AWS::IAM::Policy", "IAM_POLICY"],
  ["AWS::IAM::RolePolicy", "IAM_POLICY"],
  ["AWS::IAM::RolePolicyAttachment", "IAM_POLICY"],
  ["AWS::IAM::InstanceProfile", "IAM_INSTANCE_PROFILE"],
  ["AWS::Cognito::UserPool", "COGNITO_USER_POOL"],
  ["AWS::Cognito::UserPoolClient", "COGNITO_USER_POOL_CLIENT"],
  ["AWS::Amplify::App", "AMPLIFY_APP"],
  ["AWS::ECR::Repository", "ECR_REPOSITORY"],
  ["AWS::ECR::LifecyclePolicy", "ECR_LIFECYCLE_POLICY"],
  ["AWS::ECS::Cluster", "ECS_CLUSTER"],
  ["AWS::ECS::Service", "ECS_SERVICE"],
  ["AWS::ECS::TaskDefinition", "ECS_TASK_DEFINITION"],
  ["AWS::ECS::CapacityProvider", "ECS_CAPACITY_PROVIDER"],
  ["AWS::ApplicationAutoScaling::ScalableTarget", "APPLICATION_AUTO_SCALING_TARGET"],
  ["AWS::ApplicationAutoScaling::ScalingPolicy", "APPLICATION_AUTO_SCALING_POLICY"],
  ["AWS::EKS::Cluster", "EKS_CLUSTER"],
  ["AWS::EKS::Nodegroup", "EKS_NODE_GROUP"],
  ["AWS::EKS::FargateProfile", "EKS_FARGATE_PROFILE"],
  ["AWS::EKS::Addon", "EKS_ADDON"],
  ["AWS::CloudFront::Distribution", "CLOUDFRONT"],
  ["AWS::CloudFront::OriginAccessControl", "CLOUDFRONT"],
  ["AWS::Route53::HostedZone", "ROUTE53_ZONE"],
  ["AWS::Route53::RecordSet", "ROUTE53_RECORD"],
  ["AWS::WAFv2::WebACL", "WAF_WEB_ACL"],
  ["AWS::WAFv2::WebACLAssociation", "WAF_WEB_ACL_ASSOCIATION"],
  ["AWS::WAF::WebACL", "WAF_WEB_ACL"],
  ["AWS::WAFRegional::WebACL", "WAF_WEB_ACL"],
  ["AWS::CertificateManager::Certificate", "ACM_CERTIFICATE"],
  ["AWS::CertificateManager::CertificateValidation", "ACM_CERTIFICATE_VALIDATION"],
  ["AWS::Logs::LogGroup", "CLOUDWATCH_LOG_GROUP"],
  ["AWS::Logs::LogStream", "CLOUDWATCH_LOG_STREAM"],
  ["AWS::Logs::ResourcePolicy", "CLOUDWATCH_LOG_RESOURCE_POLICY"],
  ["AWS::CloudWatch::Alarm", "CLOUDWATCH_METRIC_ALARM"],
  ["AWS::CloudWatch::Dashboard", "CLOUDWATCH_DASHBOARD"],
  ["AWS::Config::ConfigurationRecorder", "CONFIG_CONFIGURATION_RECORDER"],
  ["AWS::Config::DeliveryChannel", "CONFIG_DELIVERY_CHANNEL"],
  ["AWS::Config::ConfigRule", "CONFIG_RULE"],
  ["AWS::CloudTrail::Trail", "CLOUDTRAIL"],
  ["AWS::XRay::Group", "XRAY_GROUP"],
  ["AWS::XRay::SamplingRule", "XRAY_SAMPLING_RULE"],
  ["AWS::Shield::Protection", "SHIELD_PROTECTION"],
  ["AWS::GuardDuty::Detector", "GUARDDUTY_DETECTOR"]
] as const satisfies readonly (readonly [string, ResourceType])[];

const REVERSE_ENGINEERING_AWS_SCAN_PARENT = {
  NETWORK_ACL_RULE: "NETWORK_ACL",
  AUTO_SCALING_POLICY: "AUTO_SCALING_GROUP",
  LOAD_BALANCER_TARGET_GROUP_ATTACHMENT: "LOAD_BALANCER_TARGET_GROUP",
  VOLUME_ATTACHMENT: "EBS_VOLUME",
  EFS_MOUNT_TARGET: "EFS_FILE_SYSTEM",
  EFS_ACCESS_POINT: "EFS_FILE_SYSTEM",
  RDS_CLUSTER_INSTANCE: "RDS_CLUSTER",
  DB_SUBNET_GROUP: "RDS",
  ELASTICACHE_SUBNET_GROUP: "ELASTICACHE_REDIS",
  ELASTICACHE_PARAMETER_GROUP: "ELASTICACHE_REDIS",
  WAF_WEB_ACL_ASSOCIATION: "WAF_WEB_ACL",
  KMS_ALIAS: "KMS_KEY",
  LAMBDA_ALIAS: "LAMBDA",
  LAMBDA_EVENT_SOURCE_MAPPING: "LAMBDA",
  API_GATEWAY_AUTHORIZER: "API_GATEWAY_REST_API",
  API_GATEWAY_RESOURCE: "API_GATEWAY_REST_API",
  API_GATEWAY_METHOD: "API_GATEWAY_REST_API",
  API_GATEWAY_INTEGRATION: "API_GATEWAY_REST_API",
  API_GATEWAY_DEPLOYMENT: "API_GATEWAY_REST_API",
  API_GATEWAY_STAGE: "API_GATEWAY_REST_API",
  API_GATEWAY_V2_ROUTE: "API_GATEWAY_WEBSOCKET_API",
  API_GATEWAY_V2_INTEGRATION: "API_GATEWAY_WEBSOCKET_API",
  API_GATEWAY_V2_STAGE: "API_GATEWAY_WEBSOCKET_API",
  SNS_TOPIC_SUBSCRIPTION: "SNS_TOPIC",
  EVENTBRIDGE_PERMISSION: "EVENTBRIDGE_RULE",
  CODEDEPLOY_DEPLOYMENT_GROUP: "CODEDEPLOY_APP",
  COGNITO_USER_POOL_CLIENT: "COGNITO_USER_POOL",
  ECR_LIFECYCLE_POLICY: "ECR_REPOSITORY",
  EKS_NODE_GROUP: "EKS_CLUSTER",
  EKS_FARGATE_PROFILE: "EKS_CLUSTER",
  EKS_ADDON: "EKS_CLUSTER",
  ACM_CERTIFICATE_VALIDATION: "ACM_CERTIFICATE",
  CONFIG_DELIVERY_CHANNEL: "CONFIG_CONFIGURATION_RECORDER",
  CONFIG_RULE: "CONFIG_CONFIGURATION_RECORDER",
  CLOUDWATCH_LOG_STREAM: "CLOUDWATCH_LOG_GROUP",
  CLOUDWATCH_LOG_RESOURCE_POLICY: "CLOUDWATCH_LOG_GROUP"
} as const satisfies Readonly<Partial<Record<ResourceType, ResourceType>>>;

const REVERSE_ENGINEERING_AWS_ARN_ALIASES = [
  ["ec2/vpc", "VPC"],
  ["ec2/subnet", "SUBNET"],
  ["ec2/internet-gateway", "INTERNET_GATEWAY"],
  ["ec2/route-table", "ROUTE_TABLE"],
  ["ec2/network-acl", "NETWORK_ACL"],
  ["ec2/security-group", "SECURITY_GROUP"],
  ["ec2/instance", "EC2"],
  ["ec2/image", "AMI"],
  ["ec2/key-pair", "KEY_PAIR"],
  ["ec2/launch-template", "LAUNCH_TEMPLATE"],
  ["ec2/volume", "EBS_VOLUME"],
  ["ec2/vpc-endpoint", "VPC_ENDPOINT"],
  ["ec2/vpc-peering-connection", "VPC_PEERING_CONNECTION"],
  ["autoscaling/autoscalinggroup", "AUTO_SCALING_GROUP"],
  ["autoscaling/scalingpolicy", "AUTO_SCALING_POLICY"],
  ["elasticloadbalancing/loadbalancer", "LOAD_BALANCER"],
  ["elasticloadbalancing/targetgroup", "LOAD_BALANCER_TARGET_GROUP"],
  ["elasticloadbalancing/listener", "LOAD_BALANCER_LISTENER"],
  ["elasticfilesystem/file-system", "EFS_FILE_SYSTEM"],
  ["elasticfilesystem/access-point", "EFS_ACCESS_POINT"],
  ["rds/db", "RDS"],
  ["rds/cluster", "RDS_CLUSTER"],
  ["dynamodb/table", "DYNAMODB_TABLE"],
  ["elasticache/replicationgroup", "ELASTICACHE_REDIS"],
  ["elasticache/cluster", "ELASTICACHE_REDIS"],
  ["kms/key", "KMS_KEY"],
  ["kms/alias", "KMS_ALIAS"],
  ["lambda/function", "LAMBDA"],
  ["apigateway/restapis", "API_GATEWAY_REST_API"],
  ["apigateway/apis", "API_GATEWAY_WEBSOCKET_API"],
  ["execute-api/*", "API_GATEWAY_REST_API"],
  ["states/statemachine", "STEP_FUNCTIONS_STATE_MACHINE"],
  ["events/rule", "EVENTBRIDGE_RULE"],
  ["scheduler/schedule", "SCHEDULER_SCHEDULE"],
  ["codebuild/project", "CODEBUILD_PROJECT"],
  ["codedeploy/application", "CODEDEPLOY_APP"],
  ["codedeploy/deploymentgroup", "CODEDEPLOY_DEPLOYMENT_GROUP"],
  ["codepipeline/pipeline", "CODEPIPELINE"],
  ["codestar-connections/connection", "CODESTAR_CONNECTION"],
  ["iam/role", "IAM_ROLE"],
  ["iam/policy", "IAM_POLICY"],
  ["iam/instance-profile", "IAM_INSTANCE_PROFILE"],
  ["cognito-idp/userpool", "COGNITO_USER_POOL"],
  ["amplify/apps", "AMPLIFY_APP"],
  ["ecr/repository", "ECR_REPOSITORY"],
  ["ecs/cluster", "ECS_CLUSTER"],
  ["ecs/service", "ECS_SERVICE"],
  ["ecs/task-definition", "ECS_TASK_DEFINITION"],
  ["ecs/capacity-provider", "ECS_CAPACITY_PROVIDER"],
  ["eks/cluster", "EKS_CLUSTER"],
  ["eks/nodegroup", "EKS_NODE_GROUP"],
  ["eks/fargateprofile", "EKS_FARGATE_PROFILE"],
  ["eks/addon", "EKS_ADDON"],
  ["cloudfront/distribution", "CLOUDFRONT"],
  ["route53/hostedzone", "ROUTE53_ZONE"],
  ["wafv2/webacl", "WAF_WEB_ACL"],
  ["acm/certificate", "ACM_CERTIFICATE"],
  ["logs/log-group", "CLOUDWATCH_LOG_GROUP"],
  ["logs/log-stream", "CLOUDWATCH_LOG_STREAM"],
  ["cloudwatch/alarm", "CLOUDWATCH_METRIC_ALARM"],
  ["cloudwatch/dashboard", "CLOUDWATCH_DASHBOARD"],
  ["config/config-rule", "CONFIG_RULE"],
  ["config/configuration-recorder", "CONFIG_CONFIGURATION_RECORDER"],
  ["config/delivery-channel", "CONFIG_DELIVERY_CHANNEL"],
  ["cloudtrail/trail", "CLOUDTRAIL"],
  ["xray/group", "XRAY_GROUP"],
  ["xray/sampling-rule", "XRAY_SAMPLING_RULE"],
  ["shield/protection", "SHIELD_PROTECTION"],
  ["guardduty/detector", "GUARDDUTY_DETECTOR"],
  ["secretsmanager/secret", "SECRETS_MANAGER_SECRET"]
] as const satisfies readonly (readonly [string, ResourceType])[];

const REVERSE_ENGINEERING_AWS_ARN_SERVICE_DEFAULTS = {
  s3: "S3",
  sns: "SNS_TOPIC",
  sqs: "SQS_QUEUE"
} as const satisfies Readonly<Record<string, ResourceType>>;

const reverseEngineeringAwsProviderTypeMap = new Map<string, ResourceType>(
  REVERSE_ENGINEERING_AWS_PROVIDER_TYPE_ALIASES.map(([providerType, resourceType]) => [
    normalizeReverseEngineeringAwsIdentity(providerType),
    resourceType
  ])
);
const reverseEngineeringAwsArnTypeMap = new Map<string, ResourceType>(
  REVERSE_ENGINEERING_AWS_ARN_ALIASES
);
const reverseEngineeringAwsProviderTypesByResourceType = new Map<ResourceType, readonly string[]>(
  reverseEngineeringAwsResourceTypesFromDefinitions().map((resourceType) => [
    resourceType,
    REVERSE_ENGINEERING_AWS_PROVIDER_TYPE_ALIASES.filter(
      ([, mappedResourceType]) => mappedResourceType === resourceType
    ).map(([providerType]) => providerType)
  ])
);

export const reverseEngineeringAwsResourceCatalog = Object.freeze(
  reverseEngineeringAwsResourceTypesFromDefinitions().map(
    (resourceType): ReverseEngineeringAwsResourceCatalogEntry => ({
      resourceType,
      providerResourceTypes:
        reverseEngineeringAwsProviderTypesByResourceType.get(resourceType) ?? [],
      scanSelection: getReverseEngineeringAwsScanSelection(resourceType) ?? resourceType,
      terraformResourceTypes: resourceDefinitions
        .filter(
          (definition) =>
            definition.provider === "aws" &&
            definition.terraform.blockType === "resource" &&
            definition.terraform.resourceType.startsWith("aws_") &&
            definition.resourceType === resourceType
        )
        .map((definition) => definition.terraform.resourceType)
    })
  )
);

export const reverseEngineeringAwsResourceTypes = Object.freeze(
  reverseEngineeringAwsResourceCatalog.map(({ resourceType }) => resourceType)
);

export const reverseEngineeringAwsScanResourceTypes = Object.freeze([
  ...new Set(reverseEngineeringAwsResourceCatalog.map(({ scanSelection }) => scanSelection))
]);

/** gg: CloudFormation·Resource Explorer의 표기 차이를 무시하고 프로젝트 보드 타입을 찾습니다. */
export function resolveReverseEngineeringAwsProviderResourceType(
  providerResourceType: string
): ResourceType | undefined {
  return reverseEngineeringAwsProviderTypeMap.get(
    normalizeReverseEngineeringAwsIdentity(providerResourceType)
  );
}

/** gg: Tagging API가 돌려준 ARN의 service와 resource kind를 실제 보드 타입으로 바꿉니다. */
export function resolveReverseEngineeringAwsResourceTypeFromArn(
  arn: string
): ResourceType | undefined {
  const arnSegments = arn.split(":");

  if (
    arnSegments.length < 6 ||
    normalizeReverseEngineeringAwsIdentity(arnSegments[0] ?? "") !== "arn"
  ) {
    return undefined;
  }

  const service = normalizeReverseEngineeringAwsIdentity(arnSegments[2] ?? "");
  const resourceIdentity = normalizeReverseEngineeringAwsIdentity(
    arnSegments.slice(5).join(":")
  ).replace(/^\/+/, "");
  const resourceKind = resourceIdentity.split(/[/:]/u, 1)[0] ?? "";

  return (
    reverseEngineeringAwsArnTypeMap.get(`${service}/${resourceKind}`) ??
    reverseEngineeringAwsArnTypeMap.get(`${service}/*`) ??
    REVERSE_ENGINEERING_AWS_ARN_SERVICE_DEFAULTS[
      service as keyof typeof REVERSE_ENGINEERING_AWS_ARN_SERVICE_DEFAULTS
    ]
  );
}

/** gg: 한 보드 타입을 찾을 때 허용하는 AWS provider type 별칭을 gateway에 제공합니다. */
export function getReverseEngineeringAwsProviderResourceTypes(
  resourceType: ResourceType
): readonly string[] {
  return reverseEngineeringAwsProviderTypesByResourceType.get(resourceType) ?? [];
}

/** gg: 화면의 하위 구성 선택을 실제 AWS 조회를 수행하는 상위 family로 줄입니다. */
export function getReverseEngineeringAwsScanSelection(
  resourceType: ResourceType
): ResourceType | undefined {
  if (!reverseEngineeringAwsResourceTypesFromDefinitions().includes(resourceType)) {
    return undefined;
  }

  return (
    REVERSE_ENGINEERING_AWS_SCAN_PARENT[
      resourceType as keyof typeof REVERSE_ENGINEERING_AWS_SCAN_PARENT
    ] ?? resourceType
  );
}

/** gg: generic inventory 한 건이 현재 고급 설정의 조회 범위에 포함되는지 순수 비교합니다. */
export function isReverseEngineeringAwsProviderTypeSelected(
  providerResourceType: string,
  selectedResourceTypes: readonly ReverseEngineeringResourceSelection[]
): boolean {
  const resourceType = resolveReverseEngineeringAwsProviderResourceType(providerResourceType);

  if (!resourceType || !reverseEngineeringAwsResourceTypes.includes(resourceType)) {
    return false;
  }

  if (selectedResourceTypes.includes("ALL")) {
    return true;
  }

  const scanSelection = getReverseEngineeringAwsScanSelection(resourceType) ?? resourceType;

  return selectedResourceTypes.some(
    (selectedResourceType) =>
      selectedResourceType !== "ALL" &&
      (getReverseEngineeringAwsScanSelection(selectedResourceType) ?? selectedResourceType) ===
        scanSelection
  );
}

/** gg: 실제 AWS resource block만 유지해 data source·random·Kubernetes가 조회 권한에 섞이지 않게 합니다. */
function reverseEngineeringAwsResourceTypesFromDefinitions(): ResourceType[] {
  return [
    ...new Set(
      resourceDefinitions
        .filter(
          (definition) =>
            definition.provider === "aws" &&
            definition.terraform.blockType === "resource" &&
            definition.terraform.resourceType.startsWith("aws_") &&
            definition.resourceType !== "UNKNOWN"
        )
        .map((definition) => definition.resourceType)
    )
  ];
}

/** gg: AWS type·ARN 비교에 필요 없는 대소문자와 공백 차이를 제거합니다. */
function normalizeReverseEngineeringAwsIdentity(value: string): string {
  return value.trim().toLowerCase();
}

const resourceDefinitionById = new Map<string, ResourceDefinition>(
  resourceDefinitions.map((definition) => [definition.id, definition])
);
const defaultResourceDefinitionByResourceType = createDefaultResourceDefinitionByResourceType();
const resourceDefinitionByTerraformKey = createResourceDefinitionByTerraformKey();

export function getResourceDefinitionById(id: string): ResourceDefinition | undefined {
  return resourceDefinitionById.get(id);
}

export function getDefaultResourceDefinitionByResourceType(
  resourceType: ResourceType
): ResourceDefinition | undefined {
  return defaultResourceDefinitionByResourceType.get(resourceType);
}

export function getResourceDefinitionByTerraform(
  blockType: TerraformBlockType,
  resourceType: string
): ResourceDefinition | undefined {
  return resourceDefinitionByTerraformKey.get(
    createTerraformDefinitionKey(blockType, resourceType)
  );
}

/**
 * Resource parameter keys stay compatible with the generated catalog while non-resource
 * Terraform blocks receive their own namespace instead of sharing an incompatible schema.
 */
export function createTerraformParameterCatalogKey(
  blockType: TerraformBlockType,
  resourceType: string
): string {
  return blockType === "resource" ? resourceType : `${blockType}.${resourceType}`;
}

function createDefaultResourceDefinitionByResourceType(): Map<ResourceType, ResourceDefinition> {
  const definitions = new Map<ResourceType, ResourceDefinition>();

  for (const definition of resourceDefinitions) {
    if (
      definition.resourceType === DEFAULT_RESOURCE_TYPE ||
      definitions.has(definition.resourceType)
    ) {
      continue;
    }

    definitions.set(definition.resourceType, definition);
  }

  for (const [resourceType, definitionId] of DEFAULT_RESOURCE_DEFINITION_ALIASES) {
    const definition = resourceDefinitionById.get(definitionId);

    if (!definition) {
      throw new Error(`Missing default resource definition alias target: ${definitionId}`);
    }

    definitions.set(resourceType, definition);
  }

  return definitions;
}

function createResourceDefinitionByTerraformKey(): Map<string, ResourceDefinition> {
  const definitions = new Map<string, ResourceDefinition>();

  for (const definition of resourceDefinitions) {
    const key = createTerraformDefinitionKey(
      definition.terraform.blockType,
      definition.terraform.resourceType
    );

    if (definitions.has(key)) {
      continue;
    }

    definitions.set(key, definition);
  }

  return definitions;
}

function createAwsResourceDefinition({
  id,
  parameterPanel = true,
  resourceType = DEFAULT_RESOURCE_TYPE,
  terraformBlockType = DEFAULT_TERRAFORM_BLOCK_TYPE,
  terraformPreview = false,
  terraformResourceType,
  terraformSync = false
}: AwsResourceDefinitionInput): ResourceDefinition {
  return createResourceDefinition({
    id,
    provider: "aws",
    resourceType,
    parameterPanel,
    terraformBlockType,
    terraformPreview,
    terraformResourceType,
    terraformSync
  });
}

export function createResourceDefinition({
  id,
  provider,
  parameterPanel = true,
  resourceType = DEFAULT_RESOURCE_TYPE,
  terraformBlockType = DEFAULT_TERRAFORM_BLOCK_TYPE,
  terraformPreview = false,
  terraformResourceType,
  terraformSync = false
}: ResourceDefinitionInput): ResourceDefinition {
  const definition: ResourceDefinition = {
    id,
    provider,
    resourceType,
    terraform: {
      blockType: terraformBlockType,
      resourceType: terraformResourceType
    },
    capabilities: {
      parameterPanel,
      terraformPreview,
      terraformSync,
      deployment: createResourceDeploymentCapability({
        resourceType,
        terraformBlockType,
        terraformPreview,
        terraformResourceType
      })
    }
  };

  assertResourceDeploymentCapability(definition);

  return definition;
}

export function assertResourceDeploymentCapability(
  definition: Pick<ResourceDefinition, "id" | "resourceType" | "terraform" | "capabilities">
): void {
  const expected = createResourceDeploymentCapability({
    resourceType: definition.resourceType,
    terraformBlockType: definition.terraform.blockType,
    terraformPreview: definition.capabilities.terraformPreview,
    terraformResourceType: definition.terraform.resourceType
  });

  if (!hasSameDeploymentCapability(definition.capabilities.deployment, expected)) {
    throw new Error(
      `Resource definition ${definition.id} deployment capability does not match its Terraform identity`
    );
  }
}

function createResourceDeploymentCapability(input: {
  readonly resourceType: ResourceType;
  readonly terraformBlockType: TerraformBlockType;
  readonly terraformPreview: boolean;
  readonly terraformResourceType: string;
}): ResourceDeploymentCapability {
  const excludedOptimization = {
    desiredStateReuse: "none",
    artifactReuse: "none",
    runtimeNoOp: "none",
    healthVerification: "none"
  } as const;

  if (input.terraformBlockType === "data") {
    return {
      status: "excluded",
      provisioner: "terraform",
      executionRole: "data_source",
      reason: "terraform_data_source",
      optimization: excludedOptimization
    };
  }

  if (input.resourceType === DEFAULT_RESOURCE_TYPE) {
    return {
      status: "excluded",
      provisioner: "terraform",
      executionRole: "managed_resource",
      reason: "unmodeled_resource",
      optimization: excludedOptimization
    };
  }

  if (!input.terraformPreview) {
    return {
      status: "excluded",
      provisioner: "terraform",
      executionRole: "catalog_resource",
      reason: "catalog_only",
      optimization: excludedOptimization
    };
  }

  const runtimeAdapters =
    RUNTIME_ADAPTERS_BY_TERRAFORM_RESOURCE[
      input.terraformResourceType as keyof typeof RUNTIME_ADAPTERS_BY_TERRAFORM_RESOURCE
    ];
  if (runtimeAdapters) {
    return {
      status: "supported",
      provisioner: "terraform",
      executionRole: "managed_resource",
      optimization: {
        desiredStateReuse: "verified",
        artifactReuse: "verified",
        runtimeNoOp: "provider_verified",
        healthVerification: "provider",
        runtimeAdapters
      }
    };
  }

  return {
    status: "supported",
    provisioner: "terraform",
    executionRole: "managed_resource",
    optimization: {
      desiredStateReuse: "verified",
      artifactReuse: "none",
      runtimeNoOp: "none",
      healthVerification: "terraform_plan"
    }
  };
}

function hasSameDeploymentCapability(
  left: ResourceDeploymentCapability,
  right: ResourceDeploymentCapability
): boolean {
  if (
    left.status !== right.status ||
    left.provisioner !== right.provisioner ||
    left.executionRole !== right.executionRole ||
    left.optimization.desiredStateReuse !== right.optimization.desiredStateReuse ||
    left.optimization.artifactReuse !== right.optimization.artifactReuse ||
    left.optimization.runtimeNoOp !== right.optimization.runtimeNoOp ||
    left.optimization.healthVerification !== right.optimization.healthVerification
  ) {
    return false;
  }

  if (
    left.optimization.runtimeNoOp === "provider_verified" ||
    right.optimization.runtimeNoOp === "provider_verified"
  ) {
    return (
      left.optimization.runtimeNoOp === "provider_verified" &&
      right.optimization.runtimeNoOp === "provider_verified" &&
      left.optimization.runtimeAdapters.join("|") === right.optimization.runtimeAdapters.join("|")
    );
  }

  return (
    left.status === "supported" || (right.status === "excluded" && left.reason === right.reason)
  );
}

function createTerraformDefinitionKey(blockType: TerraformBlockType, resourceType: string): string {
  return `${blockType}/${resourceType}`;
}
