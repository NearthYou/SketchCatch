import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { DiagramNode } from "@sketchcatch/types";
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
      type: "VPC",
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
        type: "aws_lambda_function",
        kind: "resource",
        label: "lambda",
        parameters: {
          resourceType: "aws_lambda_function",
          resourceName: "handler",
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

test("buildInfrastructureGraphFromDiagramJson excludes resources without terraformPreview capability", () => {
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
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes, []);
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
        type: "aws_lambda_function",
        kind: "resource",
        label: "lambda",
        parameters: {
          resourceType: "aws_lambda_function",
          resourceName: "handler",
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
