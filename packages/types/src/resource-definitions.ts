import type { CloudProvider, ResourceType, TerraformBlockType } from "./index.js";

export type ResourceCapability = {
  readonly terraformPreview: boolean;
  readonly terraformSync: boolean;
  readonly parameterPanel: boolean;
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

type ResourceDefinitionInput = Omit<AwsResourceDefinitionInput, "terraformResourceType"> & {
  readonly provider: CloudProvider;
  readonly terraformResourceType: string;
};

const DEFAULT_RESOURCE_TYPE: ResourceType = "UNKNOWN";
const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";

export const resourceDefinitions = [
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
    parameterPanel: false,
    resourceType: "UNKNOWN",
    terraformBlockType: "data",
    terraformPreview: true,
    terraformResourceType: "aws_caller_identity",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ssm-parameter",
    parameterPanel: false,
    resourceType: "UNKNOWN",
    terraformBlockType: "data",
    terraformPreview: true,
    terraformResourceType: "aws_ssm_parameter",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ec2-managed-prefix-list",
    parameterPanel: false,
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
    parameterPanel: false,
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
    id: "aws-rds-read-replica",
    parameterPanel: false,
    resourceType: "RDS_READ_REPLICA",
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
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_codebuild_project",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codedeploy-app",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_codedeploy_app",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codedeploy-deployment-group",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_codedeploy_deployment_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codepipeline",
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_codepipeline",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codestarconnections-connection",
    parameterPanel: false,
    resourceType: "UNKNOWN",
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
    parameterPanel: false,
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
    parameterPanel: false,
    resourceType: "COGNITO_USER_POOL",
    terraformPreview: true,
    terraformResourceType: "aws_cognito_user_pool",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-cognito-user-pool-client",
    parameterPanel: false,
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
  })
] as const satisfies readonly ResourceDefinition[];

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

function createResourceDefinition({
  id,
  provider,
  parameterPanel = true,
  resourceType = DEFAULT_RESOURCE_TYPE,
  terraformBlockType = DEFAULT_TERRAFORM_BLOCK_TYPE,
  terraformPreview = false,
  terraformResourceType,
  terraformSync = false
}: ResourceDefinitionInput): ResourceDefinition {
  return {
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
      terraformSync
    }
  };
}

function createTerraformDefinitionKey(blockType: TerraformBlockType, resourceType: string): string {
  return `${blockType}/${resourceType}`;
}
