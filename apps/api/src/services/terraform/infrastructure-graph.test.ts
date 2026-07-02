import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

test("projects renderable DiagramJson resource nodes into InfrastructureGraph nodes", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "design-1",
        type: "memo",
        kind: "design",
        label: "memo"
      }),
      makeNode({
        id: "missing-parameters",
        type: "aws_vpc",
        kind: "resource",
        label: "missing"
      }),
      makeNode({
        id: "invalid-resource",
        type: "aws_subnet",
        kind: "resource",
        label: "invalid",
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "invalid",
          fileName: "network",
          values: {
            cidrBlock: "10.0.1.0/24"
          },
          invalid: true
        }
      }),
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main_vpc",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {
            cidrBlock: "10.0.0.0/16"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.deepEqual(buildInfrastructureGraphFromDiagramJson(diagramJson), {
    nodes: [
      {
        id: "vpc-1",
        type: "VPC",
        label: "main_vpc",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network"
        },
        config: {
          cidrBlock: "10.0.0.0/16"
        }
      }
    ],
    edges: []
  });
});

test("maps supported Terraform preview blocks and excludes allowlist misses", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeResourceNode("vpc-1", "resource", "aws_vpc", "main"),
      makeResourceNode("subnet-1", "resource", "aws_subnet", "public"),
      makeResourceNode("igw-1", "resource", "aws_internet_gateway", "main"),
      makeResourceNode("route-table-1", "resource", "aws_route_table", "public"),
      makeResourceNode(
        "route-table-association-1",
        "resource",
        "aws_route_table_association",
        "public"
      ),
      makeResourceNode("security-group-1", "resource", "aws_security_group", "web"),
      makeResourceNode("instance-1", "resource", "aws_instance", "web"),
      makeResourceNode("bucket-1", "resource", "aws_s3_bucket", "assets"),
      makeResourceNode("ami-1", "data", "aws_ami", "ubuntu"),
      makeResourceNode("sg-rule-1", "resource", "aws_security_group_rule", "ssh"),
      makeResourceNode("vpc-data-1", "data", "aws_vpc", "selected")
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.deepEqual(
    buildInfrastructureGraphFromDiagramJson(diagramJson).nodes.map((node) => ({
      id: node.id,
      type: node.type,
      terraformBlockType: node.iac.terraformBlockType,
      resourceType: node.iac.resourceType
    })),
    [
      {
        id: "vpc-1",
        type: "VPC",
        terraformBlockType: "resource",
        resourceType: "aws_vpc"
      },
      {
        id: "subnet-1",
        type: "SUBNET",
        terraformBlockType: "resource",
        resourceType: "aws_subnet"
      },
      {
        id: "igw-1",
        type: "INTERNET_GATEWAY",
        terraformBlockType: "resource",
        resourceType: "aws_internet_gateway"
      },
      {
        id: "route-table-1",
        type: "ROUTE_TABLE",
        terraformBlockType: "resource",
        resourceType: "aws_route_table"
      },
      {
        id: "route-table-association-1",
        type: "ROUTE_TABLE_ASSOCIATION",
        terraformBlockType: "resource",
        resourceType: "aws_route_table_association"
      },
      {
        id: "security-group-1",
        type: "SECURITY_GROUP",
        terraformBlockType: "resource",
        resourceType: "aws_security_group"
      },
      {
        id: "instance-1",
        type: "EC2",
        terraformBlockType: "resource",
        resourceType: "aws_instance"
      },
      {
        id: "bucket-1",
        type: "S3",
        terraformBlockType: "resource",
        resourceType: "aws_s3_bucket"
      },
      {
        id: "ami-1",
        type: "AMI",
        terraformBlockType: "data",
        resourceType: "aws_ami"
      }
    ]
  );
});

function makeNode(
  node: Omit<DiagramNode, "position" | "size" | "locked" | "zIndex"> &
    Partial<Pick<DiagramNode, "position" | "size" | "locked" | "zIndex">>
): DiagramNode {
  return {
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 160,
      height: 96
    },
    locked: false,
    zIndex: 0,
    ...node
  };
}

function makeResourceNode(
  id: string,
  terraformBlockType: "resource" | "data",
  resourceType: string,
  resourceName: string
): DiagramNode {
  return makeNode({
    id,
    type: resourceType,
    kind: "resource",
    label: resourceName,
    parameters: {
      terraformBlockType,
      resourceType,
      resourceName,
      fileName: "main",
      values: {
        name: resourceName
      }
    }
  });
}
