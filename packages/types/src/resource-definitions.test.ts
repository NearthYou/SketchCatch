import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { TerraformBlockType } from "./index.js";
import {
  assertResourceDeploymentCapability,
  createResourceDefinition,
  createTerraformParameterCatalogKey,
  getDefaultResourceDefinitionByResourceType,
  getResourceDefinitionById,
  getResourceDefinitionByTerraform,
  getReverseEngineeringAwsProviderResourceVisualFallback,
  resolveReverseEngineeringAwsProviderResourceType,
  resolveReverseEngineeringAwsResourceTypeFromArn,
  reverseEngineeringAwsResourceCatalog,
  resourceDefinitions
} from "./resource-definitions.js";

const BRAINBOARD_CAPTURE_TERRAFORM_IDENTITY_COUNT = 87;
const brainboardCaptureDirectoryPath = fileURLToPath(
  new URL("../../../docs/diagram-templates/brainboard/captures/", import.meta.url)
);

test("committed Brainboard captures have exactly one shared definition for all 87 Terraform identities", () => {
  const capturedIdentities = readCapturedTerraformIdentities();

  assert.equal(capturedIdentities.length, BRAINBOARD_CAPTURE_TERRAFORM_IDENTITY_COUNT);

  for (const { blockType, resourceType } of capturedIdentities) {
    const key = `${blockType}/${resourceType}`;
    const matches = resourceDefinitions.filter(
      (definition) =>
        definition.terraform.blockType === blockType &&
        definition.terraform.resourceType === resourceType
    );

    assert.equal(matches.length, 1, key);
    assert.equal(getResourceDefinitionById(matches[0]?.id ?? ""), matches[0], key);
    assert.equal(getResourceDefinitionByTerraform(blockType, resourceType), matches[0], key);
    assert.equal(matches[0]?.provider, "aws", key);
    assert.equal(matches[0]?.capabilities.terraformPreview, true, key);
    assert.equal(matches[0]?.capabilities.terraformSync, true, key);
  }
});

test("RDS_READ_REPLICA uses the authoritative aws_db_instance definition as its default alias", () => {
  const rdsInstance = getResourceDefinitionById("aws-rds-instance");
  const readReplicaDefault = getDefaultResourceDefinitionByResourceType("RDS_READ_REPLICA");

  assert.ok(rdsInstance);
  assert.equal(readReplicaDefault, rdsInstance);
  assert.deepEqual(readReplicaDefault.terraform, {
    blockType: "resource",
    resourceType: "aws_db_instance"
  });
  assert.equal(readReplicaDefault.resourceType, "RDS");
});

test("shared resource definition IDs and Terraform identities remain unique", () => {
  const ids = resourceDefinitions.map((definition) => definition.id);
  const terraformIdentities = resourceDefinitions.map(
    (definition) => `${definition.terraform.blockType}/${definition.terraform.resourceType}`
  );

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(terraformIdentities).size, terraformIdentities.length);
});

test("Reverse Engineering AWS catalog resolves provider aliases and ARN identities", async () => {
  const module = (await import("./resource-definitions.js")) as unknown as Record<string, unknown>;
  const resolveProviderType = module["resolveReverseEngineeringAwsProviderResourceType"];
  const resolveArn = module["resolveReverseEngineeringAwsResourceTypeFromArn"];
  const getProviderTypes = module["getReverseEngineeringAwsProviderResourceTypes"];
  const isSelected = module["isReverseEngineeringAwsProviderTypeSelected"];

  assert.equal(typeof resolveProviderType, "function");
  assert.equal(typeof resolveArn, "function");
  assert.equal(typeof getProviderTypes, "function");
  assert.equal(typeof isSelected, "function");

  if (
    typeof resolveProviderType !== "function" ||
    typeof resolveArn !== "function" ||
    typeof getProviderTypes !== "function" ||
    typeof isSelected !== "function"
  ) {
    return;
  }

  assert.equal(resolveProviderType("aws::dynamodb::table"), "DYNAMODB_TABLE");
  assert.equal(resolveProviderType("AWS::APIGateway::RestApi"), "API_GATEWAY_REST_API");
  assert.equal(
    resolveArn("arn:aws:dynamodb:ap-northeast-2:123456789012:table/demo"),
    "DYNAMODB_TABLE"
  );
  assert.equal(
    resolveArn("arn:aws:apigateway:ap-northeast-2::/restapis/a1b2c3"),
    "API_GATEWAY_REST_API"
  );
  assert.deepEqual(getProviderTypes("NETWORK_ACL"), ["AWS::EC2::NetworkAcl"]);
  assert.equal(isSelected("AWS::EC2::NetworkAclEntry", ["NETWORK_ACL"]), true);
  assert.equal(isSelected("AWS::EC2::NetworkAclEntry", ["S3"]), false);
  assert.equal(isSelected("AWS::EC2::Image", ["ALL"]), false);
});

test("Reverse Engineering normalizes every catalog provider type across inventory separators", () => {
  for (const catalogEntry of reverseEngineeringAwsResourceCatalog) {
    for (const providerResourceType of catalogEntry.providerResourceTypes) {
      assert.equal(
        resolveReverseEngineeringAwsProviderResourceType(
          toGenericInventoryProviderResourceType(providerResourceType, ":")
        ),
        catalogEntry.resourceType,
        providerResourceType
      );
      assert.equal(
        resolveReverseEngineeringAwsProviderResourceType(
          toGenericInventoryProviderResourceType(providerResourceType, "/")
        ),
        catalogEntry.resourceType,
        providerResourceType
      );
    }
  }
});

test("Reverse Engineering normalizes current generic inventory types to existing palette types", () => {
  const currentUnknownInventoryGroups = [
    {
      count: 24,
      fallback: { key: "ec2_security_group_rule", label: "EC2 Security Group Rule" },
      providerResourceType: "ec2:security-group-rule"
    },
    {
      count: 10,
      fallback: { key: "cloudformation_stack", label: "CloudFormation Stack" },
      providerResourceType: "cloudformation:stack"
    },
    { count: 8, providerResourceType: "ec2:elastic-ip", resourceType: "ELASTIC_IP" },
    {
      count: 6,
      fallback: { key: "ec2_network_interface", label: "EC2 Network Interface" },
      providerResourceType: "ec2:network-interface"
    },
    {
      count: 2,
      fallback: { key: "rds_option_group", label: "RDS Option Group" },
      providerResourceType: "rds:og"
    },
    {
      count: 2,
      fallback: { key: "rds_parameter_group", label: "RDS Parameter Group" },
      providerResourceType: "rds:pg"
    },
    {
      count: 1,
      fallback: { key: "athena_data_catalog", label: "Athena Data Catalog" },
      providerResourceType: "athena:datacatalog"
    },
    {
      count: 1,
      fallback: { key: "athena_workgroup", label: "Athena Workgroup" },
      providerResourceType: "athena:workgroup"
    },
    {
      count: 1,
      fallback: { key: "ec2_dhcp_options", label: "EC2 DHCP Options" },
      providerResourceType: "ec2:dhcp-options"
    },
    { count: 1, providerResourceType: "ec2:natgateway", resourceType: "NAT_GATEWAY" },
    {
      count: 1,
      fallback: { key: "elasticache_user", label: "ElastiCache User" },
      providerResourceType: "elasticache:user"
    },
    {
      count: 1,
      fallback: { key: "eventbridge_event_bus", label: "EventBridge Event Bus" },
      providerResourceType: "events:event-bus"
    },
    { count: 1, providerResourceType: "rds:subgrp", resourceType: "DB_SUBNET_GROUP" },
    {
      count: 1,
      fallback: { key: "resource_explorer_index", label: "Resource Explorer Index" },
      providerResourceType: "resource-explorer-2:index"
    },
    {
      count: 1,
      fallback: { key: "resource_explorer_view", label: "Resource Explorer View" },
      providerResourceType: "resource-explorer-2:view"
    }
  ] as const;

  assert.equal(
    currentUnknownInventoryGroups.reduce((total, group) => total + group.count, 0),
    61
  );

  for (const group of currentUnknownInventoryGroups) {
    if ("resourceType" in group) {
      assert.equal(
        resolveReverseEngineeringAwsProviderResourceType(group.providerResourceType),
        group.resourceType,
        group.providerResourceType
      );
      continue;
    }

    assert.equal(resolveReverseEngineeringAwsProviderResourceType(group.providerResourceType), undefined);
    assert.deepEqual(
      getReverseEngineeringAwsProviderResourceVisualFallback(group.providerResourceType),
      group.fallback,
      group.providerResourceType
    );
  }
});

test("Reverse Engineering accepts CloudFormation, Resource Explorer, and Tagging type variants", () => {
  const providerTypeVariants = [
    ["AWS::EC2::ElasticIp", "ELASTIC_IP"],
    [" EC2 : Elastic-IP ", "ELASTIC_IP"],
    ["rds::subgrp", "DB_SUBNET_GROUP"]
  ] as const;

  for (const [providerResourceType, expectedResourceType] of providerTypeVariants) {
    assert.equal(
      resolveReverseEngineeringAwsProviderResourceType(providerResourceType),
      expectedResourceType,
      providerResourceType
    );
  }

  assert.equal(resolveReverseEngineeringAwsProviderResourceType("AWS::CloudFormation::Stack"), undefined);
  assert.equal(resolveReverseEngineeringAwsProviderResourceType("AWS::Athena::DataCatalog"), undefined);
  assert.equal(resolveReverseEngineeringAwsProviderResourceType("AWS::EC2::NetworkInterface"), undefined);
  assert.equal(resolveReverseEngineeringAwsProviderResourceType("AWS::EC2::DhcpOptions"), undefined);
  assert.equal(resolveReverseEngineeringAwsProviderResourceType("AWS::EC2::SecurityGroupRule"), undefined);
  assert.equal(resolveReverseEngineeringAwsProviderResourceType("AWS::RDS::DBParameterGroup"), undefined);
  assert.equal(resolveReverseEngineeringAwsProviderResourceType("AWS::RDS::OptionGroup"), undefined);
  assert.deepEqual(
    getReverseEngineeringAwsProviderResourceVisualFallback("AWS::CloudFormation::Stack"),
    { key: "cloudformation_stack", label: "CloudFormation Stack" }
  );
  assert.deepEqual(
    getReverseEngineeringAwsProviderResourceVisualFallback("AWS::Athena::DataCatalog"),
    { key: "athena_data_catalog", label: "Athena Data Catalog" }
  );
  assert.deepEqual(
    getReverseEngineeringAwsProviderResourceVisualFallback("AWS::EC2::NetworkInterface"),
    { key: "ec2_network_interface", label: "EC2 Network Interface" }
  );
  assert.deepEqual(
    getReverseEngineeringAwsProviderResourceVisualFallback("AWS::EC2::SecurityGroupRule"),
    { key: "ec2_security_group_rule", label: "EC2 Security Group Rule" }
  );
  assert.deepEqual(
    getReverseEngineeringAwsProviderResourceVisualFallback("AWS::RDS::OptionGroup"),
    { key: "rds_option_group", label: "RDS Option Group" }
  );

  assert.equal(
    resolveReverseEngineeringAwsResourceTypeFromArn(
      "arn:aws:ec2:ap-northeast-2:123456789012:elastic-ip/eipalloc-123"
    ),
    "ELASTIC_IP"
  );
  assert.equal(
    resolveReverseEngineeringAwsResourceTypeFromArn(
      "arn:aws:ec2:ap-northeast-2:123456789012:network-interface/eni-123"
    ),
    undefined
  );
  assert.equal(
    resolveReverseEngineeringAwsResourceTypeFromArn(
      "arn:aws:rds:ap-northeast-2:123456789012:subgrp/demo"
    ),
    "DB_SUBNET_GROUP"
  );
});

test("parameter catalog keys keep resource keys compatible and namespace data sources", () => {
  assert.equal(createTerraformParameterCatalogKey("resource", "aws_iam_policy"), "aws_iam_policy");
  assert.equal(createTerraformParameterCatalogKey("data", "aws_iam_policy"), "data.aws_iam_policy");
});

test("classic AWS identities stay distinct from newer Terraform resources", () => {
  assertDistinctTerraformIdentities("aws-elb", "aws-lb");
  assertDistinctTerraformIdentities(
    "aws-cloudfront-origin-access-identity",
    "aws-cloudfront-origin-access-control"
  );
  assertDistinctTerraformIdentities("aws-s3-bucket-object", "aws-s3-object");
  assertDistinctTerraformIdentities("aws-waf-web-acl", "aws-wafv2-web-acl");

  assert.equal(
    getResourceDefinitionByTerraform("resource", "aws_waf_rule")?.terraform.resourceType,
    "aws_waf_rule"
  );
  assert.equal(
    getResourceDefinitionByTerraform("resource", "aws_waf_ipset")?.terraform.resourceType,
    "aws_waf_ipset"
  );
});

test("every deployable Terraform resource receives the verified desired-state optimization profile", () => {
  const deployableDefinitions = resourceDefinitions.filter(
    (definition) =>
      definition.capabilities.terraformPreview &&
      definition.terraform.blockType === "resource" &&
      definition.resourceType !== "UNKNOWN"
  );

  assert.ok(deployableDefinitions.length > 0);

  for (const definition of deployableDefinitions) {
    const deployment = definition.capabilities.deployment;
    assert.equal(deployment.status, "supported", definition.id);
    assert.equal(deployment.provisioner, "terraform", definition.id);
    assert.equal(deployment.executionRole, "managed_resource", definition.id);
    assert.equal(deployment.optimization.desiredStateReuse, "verified", definition.id);
  }
});

test("data sources, UNKNOWN resources, and catalog-only definitions carry explicit deployment exclusions", () => {
  let dataSourceCount = 0;
  let unknownCount = 0;

  for (const definition of resourceDefinitions) {
    if (definition.terraform.blockType === "data") {
      dataSourceCount += 1;
      assert.equal(definition.capabilities.deployment.status, "excluded", definition.id);
      assert.equal(
        definition.capabilities.deployment.reason,
        "terraform_data_source",
        definition.id
      );
      continue;
    }

    if (definition.resourceType === "UNKNOWN") {
      unknownCount += 1;
      assert.equal(definition.capabilities.deployment.status, "excluded", definition.id);
      assert.equal(definition.capabilities.deployment.reason, "unmodeled_resource", definition.id);
      continue;
    }

    if (!definition.capabilities.terraformPreview) {
      assert.equal(definition.capabilities.deployment.status, "excluded", definition.id);
      assert.equal(definition.capabilities.deployment.reason, "catalog_only", definition.id);
    }
  }

  const catalogOnlyDefinition = createResourceDefinition({
    id: "catalog-only-queue",
    provider: "aws",
    resourceType: "SQS_QUEUE",
    terraformPreview: false,
    terraformResourceType: "catalog_queue"
  });

  assert.ok(dataSourceCount > 0);
  assert.ok(unknownCount > 0);
  assert.deepEqual(catalogOnlyDefinition.capabilities.deployment, {
    status: "excluded",
    provisioner: "terraform",
    executionRole: "catalog_resource",
    reason: "catalog_only",
    optimization: {
      desiredStateReuse: "none",
      artifactReuse: "none",
      runtimeNoOp: "none",
      healthVerification: "none"
    }
  });
});

test("new provider definitions inherit deployment optimization without a central switch", () => {
  const definition = createResourceDefinition({
    id: "future-provider-queue",
    provider: "aws",
    resourceType: "SQS_QUEUE",
    terraformPreview: true,
    terraformResourceType: "future_queue"
  });

  assert.equal(definition.capabilities.deployment.status, "supported");
  assert.equal(definition.capabilities.deployment.optimization.desiredStateReuse, "verified");
});

test("AWS and Kubernetes definitions share the provider-neutral deployment contract", () => {
  const awsDefinition = getResourceDefinitionById("aws-vpc");
  const kubernetesDefinition = getResourceDefinitionById("kubernetes-namespace");

  assert.ok(awsDefinition);
  assert.ok(kubernetesDefinition);
  assert.equal(awsDefinition.provider, "aws");
  assert.equal(kubernetesDefinition.provider, "kubernetes");
  assert.deepEqual(
    awsDefinition.capabilities.deployment,
    kubernetesDefinition.capabilities.deployment
  );
});

test("invalid deployment capability combinations are rejected", () => {
  const awsVpc = getResourceDefinitionById("aws-vpc");

  assert.ok(awsVpc);
  assert.throws(
    () =>
      assertResourceDeploymentCapability({
        ...awsVpc,
        capabilities: {
          ...awsVpc.capabilities,
          deployment: {
            status: "excluded",
            provisioner: "terraform",
            executionRole: "managed_resource",
            reason: "catalog_only",
            optimization: {
              desiredStateReuse: "none",
              artifactReuse: "none",
              runtimeNoOp: "none",
              healthVerification: "none"
            }
          }
        }
      }),
    /deployment capability does not match its Terraform identity/
  );
});

function readCapturedTerraformIdentities(): Array<{
  readonly blockType: TerraformBlockType;
  readonly resourceType: string;
}> {
  const identityKeys = new Set<string>();

  for (const fileName of readdirSync(brainboardCaptureDirectoryPath).sort()) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const capture = JSON.parse(
      readFileSync(`${brainboardCaptureDirectoryPath}/${fileName}`, "utf8")
    ) as {
      readonly terraform?: {
        readonly resourceAddresses?: readonly string[] | undefined;
      } | null;
    };

    for (const address of capture.terraform?.resourceAddresses ?? []) {
      identityKeys.add(createTerraformIdentityKeyFromAddress(address));
    }
  }

  return [...identityKeys].sort().map((key) => {
    const separatorIndex = key.indexOf("/");
    const blockType = key.slice(0, separatorIndex);

    assert.ok(blockType === "data" || blockType === "resource", key);

    return {
      blockType,
      resourceType: key.slice(separatorIndex + 1)
    };
  });
}

function createTerraformIdentityKeyFromAddress(address: string): string {
  const segments = address.split(".");

  if (segments[0] === "data") {
    assert.ok(segments[1], `Invalid Terraform data address: ${address}`);
    return `data/${segments[1]}`;
  }

  assert.ok(segments[0], `Invalid Terraform resource address: ${address}`);
  return `resource/${segments[0]}`;
}

function assertDistinctTerraformIdentities(firstId: string, secondId: string): void {
  const first = getResourceDefinitionById(firstId);
  const second = getResourceDefinitionById(secondId);

  assert.ok(first, firstId);
  assert.ok(second, secondId);
  assert.notEqual(first.id, second.id);
  assert.notDeepEqual(first.terraform, second.terraform);
}

function toGenericInventoryProviderResourceType(
  cloudFormationProviderResourceType: string,
  separator: ":" | "/"
): string {
  const [, service = "", resourceKind = ""] = cloudFormationProviderResourceType.split("::");

  return [service, resourceKind]
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
        .replace(/([A-Z])([A-Z][a-z])/gu, "$1-$2")
        .toLowerCase()
    )
    .join(separator);
}
