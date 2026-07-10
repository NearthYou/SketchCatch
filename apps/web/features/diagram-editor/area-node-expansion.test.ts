import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import { expandParentAreaNodesForChildren } from "./area-node-expansion";

test("expands a parent with half-child margins", () => {
  const parent = makeArea("vpc", undefined, { x: 100, y: 100 }, { width: 80, height: 60 });
  const child = makeIcon("ami", parent.id, { x: 95, y: 95 }, { width: 20, height: 20 });
  const result = expandParentAreaNodesForChildren([parent, child], new Set([child.id]));

  assert.deepEqual(getNode(result, parent.id)?.position, { x: 85, y: 85 });
  assert.deepEqual(getNode(result, parent.id)?.size, { width: 95, height: 75 });
  assert.deepEqual(getNode(result, child.id)?.position, child.position);
});

test("expands every nested parent inside out", () => {
  const region = makeArea("region", undefined, { x: 0, y: 0 }, { width: 100, height: 100 });
  const vpc = makeArea("vpc", region.id, { x: 70, y: 70 }, { width: 40, height: 40 });
  const child = makeIcon("ami", vpc.id, { x: 95, y: 95 }, { width: 20, height: 20 });
  const result = expandParentAreaNodesForChildren([region, vpc, child], new Set([child.id]));

  assert.deepEqual(getNode(result, vpc.id)?.size, { width: 55, height: 55 });
  assert.deepEqual(getNode(result, region.id)?.size, { width: 135, height: 135 });
});

test("stops safely for cyclic parents", () => {
  const a = makeArea("a", "b", { x: 0, y: 0 }, { width: 40, height: 40 });
  const b = makeArea("b", "a", { x: 0, y: 0 }, { width: 40, height: 40 });
  const child = makeIcon("ami", a.id, { x: 10, y: 10 }, { width: 20, height: 20 });

  assert.doesNotThrow(() => expandParentAreaNodesForChildren([a, b, child], new Set([child.id])));
});

test("stops safely for missing and non-area parents", () => {
  const missingParentChild = makeIcon(
    "missing-parent-child",
    "missing",
    { x: 95, y: 95 },
    { width: 20, height: 20 }
  );
  const region = makeArea("region", undefined, { x: 0, y: 0 }, { width: 40, height: 40 });
  const nonAreaParent = makeIcon("non-area-parent", region.id, { x: 10, y: 10 }, { width: 20, height: 20 });
  const child = makeIcon("child", nonAreaParent.id, { x: 95, y: 95 }, { width: 20, height: 20 });
  const nodes = [region, nonAreaParent, missingParentChild, child];

  assert.deepEqual(
    expandParentAreaNodesForChildren(
      nodes,
      new Set([missingParentChild.id, child.id])
    ),
    nodes
  );
});

test("does not shrink an area that already contains the child margin", () => {
  const parent = makeArea("vpc", undefined, { x: 0, y: 0 }, { width: 100, height: 80 });
  const child = makeIcon("ami", parent.id, { x: 40, y: 30 }, { width: 20, height: 20 });
  const result = expandParentAreaNodesForChildren([parent, child], new Set([child.id]));

  assert.deepEqual(getNode(result, parent.id), parent);
  assert.deepEqual(getNode(result, child.id), child);
});

function makeArea(
  id: string,
  parentAreaNodeId: string | undefined,
  position: DiagramNode["position"],
  size: DiagramNode["size"]
): DiagramNode {
  return {
    id,
    kind: "design",
    label: id,
    locked: false,
    ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {}),
    position,
    size,
    type: "design_group",
    zIndex: 0
  };
}

function makeIcon(
  id: string,
  parentAreaNodeId: string,
  position: DiagramNode["position"],
  size: DiagramNode["size"]
): DiagramNode {
  return {
    id,
    kind: "resource",
    label: "AMI",
    locked: false,
    metadata: { parentAreaNodeId },
    parameters: {
      fileName: "main",
      resourceName: "ami",
      resourceType: "aws_ami",
      terraformBlockType: "data",
      values: {}
    },
    position,
    size,
    type: "aws_ami",
    zIndex: 1
  };
}

function getNode(nodes: readonly DiagramNode[], id: string): DiagramNode | undefined {
  return nodes.find((node) => node.id === id);
}
