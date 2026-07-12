import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import { expandParentAreaNodesForEnteredChild } from "./area-node-expansion";

test("grows every parent by 1.5 times the entered child size while preserving parent centers", () => {
  const region = makeArea("region", undefined, { x: 0, y: 0 }, { width: 300, height: 220 });
  const vpc = makeArea("vpc", region.id, { x: 40, y: 40 }, { width: 180, height: 120 });
  const child = makeIcon("instance", vpc.id, { x: 80, y: 70 }, { width: 48, height: 48 });

  const result = expandParentAreaNodesForEnteredChild([region, vpc, child], child.id);

  assert.deepEqual(getNode(result, vpc.id)?.position, { x: 4, y: 4 });
  assert.deepEqual(getNode(result, vpc.id)?.size, { width: 252, height: 192 });
  assert.deepEqual(getNode(result, region.id)?.position, { x: -36, y: -36 });
  assert.deepEqual(getNode(result, region.id)?.size, { width: 372, height: 292 });
  assert.deepEqual(getNode(result, child.id)?.position, child.position);
});

test("grows parent and ancestor areas when the entered child is also an area", () => {
  const account = makeArea("account", undefined, { x: -100, y: -100 }, { width: 500, height: 400 });
  const region = makeArea("region", account.id, { x: 0, y: 0 }, { width: 300, height: 220 });
  const vpc = makeArea("vpc", region.id, { x: 80, y: 70 }, { width: 80, height: 60 });

  const result = expandParentAreaNodesForEnteredChild([account, region, vpc], vpc.id);

  assert.deepEqual(getNode(result, region.id)?.position, { x: -60, y: -45 });
  assert.deepEqual(getNode(result, region.id)?.size, { width: 420, height: 310 });
  assert.deepEqual(getNode(result, account.id)?.position, { x: -160, y: -145 });
  assert.deepEqual(getNode(result, account.id)?.size, { width: 620, height: 490 });
  assert.deepEqual(getNode(result, vpc.id), vpc);
});

test("stops safely for cyclic parents", () => {
  const a = makeArea("a", "b", { x: 0, y: 0 }, { width: 40, height: 40 });
  const b = makeArea("b", "a", { x: 0, y: 0 }, { width: 40, height: 40 });
  const child = makeIcon("ami", a.id, { x: 10, y: 10 }, { width: 20, height: 20 });

  assert.doesNotThrow(() => expandParentAreaNodesForEnteredChild([a, b, child], child.id));
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

  assert.deepEqual(
    expandParentAreaNodesForEnteredChild([missingParentChild], missingParentChild.id),
    [missingParentChild]
  );
  assert.deepEqual(
    expandParentAreaNodesForEnteredChild([region, nonAreaParent, child], child.id),
    [region, nonAreaParent, child]
  );
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
