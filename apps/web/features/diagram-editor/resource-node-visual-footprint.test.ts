import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramNode } from "../../../../packages/types/src";

import {
  getDiagramVisualBounds,
  getResourceNodeVisualBounds
} from "./resource-node-visual-footprint";

test("includes a bounded two-line caption below a 48px icon", () => {
  const bounds = getResourceNodeVisualBounds(
    makeResourceNode({ position: { x: 100, y: 80 }, size: { width: 48, height: 48 } })
  );

  assert.deepEqual(bounds, { x: 68, y: 80, width: 112, height: 82 });
});

test("preserves stored bounds for Area and icon-less Design nodes", () => {
  const area = makeResourceNode({
    resourceType: "aws_vpc",
    position: { x: 40, y: 20 },
    size: { width: 240, height: 160 }
  });
  const note: DiagramNode = {
    id: "note",
    kind: "design",
    label: "Note",
    locked: false,
    position: { x: 360, y: 70 },
    size: { width: 140, height: 100 },
    type: "design_note",
    zIndex: 1
  };

  assert.deepEqual(getResourceNodeVisualBounds(area), {
    x: 40,
    y: 20,
    width: 240,
    height: 160
  });
  assert.deepEqual(getResourceNodeVisualBounds(note), {
    x: 360,
    y: 70,
    width: 140,
    height: 100
  });
});

test("returns the union of icon captions and stored node bounds", () => {
  const icon = makeResourceNode({ position: { x: 100, y: 80 } });
  const note: DiagramNode = {
    id: "note",
    kind: "design",
    label: "Note",
    locked: false,
    position: { x: 220, y: 40 },
    size: { width: 100, height: 60 },
    type: "design_note",
    zIndex: 1
  };

  assert.deepEqual(getDiagramVisualBounds([icon, note]), {
    x: 68,
    y: 40,
    width: 252,
    height: 122
  });
  assert.deepEqual(getDiagramVisualBounds([]), { x: 0, y: 0, width: 1, height: 1 });
});

function makeResourceNode({
  position = { x: 0, y: 0 },
  resourceType = "aws_instance",
  size = { width: 48, height: 48 }
}: {
  position?: DiagramNode["position"];
  resourceType?: string;
  size?: DiagramNode["size"];
} = {}): DiagramNode {
  return {
    id: resourceType,
    kind: "resource",
    label: resourceType,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: "example",
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
