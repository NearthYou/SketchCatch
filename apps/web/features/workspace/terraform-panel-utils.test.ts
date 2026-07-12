import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  createTerraformFilesFromGeneratedCode,
  findTerraformBlockForNode,
  getDiagramTerraformAddresses,
  getTerraformFileOptions,
  parseTerraformFiles,
  removeTerraformBlocksByAddress,
  toDeploymentBaselineFingerprint,
  toTerraformRefreshFingerprint
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

test("findTerraformBlockForNode matches resource and data nodes by Terraform address", () => {
  const blocks = parseTerraformFiles([
    {
      fileName: "main.tf",
      code: `resource "aws_instance" "web" {
  ami = data.aws_ami.ubuntu.id
}

data "aws_ami" "ubuntu" {
  owners = ["099720109477"]
}`
    }
  ]);

  assert.equal(blocks[0]?.address, "aws_instance.web");
  assert.equal(blocks[1]?.address, "data.aws_ami.ubuntu");
  assert.equal(findTerraformBlockForNode(blocks, makeNode("resource", "aws_instance", "web"))?.blockType, "resource");
  assert.equal(findTerraformBlockForNode(blocks, makeNode("data", "aws_ami", "ubuntu"))?.blockType, "data");
});

test("findTerraformBlockForNode prefers the visible node identity over stale parameters", () => {
  const blocks = parseTerraformFiles([
    {
      fileName: "main.tf",
      code: `resource "aws_cloudwatch_event_rule" "event_rule" {
}

resource "aws_instance" "ec2_instance" {
}`
    }
  ]);
  const ec2NodeWithStaleParameters: DiagramNode = {
    ...makeNode("resource", "aws_cloudwatch_event_rule", "event_rule"),
    type: "aws_instance",
    label: "EC2 Instance"
  };

  assert.equal(findTerraformBlockForNode(blocks, ec2NodeWithStaleParameters)?.address, "aws_instance.ec2_instance");
});

test("findTerraformBlockForNode keeps resource and data blocks with the same type and name separate", () => {
  const blocks = parseTerraformFiles([
    {
      fileName: "main.tf",
      code: `resource "aws_ami" "ubuntu" {
  name = "custom-ubuntu"
}

data "aws_ami" "ubuntu" {
  owners = ["099720109477"]
}`
    }
  ]);

  assert.equal(
    findTerraformBlockForNode(blocks, makeNode("resource", "aws_ami", "ubuntu"))?.address,
    "aws_ami.ubuntu"
  );
  assert.equal(
    findTerraformBlockForNode(blocks, makeNode("data", "aws_ami", "ubuntu"))?.address,
    "data.aws_ami.ubuntu"
  );
});

test("createTerraformFilesFromGeneratedCode routes generated blocks to node file names", () => {
  const files = createTerraformFilesFromGeneratedCode(
    {
      nodes: [
        makeNode("resource", "aws_vpc", "main", "network"),
        makeNode("resource", "aws_subnet", "public", "subnets.tf")
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`
  );

  assert.deepEqual(
    files.map((file) => file.fileName),
    ["providers.tf", "main.tf", "network.tf", "subnets.tf"]
  );
  assert.match(
    files.find((file) => file.fileName === "providers.tf")?.code ?? "",
    /source\s*= "hashicorp\/aws"/
  );
  assert.equal(files.find((file) => file.fileName === "network.tf")?.code.includes("aws_vpc"), true);
  assert.equal(files.find((file) => file.fileName === "subnets.tf")?.code.includes("aws_subnet"), true);
});

test("createTerraformFilesFromGeneratedCode configures Kubernetes from the EKS cluster", () => {
  const diagram: DiagramJson = {
    nodes: [
      makeNode("resource", "aws_eks_cluster", "practice_cluster"),
      makeNode("resource", "kubernetes_namespace", "practice")
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const files = createTerraformFilesFromGeneratedCode(diagram, [
    'resource "aws_eks_cluster" "practice_cluster" {}',
    'resource "kubernetes_namespace" "practice" {}'
  ].join("\n\n"));
  const providerCode = files.find((file) => file.fileName === "providers.tf")?.code ?? "";

  assert.match(providerCode, /source\s*= "hashicorp\/kubernetes"/);
  assert.match(providerCode, /data "aws_eks_cluster_auth" "sketchcatch"/);
  assert.match(providerCode, /host\s*= aws_eks_cluster\.practice_cluster\.endpoint/);
  assert.match(providerCode, /token\s*= data\.aws_eks_cluster_auth\.sketchcatch\.token/);
});

test("createTerraformFilesFromGeneratedCode clears terraform code when the diagram has no resources", () => {
  const files = createTerraformFilesFromGeneratedCode(
    {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    ""
  );

  assert.deepEqual(files, [{ fileName: "main.tf", code: "" }]);
});

test("getDiagramTerraformAddresses returns resource and data addresses from diagram nodes", () => {
  const addresses = getDiagramTerraformAddresses({
    nodes: [
      makeNode("resource", "aws_instance", "web"),
      makeNode("data", "aws_ami", "ubuntu")
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(Array.from(addresses).sort(), ["aws_instance.web", "data.aws_ami.ubuntu"]);
});

test("removeTerraformBlocksByAddress removes only deleted diagram resource blocks", () => {
  const files = removeTerraformBlocksByAddress(
    [
      {
        fileName: "main.tf",
        code: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}

data "aws_ami" "ubuntu" {
  owners = ["099720109477"]
}`
      }
    ],
    ["aws_subnet.public"]
  );

  assert.equal(files[0]?.code.includes('resource "aws_vpc" "main"'), true);
  assert.equal(files[0]?.code.includes('resource "aws_subnet" "public"'), false);
  assert.equal(files[0]?.code.includes('data "aws_ami" "ubuntu"'), true);
  assert.doesNotMatch(files[0]?.code ?? "", /\n{3,}/);
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

test("diagram fingerprints ignore viewport-only changes", () => {
  const diagramJson: DiagramJson = {
    nodes: [makeNode("resource", "aws_vpc", "main")],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const pannedDiagramJson: DiagramJson = {
    ...diagramJson,
    viewport: { x: 240, y: -80, zoom: 0.75 }
  };

  assert.equal(toTerraformRefreshFingerprint(diagramJson), toTerraformRefreshFingerprint(pannedDiagramJson));
  assert.equal(toDeploymentBaselineFingerprint(diagramJson), toDeploymentBaselineFingerprint(pannedDiagramJson));
});

test("diagram fingerprints change when nodes or edges change", () => {
  const diagramJson: DiagramJson = {
    nodes: [makeNode("resource", "aws_vpc", "main")],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const movedDiagramJson: DiagramJson = {
    ...diagramJson,
    nodes: [
      {
        ...diagramJson.nodes[0]!,
        position: { x: 12, y: 0 }
      }
    ]
  };
  const connectedDiagramJson: DiagramJson = {
    ...diagramJson,
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "source",
        targetNodeId: "target"
      }
    ]
  };

  assert.notEqual(toTerraformRefreshFingerprint(diagramJson), toTerraformRefreshFingerprint(movedDiagramJson));
  assert.notEqual(toDeploymentBaselineFingerprint(diagramJson), toDeploymentBaselineFingerprint(connectedDiagramJson));
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
