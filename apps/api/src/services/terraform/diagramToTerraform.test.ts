import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import { generateTerraformFromDiagramJson } from "./diagramToTerraform.js";

test("generates Terraform code from resource nodes", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main_vpc",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16",
            enableDnsSupport: true,
            enableDnsHostnames: true,
            tags: {
              Name: "main-vpc"
            }
          }
        }
      },
      {
        id: "node-2",
        type: "aws_subnet",
        kind: "resource",
        label: "public_subnet",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            vpcId: "aws_vpc.main.id",
            cidrBlock: "10.0.1.0/24",
            availabilityZone: "ap-northeast-2a",
            mapPublicIpOnLaunch: true,
            tags: {
              Name: "public-subnet"
            }
          }
        }
      }
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-2"
      }
    ],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
  }
}`
  );
});

test("skips non-resource, missing parameters, and invalid nodes", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "design-1",
        type: "memo",
        kind: "design",
        label: "memo"
      },
      {
        id: "missing-parameters",
        type: "aws_vpc",
        kind: "resource",
        label: "missing"
      },
      {
        id: "invalid-resource",
        type: "aws_vpc",
        kind: "resource",
        label: "invalid",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "invalid",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16"
          },
          invalid: true
        }
      }
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(generateTerraformFromDiagramJson(diagramJson), "");
});

test("defaults missing terraformBlockType to resource", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "node-1",
        type: "aws_s3_bucket",
        kind: "resource",
        label: "logs",
        parameters: {
          resourceType: "aws_s3_bucket",
          resourceName: "logs",
          fileName: "main",
          values: {
            bucket: "sketchcatch-logs"
          }
        }
      }
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_s3_bucket" "logs" {
  bucket = "sketchcatch-logs"
}`
  );
});

test("renders data blocks", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "data-1",
        type: "aws_ami",
        kind: "resource",
        label: "ubuntu",
        parameters: {
          terraformBlockType: "data",
          resourceType: "aws_ami",
          resourceName: "ubuntu",
          fileName: "main",
          values: {
            mostRecent: true,
            owners: ["099720109477"]
          }
        }
      }
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `data "aws_ami" "ubuntu" {
  most_recent = true
  owners = [
    "099720109477",
  ]
}`
  );
});

test("renders arrays, numbers, booleans, null, and references", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "sg-rule-1",
        type: "aws_security_group_rule",
        kind: "resource",
        label: "ssh",
        parameters: {
          resourceType: "aws_security_group_rule",
          resourceName: "ssh",
          fileName: "main",
          values: {
            securityGroupId: "aws_security_group.web.id",
            type: "ingress",
            fromPort: 22,
            toPort: 22,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
            description: null,
            self: false
          }
        }
      }
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_security_group_rule" "ssh" {
  security_group_id = aws_security_group.web.id
  type = "ingress"
  from_port = 22
  to_port = 22
  protocol = "tcp"
  cidr_blocks = [
    "0.0.0.0/0",
  ]
  description = null
  self = false
}`
  );
});
