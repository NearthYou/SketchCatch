import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { DiagramNode } from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

test("buildInfrastructureGraphFromDiagramJson projects renderable resource nodes", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
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
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes, [
    {
      id: "vpc-1",
      label: "main",
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
  ]);
});

test("buildInfrastructureGraphFromDiagramJson keeps provider-specific Terraform resource identity", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "instance-1",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "compute",
          values: {
            ami: "ami-1234567890abcdef0"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(graph.nodes[0]?.iac.provider, "aws");
  assert.equal(graph.nodes[0]?.iac.terraformBlockType, "resource");
  assert.equal(graph.nodes[0]?.iac.resourceType, "aws_instance");
  assert.ok(!("type" in (graph.nodes[0] ?? {})));
});

test("buildInfrastructureGraphFromDiagramJson keeps invalid nodes for preview skeleton stability", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          invalid: true,
          values: {
            cidrBlock: "10.0.1.0/24"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0]?.iac.resourceType, "aws_subnet");
});

test("buildInfrastructureGraphFromDiagramJson excludes design, parameterless, and unsupported nodes", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "memo-1",
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
        id: "unsupported-1",
        type: "aws_unknown_service",
        kind: "resource",
        label: "unknown",
        parameters: {
          resourceType: "aws_unknown_service",
          resourceName: "unknown",
          fileName: "main",
          values: {}
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes, []);
});

test("all shared Terraform resource definitions are supported by Terraform Preview", () => {
  assert.deepEqual(
    resourceDefinitions
      .filter((definition) => !definition.capabilities.terraformPreview)
      .map((definition) => `${definition.terraform.blockType}/${definition.terraform.resourceType}`),
    []
  );
});

test("buildInfrastructureGraphFromDiagramJson projects formerly unsupported catalog resources", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "cloudfront-1",
        type: "aws_cloudfront_distribution",
        kind: "resource",
        label: "cdn",
        parameters: {
          resourceType: "aws_cloudfront_distribution",
          resourceName: "cdn",
          fileName: "network",
          values: {}
        }
      }),
      makeNode({
        id: "lambda-1",
        type: "aws_lambda_function",
        kind: "resource",
        label: "handler",
        parameters: {
          resourceType: "aws_lambda_function",
          resourceName: "handler",
          fileName: "application",
          values: {}
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(
    graph.nodes.map((node) => node.iac.resourceType),
    ["aws_cloudfront_distribution", "aws_lambda_function"]
  );
});

test("buildInfrastructureGraphFromDiagramJson applies AZ area resource value to AZ-aware resource config", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "az-1",
        type: "aws_availability_zone",
        kind: "resource",
        label: "AZ",
        parameters: {
          resourceType: "aws_availability_zone",
          resourceName: "availability_zone",
          fileName: "main",
          values: {
            awsAvailabilityZone: "ap-northeast-2c"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "network",
          values: {
            cidrBlock: "10.0.1.0/24"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes[0]?.config, {
    cidrBlock: "10.0.1.0/24",
    availabilityZone: "ap-northeast-2c"
  });
});

test("buildInfrastructureGraphFromDiagramJson preserves explicit availabilityZone values over AZ area resources", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "az-1",
        type: "aws_availability_zone",
        kind: "resource",
        label: "AZ",
        parameters: {
          resourceType: "aws_availability_zone",
          resourceName: "availability_zone",
          fileName: "main",
          values: {
            awsAvailabilityZone: "ap-northeast-2c"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "network",
          values: {
            availabilityZone: "ap-northeast-2a",
            cidrBlock: "10.0.1.0/24"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes[0]?.config, {
    availabilityZone: "ap-northeast-2a",
    cidrBlock: "10.0.1.0/24"
  });
});

test("buildInfrastructureGraphFromDiagramJson keeps edges only between projected nodes", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {}
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "network",
          values: {}
        }
      }),
      makeNode({
        id: "unsupported-1",
        type: "aws_unknown_service",
        kind: "resource",
        label: "unknown",
        parameters: {
          resourceType: "aws_unknown_service",
          resourceName: "unknown",
          fileName: "main",
          values: {}
        }
      })
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "vpc-1",
        targetNodeId: "subnet-1",
        label: "contains"
      },
      {
        id: "edge-2",
        sourceNodeId: "vpc-1",
        targetNodeId: "unsupported-1"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.edges, [
    {
      id: "edge-1",
      sourceId: "vpc-1",
      targetId: "subnet-1",
      label: "contains"
    }
  ]);
});

test("Terraform preview support is read from shared resource definitions", () => {
  const infrastructureGraphSource = readTerraformServiceFile("infrastructure-graph.ts");
  const terraformSyncSource = readTerraformServiceFile("terraform-to-diagram.ts");

  assert.doesNotMatch(infrastructureGraphSource, /PREVIEW_SUPPORTED_BLOCKS/);
  assert.doesNotMatch(infrastructureGraphSource, /RESOURCE_TYPE_BY_TERRAFORM_TYPE/);
  assert.doesNotMatch(terraformSyncSource, /PROPOSAL_SUPPORTED_BLOCKS/);
  assert.doesNotMatch(infrastructureGraphSource, /resourceDefinition\.resourceType/);
  assert.match(infrastructureGraphSource, /getResourceDefinitionByTerraform/);
  assert.match(terraformSyncSource, /getResourceDefinitionByTerraform/);
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

function readTerraformServiceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
