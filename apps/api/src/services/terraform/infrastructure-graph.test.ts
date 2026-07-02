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
