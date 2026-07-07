import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { DiagramNode, DiagramNodeParameters } from "@sketchcatch/types";
import { convertDiagramJsonToArchitectureJson } from "./diagram-to-architecture.js";

test("diagram-to-architecture uses shared resource definitions for Terraform mapping", () => {
  const source = readFileSync(
    fileURLToPath(new URL("diagram-to-architecture.ts", import.meta.url)),
    "utf8"
  );

  assert.doesNotMatch(source, /TERRAFORM_RESOURCE_TYPE_TO_RESOURCE_TYPE/);
  assert.match(source, /getResourceDefinitionByTerraform/);
});

test("converts supported DiagramJson resource nodes to ArchitectureJson nodes", () => {
  const architectureJson = convertDiagramJsonToArchitectureJson({
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        label: "main-vpc",
        position: { x: 10, y: 20 },
        parameters: makeParameters("aws_vpc", "main", {
          cidrBlock: "10.0.0.0/16"
        })
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        label: "public-subnet",
        parameters: makeParameters("aws_subnet", "public", {
          vpcId: "aws_vpc.main.id"
        })
      }),
      makeNode({
        id: "ec2-1",
        type: "aws_instance",
        label: "api-server",
        parameters: makeParameters("aws_instance", "api", {
          instanceType: "t3.micro"
        })
      }),
      makeNode({
        id: "rds-1",
        type: "aws_db_instance",
        label: "database",
        parameters: makeParameters("aws_db_instance", "primary", {
          engine: "postgres"
        })
      }),
      makeNode({
        id: "s3-1",
        type: "aws_s3_bucket",
        label: "assets",
        parameters: makeParameters("aws_s3_bucket", "assets", {
          bucket: "sketchcatch-assets"
        })
      }),
      makeNode({
        id: "role-1",
        type: "aws_iam_role",
        label: "runtime-role",
        parameters: makeParameters("aws_iam_role", "runtime", {
          assumeRolePolicy: "policy-json"
        })
      }),
      makeNode({
        id: "policy-1",
        type: "aws_iam_policy",
        label: "runtime-policy",
        parameters: makeParameters("aws_iam_policy", "runtime", {
          policy: "policy-json"
        })
      }),
      makeNode({
        id: "profile-1",
        type: "aws_iam_instance_profile",
        label: "runtime-profile",
        parameters: makeParameters("aws_iam_instance_profile", "runtime", {
          role: "aws_iam_role.runtime.name"
        })
      }),
      makeNode({
        id: "kms-1",
        type: "aws_kms_key",
        label: "encryption-key",
        parameters: makeParameters("aws_kms_key", "main", {
          enableKeyRotation: true
        })
      }),
      makeNode({
        id: "logs-1",
        type: "aws_cloudwatch_log_group",
        label: "logs",
        parameters: makeParameters("aws_cloudwatch_log_group", "main", {
          retentionInDays: 14
        })
      }),
      makeNode({
        id: "alarm-1",
        type: "aws_cloudwatch_metric_alarm",
        label: "alarm",
        parameters: makeParameters("aws_cloudwatch_metric_alarm", "high_cpu", {
          alarmName: "high-cpu"
        })
      }),
      makeNode({
        id: "api-1",
        type: "aws_api_gateway_rest_api",
        label: "api",
        parameters: makeParameters("aws_api_gateway_rest_api", "practice", {
          name: "practice-api"
        })
      }),
      makeNode({
        id: "lambda-permission-1",
        type: "aws_lambda_permission",
        label: "lambda-permission",
        parameters: makeParameters("aws_lambda_permission", "allow_api", {
          action: "lambda:InvokeFunction",
          functionName: "aws_lambda_function.handler.function_name",
          principal: "apigateway.amazonaws.com"
        })
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(
    architectureJson.nodes.map((node) => node.type),
    [
      "VPC",
      "SUBNET",
      "EC2",
      "RDS",
      "S3",
      "IAM_ROLE",
      "IAM_POLICY",
      "IAM_INSTANCE_PROFILE",
      "KMS_KEY",
      "CLOUDWATCH_LOG_GROUP",
      "CLOUDWATCH_METRIC_ALARM",
      "API_GATEWAY_REST_API",
      "LAMBDA_PERMISSION"
    ]
  );
  assert.deepEqual(architectureJson.nodes[0], {
    id: "vpc-1",
    type: "VPC",
    label: "main-vpc",
    positionX: 10,
    positionY: 20,
    config: {
      cidrBlock: "10.0.0.0/16",
      terraformResourceName: "main",
      terraformResourceType: "aws_vpc"
    }
  });
});

test("converts aws_db_instance with replicate source into an RDS read replica ResourceType", () => {
  const architectureJson = convertDiagramJsonToArchitectureJson({
    nodes: [
      makeNode({
        id: "rds-read-replica",
        type: "aws_db_instance",
        label: "database replica",
        parameters: makeParameters("aws_db_instance", "replica", {
          replicateSourceDb: "aws_db_instance.primary.identifier"
        })
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(architectureJson.nodes[0]?.type, "RDS_READ_REPLICA");
});

test("skips design nodes, missing parameters, invalid nodes, and dangling edges", () => {
  const architectureJson = convertDiagramJsonToArchitectureJson({
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        label: "main-vpc",
        parameters: makeParameters("aws_vpc", "main", {
          cidrBlock: "10.0.0.0/16"
        })
      }),
      makeNode({
        id: "design-1",
        type: "sketchcatch_group",
        kind: "design",
        label: "group"
      }),
      makeNode({
        id: "missing-parameters",
        type: "aws_instance",
        label: "missing"
      }),
      makeNode({
        id: "null-parameters",
        type: "aws_instance",
        label: "null parameters",
        parameters: null
      } as unknown as DiagramNode),
      makeNode({
        id: "invalid-resource",
        type: "aws_s3_bucket",
        label: "invalid",
        parameters: {
          ...makeParameters("aws_s3_bucket", "invalid", {}),
          invalid: true
        }
      })
    ],
    edges: [
      {
        id: "valid-self-edge",
        sourceNodeId: "vpc-1",
        targetNodeId: "vpc-1"
      },
      {
        id: "dangling-edge",
        sourceNodeId: "vpc-1",
        targetNodeId: "missing-parameters"
      },
      {
        id: "null-parameters-edge",
        sourceNodeId: "vpc-1",
        targetNodeId: "null-parameters"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(
    architectureJson.nodes.map((node) => node.id),
    ["vpc-1"]
  );
  assert.deepEqual(architectureJson.edges, [
    {
      id: "valid-self-edge",
      sourceId: "vpc-1",
      targetId: "vpc-1",
      label: undefined
    }
  ]);
});

test("normalizes open SSH security group rules for pre-deployment analysis", () => {
  const architectureJson = convertDiagramJsonToArchitectureJson({
    nodes: [
      makeNode({
        id: "sg-rule-ssh",
        type: "aws_security_group_rule",
        label: "ssh",
        parameters: makeParameters("aws_security_group_rule", "ssh", {
          type: "ingress",
          fromPort: 22,
          toPort: 22,
          cidrBlocks: ["0.0.0.0/0"]
        })
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(architectureJson.nodes[0]?.config.ingress, [
    {
      cidr: "0.0.0.0/0",
      port: 22
    }
  ]);
  assert.equal(architectureJson.nodes[0]?.type, "SECURITY_GROUP");
});

test("normalizes string ports in security group rules", () => {
  const architectureJson = convertDiagramJsonToArchitectureJson({
    nodes: [
      makeNode({
        id: "sg-rule-ssh",
        type: "aws_security_group_rule",
        label: "ssh",
        parameters: makeParameters("aws_security_group_rule", "ssh", {
          type: "ingress",
          fromPort: "22",
          cidrBlocks: ["0.0.0.0/0"]
        })
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(architectureJson.nodes[0]?.config.ingress, [
    {
      cidr: "0.0.0.0/0",
      port: 22
    }
  ]);
});

function makeParameters(
  resourceType: string,
  resourceName: string,
  values: Record<string, unknown>
): DiagramNodeParameters {
  return {
    fileName: "main",
    resourceName,
    resourceType,
    terraformBlockType: "resource",
    values
  };
}

function makeNode(
  node: Omit<DiagramNode, "position" | "size" | "locked" | "zIndex" | "kind"> &
    Partial<Pick<DiagramNode, "position" | "size" | "locked" | "zIndex" | "kind">>
): DiagramNode {
  return {
    kind: "resource",
    locked: false,
    position: { x: 0, y: 0 },
    size: { width: 160, height: 96 },
    zIndex: 0,
    ...node
  };
}
