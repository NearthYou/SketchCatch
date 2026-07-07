import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getResourceDefinitionById,
  getResourceDefinitionByTerraform,
  resourceDefinitions
} from "@sketchcatch/types/resource-definitions";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { resourceCatalog } from "./catalog";

const publicDirectoryPath = fileURLToPath(new URL("../../public", import.meta.url));

const terraformDefinitionKeys = new Set(
  resourceDefinitions.map(
    (definition) => `${definition.terraform.blockType}/${definition.terraform.resourceType}`
  )
);

const requestedMissingCatalogItems = [
  {
    id: "aws-api-gateway-websocket-api",
    type: "aws_apigatewayv2_api",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-API-Gateway_64.svg"
  },
  {
    id: "aws-sqs-queue",
    type: "aws_sqs_queue",
    iconUrl:
      "/Resource-Icons_07312025/Res_Application-Integration/Res_Amazon-Simple-Queue-Service_Queue_48.svg"
  },
  {
    id: "aws-elasticache-redis",
    type: "aws_elasticache_replication_group",
    iconUrl:
      "/Resource-Icons_07312025/Res_Database/Res_Amazon-ElastiCache_ElastiCache-for-Redis_48.svg"
  },
  {
    id: "aws-acm-certificate",
    type: "aws_acm_certificate",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Certificate-Manager_64.svg"
  },
  {
    id: "aws-rds-read-replica",
    type: "aws_db_instance",
    iconUrl: "/Architecture-Service-Icons_07312025/Arch_Database/64/Arch_Amazon-RDS_64.svg"
  },
  {
    id: "aws-rds-cluster",
    type: "aws_rds_cluster",
    iconUrl:
      "/Resource-Icons_07312025/Res_Database/Res_Amazon-RDS_Multi-AZ-DB-Cluster_48.svg"
  },
  {
    id: "aws-api-gateway-stage",
    type: "aws_api_gateway_stage",
    iconUrl:
      "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg"
  },
  {
    id: "aws-step-functions-state-machine",
    type: "aws_sfn_state_machine",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_App-Integration/64/Arch_AWS-Step-Functions_64.svg"
  },
  {
    id: "aws-lambda-event-source-mapping",
    type: "aws_lambda_event_source_mapping",
    iconUrl:
      "/Resource-Icons_07312025/Res_Compute/Res_AWS-Lambda_Lambda-Function_48.svg"
  },
  {
    id: "aws-cognito-user-pool",
    type: "aws_cognito_user_pool",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_Amazon-Cognito_64.svg"
  },
  {
    id: "aws-cognito-user-pool-client",
    type: "aws_cognito_user_pool_client",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_Amazon-Cognito_64.svg"
  },
  {
    id: "aws-ecr-repository",
    type: "aws_ecr_repository",
    iconUrl:
      "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Registry_Registry_48.svg"
  },
  {
    id: "aws-ecs-cluster",
    type: "aws_ecs_cluster",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Containers/64/Arch_Amazon-Elastic-Container-Service_64.svg"
  },
  {
    id: "aws-ecs-service",
    type: "aws_ecs_service",
    iconUrl:
      "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Service_Service_48.svg"
  },
  {
    id: "aws-ecs-task-definition",
    type: "aws_ecs_task_definition",
    iconUrl:
      "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Service_Task_48.svg"
  },
  {
    id: "aws-eks-cluster",
    type: "aws_eks_cluster",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg"
  }
] as const;

test("resourceCatalog sizes area defaults below the Region hierarchy root", () => {
  assert.deepEqual(getResourceSize("aws_region"), { width: 260, height: 180 });
  assert.deepEqual(getResourceSize("aws_vpc"), { width: 240, height: 160 });
  assert.deepEqual(getResourceSize("aws_availability_zone"), { width: 220, height: 150 });
  assert.deepEqual(getResourceSize("design_group"), { width: 200, height: 130 });
  assert.deepEqual(getResourceSize("aws_autoscaling_group"), { width: 200, height: 130 });
  assert.deepEqual(getResourceSize("aws_subnet"), { width: 180, height: 120 });
  assert.deepEqual(getResourceSize("aws_security_group"), { width: 180, height: 120 });
});

test("resourceCatalog exposes Region and AZ as board resource area items", () => {
  assert.deepEqual(getCatalogDefaults("aws-region"), {
    type: "aws_region",
    label: "Region",
    size: { width: 260, height: 180 }
  });
  assert.deepEqual(getCatalogDefaults("aws-availability-zone"), {
    type: "aws_availability_zone",
    label: "AZ",
    size: { width: 220, height: 150 }
  });
});

test("resourceCatalog keeps regular network resources at icon node size", () => {
  assert.deepEqual(getResourceSize("aws_internet_gateway"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_route_table_association"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_cloudfront_distribution"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_s3_bucket"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_db_subnet_group"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_api_gateway_rest_api"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_api_gateway_resource"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_cloudwatch_event_rule"), { width: 124, height: 96 });
});

test("resourceCatalog provides a CloudFront icon for converted drafts and Terraform proposals", () => {
  const resource = resourceCatalog.find(
    (item) => item.nodeDefaults.type === "aws_cloudfront_distribution"
  );

  assert.equal(
    resource?.iconUrl,
    "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg"
  );
});

test("resourceCatalog Terraform entries use shared resource definitions", () => {
  for (const resource of getTerraformCatalogItems()) {
    const terraformBlockType = resource.nodeDefaults.terraformBlockType ?? "resource";
    const definition = getResourceDefinitionById(resource.id);
    const terraformDefinition = getResourceDefinitionByTerraform(
      terraformBlockType,
      resource.nodeDefaults.type
    );

    assert.ok(
      definition,
      `Missing shared definition for catalog id ${resource.id}`
    );
    assert.ok(
      terraformDefinition,
      `Missing shared Terraform lookup for ${terraformBlockType}/${resource.nodeDefaults.type}`
    );
    assert.equal(definition.terraform.blockType, terraformBlockType);
    assert.equal(definition.terraform.resourceType, resource.nodeDefaults.type);
    assert.equal(resource.cloudProvider, definition.provider);
  }
});

test("resourceCatalog displays every shared Terraform resource definition", () => {
  const catalogDefinitionIds = new Set(getTerraformCatalogItems().map((resource) => resource.id));

  for (const definition of resourceDefinitions) {
    assert.ok(catalogDefinitionIds.has(definition.id), `Missing catalog presentation for ${definition.id}`);
  }
});

test("resource parameter panel capability matches the parameter catalog", () => {
  const parameterCatalogResourceTypes = Object.keys(terraformParameterCatalog.resources).sort();
  const capabilityResourceTypes = resourceDefinitions
    .filter((definition) => definition.capabilities.parameterPanel)
    .map((definition) => definition.terraform.resourceType)
    .sort();

  assert.deepEqual(capabilityResourceTypes, parameterCatalogResourceTypes);
});

test("resourceCatalog exposes requested missing resources with public icon assets", () => {
  for (const expected of requestedMissingCatalogItems) {
    const resource = resourceCatalog.find((item) => item.id === expected.id);

    assert.ok(resource, `Missing catalog resource: ${expected.id}`);
    assert.equal(resource.nodeDefaults.type, expected.type, expected.id);
    assert.equal(resource.iconUrl, expected.iconUrl, expected.id);
    assert.equal(existsSync(`${publicDirectoryPath}${expected.iconUrl}`), true, expected.iconUrl);
  }
});

test("RDS parameters include the read replica source field", () => {
  const rdsParameters = terraformParameterCatalog.resources["aws_db_instance"] ?? [];
  const readReplicaField = rdsParameters.find((parameter) => parameter.name === "replicateSourceDb");

  assert.ok(readReplicaField, "Missing aws_db_instance.replicateSourceDb");
  assert.equal(readReplicaField.terraformName, "replicate_source_db");
});

function getResourceSize(resourceType: string) {
  const resource = resourceCatalog.find((item) => item.nodeDefaults.type === resourceType);

  assert.ok(resource, `Missing catalog resource: ${resourceType}`);

  return resource.nodeDefaults.size;
}

function getCatalogDefaults(resourceId: string) {
  const resource = resourceCatalog.find((item) => item.id === resourceId);

  assert.ok(resource, `Missing catalog resource: ${resourceId}`);

  return resource.nodeDefaults;
}

function getTerraformCatalogItems() {
  return resourceCatalog.filter((resource) => terraformDefinitionKeys.has(createCatalogResourceKey(resource)));
}

function createCatalogResourceKey(resource: (typeof resourceCatalog)[number]): string {
  return `${resource.nodeDefaults.terraformBlockType ?? "resource"}/${resource.nodeDefaults.type}`;
}
