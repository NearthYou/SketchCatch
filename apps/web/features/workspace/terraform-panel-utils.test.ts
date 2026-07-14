import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  createTerraformFilesFromGeneratedCode,
  mergeGeneratedTerraformFiles,
  findTerraformBlockForNode,
  getDiagramTerraformAddresses,
  getTerraformAddressesRemovedFromDiagram,
  getTerraformFileOptions,
  parseTerraformFiles,
  removeTerraformBlocksByAddress,
  toDeploymentBaselineFingerprint,
  toTerraformRefreshFingerprint
} from "./terraform-panel-utils";

test("mergeGeneratedTerraformFiles preserves an exact top-level variable block", () => {
  const variableBlock = `variable "traffic_api_bundle_url" {
  description = "Traffic API 배포 번들의 HTTPS URL"
  type        = string
}`;
  const result = mergeGeneratedTerraformFiles(
    [{ fileName: "variables.tf", code: variableBlock }],
    [{ fileName: "main.tf", code: `resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}` }],
    new Set()
  );

  assert.equal(result.find((file) => file.fileName === "variables.tf")?.code, variableBlock);
  assert.match(result.find((file) => file.fileName === "main.tf")?.code ?? "", /aws_vpc/);
});

test("mergeGeneratedTerraformFiles removes a managed Subnet absent from generated Diagram code", () => {
  const result = mergeGeneratedTerraformFiles(
    [{
      fileName: "main.tf",
      code: `resource "aws_subnet" "subnet_A" {\n  cidr_block = "10.0.1.0/24"\n}`
    }],
    [{ fileName: "main.tf", code: "" }],
    new Set()
  );

  assert.doesNotMatch(result.find((file) => file.fileName === "main.tf")?.code ?? "", /aws_subnet/);
});

test("mergeGeneratedTerraformFiles keeps an opaque resource absent from generated Diagram code", () => {
  const opaqueCode = `resource "aws_custom_service" "opaque" {\n  dynamic "rule" {}\n}`;
  const result = mergeGeneratedTerraformFiles(
    [{ fileName: "custom.tf", code: opaqueCode }],
    [{ fileName: "main.tf", code: "" }],
    new Set(["aws_custom_service.opaque"])
  );

  assert.equal(result.find((file) => file.fileName === "custom.tf")?.code, opaqueCode);
});

test("getTerraformAddressesRemovedFromDiagram excludes opaque preserved addresses", () => {
  assert.deepEqual(getTerraformAddressesRemovedFromDiagram(
    new Set(["aws_subnet.subnet_A", "aws_custom_service.opaque"]),
    new Set(),
    new Set(["aws_custom_service.opaque"])
  ), ["aws_subnet.subnet_A"]);
});

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

test("findTerraformBlockForNode uses the resource name when same-type nodes share a label", () => {
  const blocks = parseTerraformFiles([
    {
      fileName: "main.tf",
      code: `resource "aws_security_group" "security_group" {
}

resource "aws_security_group" "ec2_security_group" {
}`
    }
  ]);
  const ec2SecurityGroup: DiagramNode = {
    ...makeNode("resource", "aws_security_group", "ec2_security_group"),
    label: "SECURITY GROUP"
  };

  assert.equal(
    findTerraformBlockForNode(blocks, ec2SecurityGroup)?.address,
    "aws_security_group.ec2_security_group"
  );
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

test("createTerraformFilesFromGeneratedCode keeps generated outputs in main.tf", () => {
  const files = createTerraformFilesFromGeneratedCode(
    {
      nodes: [makeNode("resource", "aws_lb", "api")],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    `resource "aws_lb" "api" {
  name = "api"
}

output "api_base_url" {
  value = "http://\${aws_lb.api.dns_name}"
}`
  );

  assert.match(
    files.find((file) => file.fileName === "main.tf")?.code ?? "",
    /output "api_base_url"[\s\S]*aws_lb\.api\.dns_name/
  );
});

test("mergeGeneratedTerraformFiles updates generated outputs by name", () => {
  const result = mergeGeneratedTerraformFiles(
    [{ fileName: "main.tf", code: `output "api_base_url" {\n  value = "old"\n}` }],
    [{ fileName: "main.tf", code: `output "api_base_url" {\n  value = "new"\n}` }],
    new Set()
  );
  const mainCode = result.find((file) => file.fileName === "main.tf")?.code ?? "";

  assert.match(mainCode, /value = "new"/);
  assert.doesNotMatch(mainCode, /value = "old"/);
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

test("diagram fingerprints ignore presentation-only node and edge edits", () => {
  const vpc = makeNode("resource", "aws_vpc", "main");
  const region: DiagramNode = {
    id: "design-region",
    type: "aws_region",
    kind: "design",
    label: "Region",
    position: { x: 0, y: 0 },
    size: { width: 640, height: 480 },
    locked: false,
    zIndex: 0
  };
  const diagramJson: DiagramJson = {
    nodes: [region, vpc],
    edges: [
      {
        id: "presentation-region-vpc",
        label: "contains",
        sourceNodeId: region.id,
        targetNodeId: vpc.id
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const presentationEditedDiagramJson: DiagramJson = {
    ...diagramJson,
    nodes: [
      {
        ...region,
        label: "Seoul Region",
        position: { x: 240, y: 160 },
        size: { width: 720, height: 560 }
      },
      {
        ...vpc,
        label: "Production VPC",
        position: { x: 320, y: 240 },
        style: { borderColor: "#ff9900" },
        parameters: {
          ...vpc.parameters!,
          values: { diagramLabel: "Production VPC" }
        }
      }
    ],
    edges: [
      {
        ...diagramJson.edges[0]!,
        sourceHandleId: "handle-right",
        style: { lineStyle: "dashed" }
      }
    ]
  };

  assert.equal(
    toTerraformRefreshFingerprint(diagramJson),
    toTerraformRefreshFingerprint(presentationEditedDiagramJson)
  );
  assert.equal(
    toDeploymentBaselineFingerprint(diagramJson),
    toDeploymentBaselineFingerprint(presentationEditedDiagramJson)
  );
});

test("diagram fingerprints change when a Design AZ value changes inherited Terraform", () => {
  const designAz = makeDesignAvailabilityZone("design-az-a", "ap-northeast-2a");
  const subnet = {
    ...makeNode("resource", "aws_subnet", "public"),
    metadata: { parentAreaNodeId: designAz.id }
  };
  const diagramJson: DiagramJson = {
    nodes: [designAz, subnet],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const changedAvailabilityZoneDiagramJson: DiagramJson = {
    ...diagramJson,
    nodes: [
      {
        ...designAz,
        parameters: {
          ...designAz.parameters!,
          values: { awsAvailabilityZone: "ap-northeast-2b" }
        }
      },
      subnet
    ]
  };

  assert.notEqual(
    toTerraformRefreshFingerprint(diagramJson),
    toTerraformRefreshFingerprint(changedAvailabilityZoneDiagramJson)
  );
  assert.notEqual(
    toDeploymentBaselineFingerprint(diagramJson),
    toDeploymentBaselineFingerprint(changedAvailabilityZoneDiagramJson)
  );
});

test("diagram fingerprints change when a deployable child moves between Design AZs", () => {
  const designAzA = makeDesignAvailabilityZone("design-az-a", "ap-northeast-2a");
  const designAzB = makeDesignAvailabilityZone("design-az-b", "ap-northeast-2b");
  const subnet = {
    ...makeNode("resource", "aws_subnet", "public"),
    metadata: { parentAreaNodeId: designAzA.id }
  };
  const diagramJson: DiagramJson = {
    nodes: [designAzA, designAzB, subnet],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const movedDiagramJson: DiagramJson = {
    ...diagramJson,
    nodes: [
      designAzA,
      designAzB,
      { ...subnet, metadata: { parentAreaNodeId: designAzB.id } }
    ]
  };

  assert.notEqual(
    toTerraformRefreshFingerprint(diagramJson),
    toTerraformRefreshFingerprint(movedDiagramJson)
  );
  assert.notEqual(
    toDeploymentBaselineFingerprint(diagramJson),
    toDeploymentBaselineFingerprint(movedDiagramJson)
  );
});

test("diagram fingerprints change when Terraform identity or values change", () => {
  const diagramJson: DiagramJson = {
    nodes: [makeNode("resource", "aws_vpc", "main")],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const renamedDiagramJson: DiagramJson = {
    ...diagramJson,
    nodes: [{
      ...diagramJson.nodes[0]!,
      parameters: {
        ...diagramJson.nodes[0]!.parameters!,
        resourceName: "production"
      }
    }]
  };
  const valueChangedDiagramJson: DiagramJson = {
    ...diagramJson,
    nodes: [{
      ...diagramJson.nodes[0]!,
      parameters: {
        ...diagramJson.nodes[0]!.parameters!,
        values: { cidrBlock: "10.42.0.0/16" }
      }
    }]
  };

  assert.notEqual(
    toTerraformRefreshFingerprint(diagramJson),
    toTerraformRefreshFingerprint(renamedDiagramJson)
  );
  assert.notEqual(
    toDeploymentBaselineFingerprint(diagramJson),
    toDeploymentBaselineFingerprint(valueChangedDiagramJson)
  );
});

test("diagram fingerprints change when a deployable relationship changes", () => {
  const vpc = makeNode("resource", "aws_vpc", "main");
  const subnet = makeNode("resource", "aws_subnet", "public");
  const diagramJson: DiagramJson = {
    nodes: [vpc, subnet],
    edges: [{ id: "vpc-subnet", label: "contains", sourceNodeId: vpc.id, targetNodeId: subnet.id }],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const relationshipChangedDiagramJson: DiagramJson = {
    ...diagramJson,
    edges: [{ ...diagramJson.edges[0]!, label: "routes" }]
  };

  assert.notEqual(
    toTerraformRefreshFingerprint(diagramJson),
    toTerraformRefreshFingerprint(relationshipChangedDiagramJson)
  );
  assert.notEqual(
    toDeploymentBaselineFingerprint(diagramJson),
    toDeploymentBaselineFingerprint(relationshipChangedDiagramJson)
  );
});

// Design AZ fixtures model the generator's one intentional presentation-to-Terraform context edge.
function makeDesignAvailabilityZone(id: string, availabilityZone: string): DiagramNode {
  return {
    id,
    type: "aws_availability_zone",
    kind: "design",
    label: availabilityZone,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 240 },
    locked: false,
    zIndex: 0,
    parameters: {
      terraformBlockType: "resource",
      resourceType: "aws_availability_zone",
      resourceName: id,
      fileName: "main.tf",
      values: { awsAvailabilityZone: availabilityZone }
    }
  };
}

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
