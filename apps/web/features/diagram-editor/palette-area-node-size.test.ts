import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResourceItem } from "../../../../packages/types/src";
import { resourceCatalog } from "../resource-settings/catalog";
import { createDiagramNodeFromPayload } from "./diagram-utils";
import { scalePaletteAreaNodeSize } from "./palette-area-node-size";

const AREA_EXPECTATIONS = [
  ["aws-region", { width: 260, height: 180 }, { width: 520, height: 360 }],
  ["aws-vpc", { width: 240, height: 160 }, { width: 480, height: 320 }],
  ["aws-availability-zone", { width: 220, height: 150 }, { width: 440, height: 300 }],
  ["design-group", { width: 200, height: 130 }, { width: 400, height: 260 }],
  ["aws-subnet", { width: 180, height: 120 }, { width: 360, height: 240 }],
  ["aws-security-group", { width: 180, height: 120 }, { width: 360, height: 240 }]
] as const;

test("doubles every palette Area node without mutating its Catalog default", () => {
  for (const [itemId, catalogSize, expectedSize] of AREA_EXPECTATIONS) {
    const item = requireCatalogItem(itemId);
    const node = createDiagramNodeFromPayload(
      { source: "resource-settings-panel", item },
      { x: 0, y: 0 },
      1
    );
    const originalSize = node.size;

    const scaledNode = scalePaletteAreaNodeSize(node);

    assert.deepEqual(originalSize, catalogSize);
    assert.deepEqual(node.size, catalogSize);
    assert.deepEqual(scaledNode.size, expectedSize);
    assert.notEqual(scaledNode, node);
    assert.notEqual(scaledNode.size, originalSize);
    assert.deepEqual(item.nodeDefaults.size, catalogSize);
  }
});

test("keeps regular palette resources at their original size", () => {
  for (const itemId of ["aws-ec2-instance", "aws-autoscaling-group"]) {
    const item = requireCatalogItem(itemId);
    const node = createDiagramNodeFromPayload(
      { source: "resource-settings-panel", item },
      { x: 0, y: 0 },
      1
    );

    assert.equal(scalePaletteAreaNodeSize(node), node);
    assert.deepEqual(node.size, { width: 48, height: 48 });
  }
});

function requireCatalogItem(itemId: string): ResourceItem {
  const item = resourceCatalog.find((candidate) => candidate.id === itemId);
  assert.ok(item, `Missing resource catalog item: ${itemId}`);
  return item;
}
