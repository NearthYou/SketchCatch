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
    parameterPanel: false,
    resourceType: "ROUTE_TABLE",
    terraformPreview: true,
    terraformResourceType: "aws_route",
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
    parameterPanel: false,
    resourceType: "CLOUDFRONT",
    terraformPreview: true,
    terraformResourceType: "aws_cloudfront_origin_access_control",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-route53-record",
    parameterPanel: false,
    resourceType: "ROUTE53_RECORD",
    terraformPreview: true,
    terraformResourceType: "aws_route53_record",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-wafv2-web-acl",
    parameterPanel: false,
    resourceType: "WAF_WEB_ACL",
    terraformPreview: true,
    terraformResourceType: "aws_wafv2_web_acl",
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
    parameterPanel: false,
    resourceType: "IAM_POLICY",
    terraformPreview: true,
    terraformResourceType: "aws_iam_role_policy",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-iam-role-policy-attachment",
    parameterPanel: false,
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
    id: "aws-lb",
    parameterPanel: false,
    resourceType: "LOAD_BALANCER",
    terraformPreview: true,
    terraformResourceType: "aws_lb",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lb-target-group",
    parameterPanel: false,
    resourceType: "LOAD_BALANCER_TARGET_GROUP",
    terraformPreview: true,
    terraformResourceType: "aws_lb_target_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-lb-listener",
    parameterPanel: false,
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
    parameterPanel: false,
    resourceType: "S3",
    terraformPreview: true,
    terraformResourceType: "aws_s3_object",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-policy",
    parameterPanel: false,
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
    parameterPanel: false,
    resourceType: "RDS_CLUSTER",
    terraformPreview: true,
    terraformResourceType: "aws_rds_cluster",
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
    parameterPanel: false,
    resourceType: "ELASTICACHE_REDIS",
    terraformPreview: true,
    terraformResourceType: "aws_elasticache_replication_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-secretsmanager-secret",
    parameterPanel: false,
    resourceType: "SECRETS_MANAGER_SECRET",
    terraformPreview: true,
    terraformResourceType: "aws_secretsmanager_secret",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-secretsmanager-secret-version",
    parameterPanel: false,
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
    id: "aws-lambda-event-source-mapping",
    parameterPanel: false,
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
    id: "aws-api-gateway-websocket-api",
    parameterPanel: false,
    resourceType: "API_GATEWAY_WEBSOCKET_API",
    terraformPreview: true,
    terraformResourceType: "aws_apigatewayv2_api",
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
    id: "aws-api-gateway-stage",
    parameterPanel: false,
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
    id: "aws-codebuild-project",
    parameterPanel: false,
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_codebuild_project",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codedeploy-app",
    parameterPanel: false,
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_codedeploy_app",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codedeploy-deployment-group",
    parameterPanel: false,
    resourceType: "UNKNOWN",
    terraformPreview: true,
    terraformResourceType: "aws_codedeploy_deployment_group",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-codepipeline",
    parameterPanel: false,
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
    id: "aws-sqs-queue",
    parameterPanel: false,
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
    parameterPanel: false,
    resourceType: "ACM_CERTIFICATE",
    terraformPreview: true,
    terraformResourceType: "aws_acm_certificate",
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
    id: "aws-ecr-repository",
    parameterPanel: false,
    resourceType: "ECR_REPOSITORY",
    terraformPreview: true,
    terraformResourceType: "aws_ecr_repository",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecs-cluster",
    parameterPanel: false,
    resourceType: "ECS_CLUSTER",
    terraformPreview: true,
    terraformResourceType: "aws_ecs_cluster",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecs-service",
    parameterPanel: false,
    resourceType: "ECS_SERVICE",
    terraformPreview: true,
    terraformResourceType: "aws_ecs_service",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-ecs-task-definition",
    parameterPanel: false,
    resourceType: "ECS_TASK_DEFINITION",
    terraformPreview: true,
    terraformResourceType: "aws_ecs_task_definition",
    terraformSync: true
  }),
  createAwsResourceDefinition({
    id: "aws-eks-cluster",
    parameterPanel: false,
    resourceType: "EKS_CLUSTER",
    terraformPreview: true,
    terraformResourceType: "aws_eks_cluster",
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
  return resourceDefinitionByTerraformKey.get(createTerraformDefinitionKey(blockType, resourceType));
}

function createDefaultResourceDefinitionByResourceType(): Map<ResourceType, ResourceDefinition> {
  const definitions = new Map<ResourceType, ResourceDefinition>();

  for (const definition of resourceDefinitions) {
    if (definition.resourceType === DEFAULT_RESOURCE_TYPE || definitions.has(definition.resourceType)) {
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
  return {
    id,
    provider: "aws",
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
