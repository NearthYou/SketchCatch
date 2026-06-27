import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { syncTerraformToDiagramJson } from "./terraform-to-diagram.js";

test("updates values for a matching generated resource block", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
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
            tags: {
              Name: "main-vpc"
            }
          }
        }
      })
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-2"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
  enable_dns_support = false
  tags = {
    Name = "renamed-vpc"
  }
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, {
    cidrBlock: "10.1.0.0/16",
    enableDnsSupport: false,
    tags: {
      Name: "renamed-vpc"
    }
  });
  assert.deepEqual(result.diagramJson.edges, diagramJson.edges);
  assert.deepEqual(result.diagramJson.viewport, diagramJson.viewport);
});

test("updates data block values", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
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
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `data "aws_ami" "ubuntu" {
  most_recent = false
  owners = [
    "self",
  ]
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, {
    mostRecent: false,
    owners: ["self"]
  });
});

test("keeps the input diagram when a block is unmatched", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "unknown" {
  cidr_block = "10.1.0.0/16"
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.unmatched_block");
});

test("keeps the input diagram when Terraform code has no syncable blocks", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(diagramJson, "");

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.empty");
});

test("keeps the input diagram when an unsupported expression is found", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = format("10.%d.0.0/16", 1)
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.unsupported_expression");
});

test("keeps the input diagram when an invalid attribute value is found", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = @
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.unsupported_expression");
});

test("keeps the input diagram when an indexing expression is found", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_subnet" "public" {
  vpc_id = var.subnet_ids[0]
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.unsupported_expression");
});

test("rejects trailing tokens after a parsed attribute value", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"abc
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.trailing_tokens");
});

test("rejects trailing tokens after a parsed list value", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "data-1",
        type: "aws_ami",
        kind: "resource",
        label: "ami",
        parameters: {
          terraformBlockType: "data",
          resourceType: "aws_ami",
          resourceName: "ami",
          fileName: "main",
          values: {
            owners: [""],
            filterName: "cxzv",
            filterValues: [""]
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `data "aws_ami" "ami" {
  owners = [
    "",
  ]
  filter_name = "cxzv"
  filter_values = [
    "",
  ]asdfasdf
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.trailing_tokens");
});

test("rejects duplicate block addresses", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}

resource "aws_vpc" "main" {
  cidr_block = "10.2.0.0/16"
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.duplicate_address");
});

test("parses references as string values", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.diagramJson.nodes[0]?.parameters?.values.vpcId, "aws_vpc.main.id");
});

function makeSingleVpcDiagramJson(): DiagramJson {
  return {
    nodes: [
      makeNode({
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
            cidrBlock: "10.0.0.0/16"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

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
