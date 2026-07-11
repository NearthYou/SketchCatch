import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";

import {
  RESOURCE_NODE_DEFAULT_SIZE,
  normalizeDiagramResourceNodeGeometry
} from "./resource-node-geometry";

test("preserves the current 48px icon geometry without widening it", () => {
  const diagram = makeDiagram(makeResourceNode({
    position: { x: 100, y: 80 },
    size: { width: 48, height: 48 }
  }));

  const result = normalizeDiagramResourceNodeGeometry(diagram);

  assert.deepEqual(result.nodes[0]?.size, RESOURCE_NODE_DEFAULT_SIZE);
  assert.deepEqual(result.nodes[0]?.position, { x: 100, y: 80 });
  assert.deepEqual(result.edges, diagram.edges);
  assert.deepEqual(diagram.nodes[0]?.size, { width: 48, height: 48 });
});

test("normalizes a 56px legacy icon to 48px around its original center", () => {
  const result = normalizeDiagramResourceNodeGeometry(
    makeDiagram(makeResourceNode({
      position: { x: 100, y: 80 },
      size: { width: 56, height: 56 }
    }))
  );

  assert.deepEqual(result.nodes[0]?.size, RESOURCE_NODE_DEFAULT_SIZE);
  assert.deepEqual(result.nodes[0]?.position, { x: 104, y: 84 });
});

test("preserves custom compact nodes and area geometry", () => {
  const compact = makeResourceNode({ id: "compact", size: { width: 80, height: 80 } });
  const area = makeResourceNode({
    id: "vpc",
    resourceType: "aws_vpc",
    size: { width: 240, height: 160 }
  });
  const result = normalizeDiagramResourceNodeGeometry(makeDiagram(compact, area));

  assert.deepEqual(result.nodes[0], compact);
  assert.deepEqual(result.nodes[1], area);
});

test("raises undersized custom resources only to the 28px resize minimum", () => {
  const result = normalizeDiagramResourceNodeGeometry(
    makeDiagram(makeResourceNode({
      position: { x: 100, y: 80 },
      size: { width: 20, height: 30 }
    }))
  );

  assert.deepEqual(result.nodes[0]?.size, { width: 28, height: 30 });
  assert.deepEqual(result.nodes[0]?.position, { x: 96, y: 80 });
});

function makeDiagram(...nodes: DiagramNode[]): DiagramJson {
  return {
    nodes,
    edges: nodes.length > 1
      ? [{ id: "edge", sourceNodeId: nodes[0]?.id ?? "", targetNodeId: nodes[1]?.id ?? "" }]
      : [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function makeResourceNode({
  id = "instance",
  position = { x: 0, y: 0 },
  resourceType = "aws_instance",
  size = { width: 48, height: 48 }
}: {
  id?: string;
  position?: DiagramNode["position"];
  resourceType?: string;
  size?: DiagramNode["size"];
} = {}): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType,
      terraformBlockType: "resource",
      values: {}
    },
    position,
    size,
    type: resourceType,
    zIndex: 1
  };
}
