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
  readonly resourceType?: ResourceType | undefined;
  readonly terraformBlockType?: TerraformBlockType | undefined;
  readonly parameterPanel?: boolean | undefined;
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
    terraformResourceType: "aws_vpc"
  }),
  createAwsResourceDefinition({
    id: "aws-subnet",
    resourceType: "SUBNET",
    terraformResourceType: "aws_subnet"
  }),
  createAwsResourceDefinition({
    id: "aws-internet-gateway",
    resourceType: "INTERNET_GATEWAY",
    terraformResourceType: "aws_internet_gateway"
  }),
  createAwsResourceDefinition({
    id: "aws-route-table",
    resourceType: "ROUTE_TABLE",
    terraformResourceType: "aws_route_table"
  }),
  createAwsResourceDefinition({
    id: "aws-route-table-association",
    resourceType: "ROUTE_TABLE_ASSOCIATION",
    terraformResourceType: "aws_route_table_association"
  }),
  createAwsResourceDefinition({
    id: "aws-cloudfront-distribution",
    resourceType: "CLOUDFRONT",
    terraformResourceType: "aws_cloudfront_distribution"
  }),
  createAwsResourceDefinition({
    id: "aws-nat-gateway",
    terraformResourceType: "aws_nat_gateway"
  }),
  createAwsResourceDefinition({
    id: "aws-vpc-endpoint",
    terraformResourceType: "aws_vpc_endpoint"
  }),
  createAwsResourceDefinition({
    id: "aws-security-group",
    resourceType: "SECURITY_GROUP",
    terraformResourceType: "aws_security_group"
  }),
  createAwsResourceDefinition({
    id: "aws-security-group-rule",
    resourceType: "SECURITY_GROUP",
    terraformResourceType: "aws_security_group_rule"
  }),
  createAwsResourceDefinition({
    id: "aws-iam-role",
    resourceType: "IAM_ROLE",
    terraformResourceType: "aws_iam_role"
  }),
  createAwsResourceDefinition({
    id: "aws-iam-policy",
    resourceType: "IAM_POLICY",
    terraformResourceType: "aws_iam_policy"
  }),
  createAwsResourceDefinition({
    id: "aws-iam-instance-profile",
    resourceType: "IAM_INSTANCE_PROFILE",
    terraformResourceType: "aws_iam_instance_profile"
  }),
  createAwsResourceDefinition({
    id: "aws-kms-key",
    resourceType: "KMS_KEY",
    terraformResourceType: "aws_kms_key"
  }),
  createAwsResourceDefinition({
    id: "aws-ec2-instance",
    resourceType: "EC2",
    terraformResourceType: "aws_instance"
  }),
  createAwsResourceDefinition({
    id: "aws-ami",
    resourceType: "AMI",
    terraformBlockType: "data",
    terraformResourceType: "aws_ami"
  }),
  createAwsResourceDefinition({
    id: "aws-key-pair",
    terraformResourceType: "aws_key_pair"
  }),
  createAwsResourceDefinition({
    id: "aws-eip",
    terraformResourceType: "aws_eip"
  }),
  createAwsResourceDefinition({
    id: "aws-launch-template",
    terraformResourceType: "aws_launch_template"
  }),
  createAwsResourceDefinition({
    id: "aws-autoscaling-group",
    terraformResourceType: "aws_autoscaling_group"
  }),
  createAwsResourceDefinition({
    id: "aws-lb",
    parameterPanel: false,
    terraformResourceType: "aws_lb"
  }),
  createAwsResourceDefinition({
    id: "aws-lb-target-group",
    parameterPanel: false,
    terraformResourceType: "aws_lb_target_group"
  }),
  createAwsResourceDefinition({
    id: "aws-lb-listener",
    parameterPanel: false,
    terraformResourceType: "aws_lb_listener"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket",
    resourceType: "S3",
    terraformResourceType: "aws_s3_bucket"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-object",
    parameterPanel: false,
    resourceType: "S3",
    terraformResourceType: "aws_s3_object"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-bucket-policy",
    parameterPanel: false,
    resourceType: "S3",
    terraformResourceType: "aws_s3_bucket_policy"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-website-configuration",
    parameterPanel: false,
    resourceType: "S3",
    terraformResourceType: "aws_s3_bucket_website_configuration"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-public-access-block",
    resourceType: "S3",
    terraformResourceType: "aws_s3_bucket_public_access_block"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-versioning",
    resourceType: "S3",
    terraformResourceType: "aws_s3_bucket_versioning"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-encryption",
    resourceType: "S3",
    terraformResourceType: "aws_s3_bucket_server_side_encryption_configuration"
  }),
  createAwsResourceDefinition({
    id: "aws-s3-lifecycle",
    resourceType: "S3",
    terraformResourceType: "aws_s3_bucket_lifecycle_configuration"
  }),
  createAwsResourceDefinition({
    id: "aws-ebs-volume",
    terraformResourceType: "aws_ebs_volume"
  }),
  createAwsResourceDefinition({
    id: "aws-rds-instance",
    resourceType: "RDS",
    terraformResourceType: "aws_db_instance"
  }),
  createAwsResourceDefinition({
    id: "aws-db-subnet-group",
    resourceType: "RDS",
    terraformResourceType: "aws_db_subnet_group"
  }),
  createAwsResourceDefinition({
    id: "aws-db-parameter-group",
    resourceType: "RDS",
    terraformResourceType: "aws_db_parameter_group"
  }),
  createAwsResourceDefinition({
    id: "aws-db-option-group",
    resourceType: "RDS",
    terraformResourceType: "aws_db_option_group"
  }),
  createAwsResourceDefinition({
    id: "aws-db-snapshot",
    resourceType: "RDS",
    terraformResourceType: "aws_db_snapshot"
  }),
  createAwsResourceDefinition({
    id: "aws-dynamodb-table",
    terraformResourceType: "aws_dynamodb_table"
  }),
  createAwsResourceDefinition({
    id: "aws-lambda-function",
    resourceType: "LAMBDA",
    terraformResourceType: "aws_lambda_function"
  }),
  createAwsResourceDefinition({
    id: "aws-lambda-permission",
    resourceType: "LAMBDA_PERMISSION",
    terraformResourceType: "aws_lambda_permission"
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-rest-api",
    resourceType: "API_GATEWAY_REST_API",
    terraformResourceType: "aws_api_gateway_rest_api"
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-resource",
    terraformResourceType: "aws_api_gateway_resource"
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-method",
    terraformResourceType: "aws_api_gateway_method"
  }),
  createAwsResourceDefinition({
    id: "aws-api-gateway-integration",
    terraformResourceType: "aws_api_gateway_integration"
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-log-group",
    resourceType: "CLOUDWATCH_LOG_GROUP",
    terraformResourceType: "aws_cloudwatch_log_group"
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-metric-alarm",
    resourceType: "CLOUDWATCH_METRIC_ALARM",
    terraformResourceType: "aws_cloudwatch_metric_alarm"
  }),
  createAwsResourceDefinition({
    id: "aws-cloudwatch-dashboard",
    terraformResourceType: "aws_cloudwatch_dashboard"
  }),
  createAwsResourceDefinition({
    id: "aws-eventbridge-rule",
    terraformResourceType: "aws_cloudwatch_event_rule"
  }),
  createAwsResourceDefinition({
    id: "aws-eventbridge-target",
    terraformResourceType: "aws_cloudwatch_event_target"
  }),
  createAwsResourceDefinition({
    id: "aws-sns-topic",
    terraformResourceType: "aws_sns_topic"
  })
] as const satisfies readonly ResourceDefinition[];

const resourceDefinitionById = new Map<string, ResourceDefinition>(
  resourceDefinitions.map((definition) => [definition.id, definition])
);
const defaultResourceDefinitionByResourceType = createDefaultResourceDefinitionByResourceType();
const resourceDefinitionByTerraformKey = new Map<string, ResourceDefinition>(
  resourceDefinitions.map((definition) => [
    createTerraformDefinitionKey(definition.terraform.blockType, definition.terraform.resourceType),
    definition
  ])
);

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

function createAwsResourceDefinition({
  id,
  parameterPanel = true,
  resourceType = DEFAULT_RESOURCE_TYPE,
  terraformBlockType = DEFAULT_TERRAFORM_BLOCK_TYPE,
  terraformPreview = true,
  terraformResourceType,
  terraformSync = true
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
