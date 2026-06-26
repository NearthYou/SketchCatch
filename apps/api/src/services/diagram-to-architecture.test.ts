import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, DiagramNodeParameters } from "@sketchcatch/types";
import { convertDiagramJsonToArchitectureJson } from "./diagram-to-architecture.js";

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
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(
    architectureJson.nodes.map((node) => node.type),
    ["VPC", "SUBNET", "EC2", "RDS", "S3"]
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
