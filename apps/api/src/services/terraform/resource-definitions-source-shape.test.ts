import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getResourceDefinitionById,
  getResourceDefinitionByTerraform,
  resourceDefinitions
} from "@sketchcatch/types/resource-definitions";

const resourceDefinitionsSource = readFileSync(
  fileURLToPath(new URL("../../../../../packages/types/src/resource-definitions.ts", import.meta.url)),
  "utf8"
);

const requestedResourceDefinitions = [
  {
    id: "aws-autoscaling-group",
    resourceType: "AUTO_SCALING_GROUP",
    terraformResourceType: "aws_autoscaling_group"
  },
  {
    id: "aws-launch-template",
    resourceType: "LAUNCH_TEMPLATE",
    terraformResourceType: "aws_launch_template"
  },
  {
    id: "aws-lb-target-group",
    resourceType: "LOAD_BALANCER_TARGET_GROUP",
    terraformResourceType: "aws_lb_target_group"
  },
  {
    id: "aws-nat-gateway",
    resourceType: "NAT_GATEWAY",
    terraformResourceType: "aws_nat_gateway"
  },
  {
    id: "aws-eip",
    resourceType: "ELASTIC_IP",
    terraformResourceType: "aws_eip"
  },
  {
    id: "aws-dynamodb-table",
    resourceType: "DYNAMODB_TABLE",
    terraformResourceType: "aws_dynamodb_table"
  },
  {
    id: "aws-api-gateway-websocket-api",
    resourceType: "API_GATEWAY_WEBSOCKET_API",
    terraformResourceType: "aws_apigatewayv2_api"
  },
  {
    id: "aws-sns-topic",
    resourceType: "SNS_TOPIC",
    terraformResourceType: "aws_sns_topic"
  },
  {
    id: "aws-sqs-queue",
    resourceType: "SQS_QUEUE",
    terraformResourceType: "aws_sqs_queue"
  },
  {
    id: "aws-eventbridge-rule",
    resourceType: "EVENTBRIDGE_RULE",
    terraformResourceType: "aws_cloudwatch_event_rule"
  },
  {
    id: "aws-eventbridge-target",
    resourceType: "EVENTBRIDGE_TARGET",
    terraformResourceType: "aws_cloudwatch_event_target"
  },
  {
    id: "aws-elasticache-redis",
    resourceType: "ELASTICACHE_REDIS",
    terraformResourceType: "aws_elasticache_replication_group"
  },
  {
    id: "aws-acm-certificate",
    resourceType: "ACM_CERTIFICATE",
    terraformResourceType: "aws_acm_certificate"
  },
  {
    id: "aws-cloudwatch-dashboard",
    resourceType: "CLOUDWATCH_DASHBOARD",
    terraformResourceType: "aws_cloudwatch_dashboard"
  },
  {
    id: "aws-rds-read-replica",
    resourceType: "RDS_READ_REPLICA",
    terraformResourceType: "aws_db_instance"
  },
  {
    id: "aws-rds-cluster",
    resourceType: "RDS_CLUSTER",
    terraformResourceType: "aws_rds_cluster"
  },
  {
    id: "aws-ebs-volume",
    resourceType: "EBS_VOLUME",
    terraformResourceType: "aws_ebs_volume"
  },
  {
    id: "aws-key-pair",
    resourceType: "KEY_PAIR",
    terraformResourceType: "aws_key_pair"
  },
  {
    id: "aws-api-gateway-resource",
    resourceType: "API_GATEWAY_RESOURCE",
    terraformResourceType: "aws_api_gateway_resource"
  },
  {
    id: "aws-api-gateway-method",
    resourceType: "API_GATEWAY_METHOD",
    terraformResourceType: "aws_api_gateway_method"
  },
  {
    id: "aws-api-gateway-integration",
    resourceType: "API_GATEWAY_INTEGRATION",
    terraformResourceType: "aws_api_gateway_integration"
  },
  {
    id: "aws-api-gateway-stage",
    resourceType: "API_GATEWAY_STAGE",
    terraformResourceType: "aws_api_gateway_stage"
  },
  {
    id: "aws-step-functions-state-machine",
    resourceType: "STEP_FUNCTIONS_STATE_MACHINE",
    terraformResourceType: "aws_sfn_state_machine"
  },
  {
    id: "aws-lambda-event-source-mapping",
    resourceType: "LAMBDA_EVENT_SOURCE_MAPPING",
    terraformResourceType: "aws_lambda_event_source_mapping"
  },
  {
    id: "aws-cognito-user-pool",
    resourceType: "COGNITO_USER_POOL",
    terraformResourceType: "aws_cognito_user_pool"
  },
  {
    id: "aws-cognito-user-pool-client",
    resourceType: "COGNITO_USER_POOL_CLIENT",
    terraformResourceType: "aws_cognito_user_pool_client"
  },
  {
    id: "aws-ecr-repository",
    resourceType: "ECR_REPOSITORY",
    terraformResourceType: "aws_ecr_repository"
  },
  {
    id: "aws-ecs-cluster",
    resourceType: "ECS_CLUSTER",
    terraformResourceType: "aws_ecs_cluster"
  },
  {
    id: "aws-ecs-service",
    resourceType: "ECS_SERVICE",
    terraformResourceType: "aws_ecs_service"
  },
  {
    id: "aws-ecs-task-definition",
    resourceType: "ECS_TASK_DEFINITION",
    terraformResourceType: "aws_ecs_task_definition"
  },
  {
    id: "aws-eks-cluster",
    resourceType: "EKS_CLUSTER",
    terraformResourceType: "aws_eks_cluster"
  },
  {
    id: "aws-cloudfront-origin-access-control",
    resourceType: "CLOUDFRONT",
    terraformResourceType: "aws_cloudfront_origin_access_control"
  },
  {
    id: "aws-codebuild-project",
    resourceType: "UNKNOWN",
    terraformResourceType: "aws_codebuild_project"
  },
  {
    id: "aws-codedeploy-app",
    resourceType: "UNKNOWN",
    terraformResourceType: "aws_codedeploy_app"
  },
  {
    id: "aws-codedeploy-deployment-group",
    resourceType: "UNKNOWN",
    terraformResourceType: "aws_codedeploy_deployment_group"
  },
  {
    id: "aws-codepipeline",
    resourceType: "UNKNOWN",
    terraformResourceType: "aws_codepipeline"
  },
  {
    id: "aws-codestarconnections-connection",
    resourceType: "UNKNOWN",
    terraformResourceType: "aws_codestarconnections_connection"
  },
  {
    id: "aws-iam-role-policy",
    resourceType: "IAM_POLICY",
    terraformResourceType: "aws_iam_role_policy"
  },
  {
    id: "aws-iam-role-policy-attachment",
    resourceType: "IAM_POLICY",
    terraformResourceType: "aws_iam_role_policy_attachment"
  },
  {
    id: "aws-route",
    resourceType: "ROUTE_TABLE",
    terraformResourceType: "aws_route"
  },
  {
    id: "aws-secretsmanager-secret-version",
    resourceType: "SECRETS_MANAGER_SECRET",
    terraformResourceType: "aws_secretsmanager_secret_version"
  },
  {
    id: "aws-caller-identity",
    resourceType: "UNKNOWN",
    terraformBlockType: "data",
    terraformResourceType: "aws_caller_identity"
  },
  {
    id: "aws-ssm-parameter",
    resourceType: "UNKNOWN",
    terraformBlockType: "data",
    terraformResourceType: "aws_ssm_parameter"
  }
] as const;

test("AWS resource definitions declare Terraform Preview and Sync explicitly", () => {
  const definitionBlocks = Array.from(
    resourceDefinitionsSource.matchAll(/^\s{2}createAwsResourceDefinition\(\{(?<body>[\s\S]*?)\n\s*\}\)/gm)
  ).map((match) => match.groups?.body ?? "");

  assert.equal(
    definitionBlocks.length,
    resourceDefinitions.filter((definition) => definition.provider === "aws").length
  );

  for (const block of definitionBlocks) {
    const resourceId = /id:\s*"(?<id>[^"]+)"/.exec(block)?.groups?.id ?? "unknown";

    assert.match(block, /terraformPreview:\s*true/, `${resourceId} should declare terraformPreview`);
    assert.match(block, /terraformSync:\s*true/, `${resourceId} should declare terraformSync`);
  }
});

test("AWS resource definition factory does not enable Terraform support implicitly", () => {
  const factorySource = getFunctionSource(resourceDefinitionsSource, "createAwsResourceDefinition");

  assert.match(factorySource, /terraformPreview\s*=\s*false/);
  assert.match(factorySource, /terraformSync\s*=\s*false/);
});

test("priority AWS ResourceTypes are represented by explicit shared definitions", () => {
  for (const expected of requestedResourceDefinitions) {
    const definition = getResourceDefinitionById(expected.id);

    assert.ok(definition, `Missing shared definition ${expected.id}`);
    assert.equal(definition.resourceType, expected.resourceType, expected.id);
    const terraformBlockType =
      "terraformBlockType" in expected ? expected.terraformBlockType : "resource";

    assert.equal(definition.terraform.blockType, terraformBlockType, expected.id);
    assert.equal(definition.terraform.resourceType, expected.terraformResourceType, expected.id);
    assert.equal(definition.capabilities.terraformPreview, true, expected.id);
    assert.equal(definition.capabilities.terraformSync, true, expected.id);
  }
});

test("RDS read replica does not replace the generic aws_db_instance lookup", () => {
  assert.equal(getResourceDefinitionByTerraform("resource", "aws_db_instance")?.id, "aws-rds-instance");
});

function getFunctionSource(source: string, functionName: string): string {
  const functionStart = source.indexOf(`function ${functionName}`);

  assert.ok(functionStart >= 0, `Expected ${functionName} to exist`);

  return source.slice(functionStart);
}
