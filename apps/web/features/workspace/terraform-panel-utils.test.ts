import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  createTerraformFilesFromGeneratedCode,
  findTerraformBlockForNode,
  getTerraformFileOptions,
  parseTerraformFiles
} from "./terraform-panel-utils";

test("parseTerraformFiles keeps CRLF offsets aligned with original source slices", () => {
  const code = [
    `resource "aws_vpc" "main" {`,
    `  cidr_block = "10.0.0.0/16"`,
    `}`,
    ``,
    `resource "aws_subnet" "public" {`,
    `  vpc_id = aws_vpc.main.id`,
    `}`
  ].join("\r\n");

  const blocks = parseTerraformFiles([{ fileName: "main.tf", code }]);

  assert.equal(blocks.length, 2);
  assert.equal(
    code.slice(blocks[1]?.startOffset, blocks[1]?.endOffset),
    `resource "aws_subnet" "public" {\r\n  vpc_id = aws_vpc.main.id\r\n}`
  );
  assert.equal(blocks[1]?.startLine, 5);
  assert.equal(blocks[1]?.endLine, 7);
});

test("parseTerraformFiles ignores braces inside comments when finding block boundaries", () => {
  const code = `resource "aws_vpc" "main" {
  # comment with { that must not keep the block open
  cidr_block = "10.0.0.0/16" // comment with }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`;

  const blocks = parseTerraformFiles([{ fileName: "main.tf", code }]);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.address, "aws_vpc.main");
  assert.equal(blocks[0]?.endLine, 4);
  assert.equal(blocks[1]?.address, "aws_subnet.public");
  assert.equal(blocks[1]?.startLine, 6);
});

test("findTerraformBlockForNode matches resource and data nodes by Terraform identity", () => {
  const blocks = parseTerraformFiles([
    {
      fileName: "main.tf",
      code: `resource "aws_instance" "web" {
  ami = data.aws_ami.ubuntu.id
}

data "aws_ami" "ubuntu" {
  owners = ["099720109477"]
}

resource "aws_ami" "ubuntu" {
  name = "custom-ami"
}`
    }
  ]);

  assert.equal(findTerraformBlockForNode(blocks, makeNode("resource", "aws_instance", "web"))?.blockType, "resource");
  assert.equal(findTerraformBlockForNode(blocks, makeNode("data", "aws_ami", "ubuntu"))?.blockType, "data");
  assert.equal(findTerraformBlockForNode(blocks, makeNode("resource", "aws_ami", "ubuntu"))?.blockType, "resource");
});

test("findTerraformBlockForNode prefers the node file when duplicate identities exist", () => {
  const blocks = parseTerraformFiles([
    {
      fileName: "legacy.tf",
      code: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
    },
    {
      fileName: "network.tf",
      code: `resource "aws_vpc" "main" {
  cidr_block = "172.16.0.0/16"
}`
    }
  ]);

  const block = findTerraformBlockForNode(blocks, makeNode("resource", "aws_vpc", "main", "network"));

  assert.equal(block?.fileName, "network.tf");
  assert.match(block?.code ?? "", /172\.16\.0\.0\/16/);
});

test("createTerraformFilesFromGeneratedCode routes generated blocks by Terraform identity", () => {
  const files = createTerraformFilesFromGeneratedCode(
    {
      nodes: [
        makeNode("resource", "aws_vpc", "main", "network"),
        makeNode("resource", "aws_subnet", "public", "subnets.tf"),
        makeNode("data", "aws_ami", "ubuntu", "data"),
        makeNode("resource", "aws_ami", "ubuntu", "images")
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}

data "aws_ami" "ubuntu" {
  owners = ["099720109477"]
}

resource "aws_ami" "ubuntu" {
  name = "custom-ami"
}`
  );

  assert.deepEqual(
    files.map((file) => file.fileName),
    ["main.tf", "data.tf", "images.tf", "network.tf", "subnets.tf"]
  );
  assert.equal(files.find((file) => file.fileName === "network.tf")?.code.includes("aws_vpc"), true);
  assert.equal(files.find((file) => file.fileName === "subnets.tf")?.code.includes("aws_subnet"), true);
  assert.equal(files.find((file) => file.fileName === "data.tf")?.code.includes('data "aws_ami" "ubuntu"'), true);
  assert.equal(files.find((file) => file.fileName === "images.tf")?.code.includes('resource "aws_ami" "ubuntu"'), true);
});

test("getTerraformFileOptions includes node and virtual file names in stable order", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode("resource", "aws_vpc", "main", "network"),
      makeNode("resource", "aws_subnet", "public", "subnets.tf")
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.deepEqual(
    getTerraformFileOptions(diagramJson, [{ fileName: "terraform.tfvars", code: "" }]),
    ["main.tf", "network.tf", "subnets.tf", "terraform.tfvars"]
  );
});

function makeNode(
  terraformBlockType: "resource" | "data",
  resourceType: string,
  resourceName: string,
  fileName = "main"
): DiagramNode {
  return {
    id: `${resourceType}-${resourceName}`,
    type: resourceType,
    kind: "resource",
    label: resourceName,
    position: { x: 0, y: 0 },
    size: { width: 160, height: 96 },
    locked: false,
    zIndex: 0,
    parameters: {
      terraformBlockType,
      resourceType,
      resourceName,
      fileName,
      values: {}
    }
  };
}
