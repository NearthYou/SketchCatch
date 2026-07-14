import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import { reconcileAreaNodeGeometry } from "./area-node-geometry";

test("reconcileAreaNodeGeometry stores the original geometry and expands only as needed", () => {
  const area = makeArea("area", undefined, { x: 0, y: 0 }, { width: 100, height: 100 });
  const child = makeResource("child", area.id, { x: 80, y: 70 }, { width: 40, height: 40 });

  const result = reconcileAreaNodeGeometry([area], [area, child], new Set([child.id]));
  const resultArea = getNode(result, area.id);

  assert.deepEqual(resultArea?.metadata?.areaAutoSizeBaseline, geometryOf(area));
  assert.deepEqual(geometryOf(resultArea), {
    position: { x: 0, y: 0 },
    size: { width: 132, height: 122 }
  });
});

test("reconcileAreaNodeGeometry shrinks to the remaining children without crossing the baseline", () => {
  const area = makeAreaWithBaseline(
    "area",
    undefined,
    { x: 0, y: 0 },
    { width: 152, height: 162 },
    { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }
  );
  const rightChild = makeResource("right", area.id, { x: 120, y: 20 }, { width: 20, height: 20 });
  const bottomChild = makeResource("bottom", area.id, { x: 20, y: 130 }, { width: 20, height: 20 });

  const result = reconcileAreaNodeGeometry(
    [area, rightChild, bottomChild],
    [area, bottomChild],
    new Set([rightChild.id])
  );

  assert.deepEqual(geometryOf(getNode(result, area.id)), {
    position: { x: 0, y: 0 },
    size: { width: 100, height: 162 }
  });
});

test("reconcileAreaNodeGeometry restores the baseline and removes it after the last child is deleted", () => {
  const area = makeAreaWithBaseline(
    "area",
    undefined,
    { x: 0, y: 0 },
    { width: 172, height: 172 },
    { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }
  );
  const child = makeResource("child", area.id, { x: 20, y: 20 }, { width: 48, height: 48 });

  const result = reconcileAreaNodeGeometry([area, child], [area], new Set([child.id]));
  const resultArea = getNode(result, area.id);

  assert.deepEqual(geometryOf(resultArea), {
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 }
  });
  assert.equal(resultArea?.metadata?.areaAutoSizeBaseline, undefined);
});

test("reconcileAreaNodeGeometry restores the old parent and initializes the new parent together", () => {
  const oldParent = makeAreaWithBaseline(
    "old-parent",
    undefined,
    { x: 0, y: 0 },
    { width: 132, height: 122 },
    { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }
  );
  const newParent = makeArea(
    "new-parent",
    undefined,
    { x: 300, y: 0 },
    { width: 100, height: 100 }
  );
  const beforeChild = makeResource(
    "child",
    oldParent.id,
    { x: 80, y: 70 },
    { width: 40, height: 40 }
  );
  const afterChild = {
    ...beforeChild,
    metadata: { parentAreaNodeId: newParent.id },
    position: { x: 320, y: 30 }
  };

  const result = reconcileAreaNodeGeometry(
    [oldParent, newParent, beforeChild],
    [oldParent, newParent, afterChild],
    new Set([beforeChild.id])
  );

  assert.deepEqual(geometryOf(getNode(result, oldParent.id)), {
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 }
  });
  assert.equal(getNode(result, oldParent.id)?.metadata?.areaAutoSizeBaseline, undefined);
  assert.deepEqual(getNode(result, newParent.id)?.metadata?.areaAutoSizeBaseline, {
    position: { x: 300, y: 0 },
    size: { width: 100, height: 100 }
  });
});

test("reconcileAreaNodeGeometry recalculates nested areas from the inside out", () => {
  const outer = makeArea("outer", undefined, { x: 0, y: 0 }, { width: 180, height: 130 });
  const inner = makeArea("inner", outer.id, { x: 100, y: 80 }, { width: 80, height: 60 });
  const child = makeResource("child", inner.id, { x: 160, y: 120 }, { width: 40, height: 40 });

  const result = reconcileAreaNodeGeometry([outer, inner], [outer, inner, child], new Set([child.id]));

  assert.deepEqual(geometryOf(getNode(result, inner.id)), {
    position: { x: 100, y: 80 },
    size: { width: 112, height: 92 }
  });
  assert.deepEqual(geometryOf(getNode(result, outer.id)), {
    position: { x: 0, y: 0 },
    size: { width: 224, height: 184 }
  });
});

test("reconcileAreaNodeGeometry treats a completed manual resize as the new baseline", () => {
  const before = makeAreaWithBaseline(
    "area",
    undefined,
    { x: 0, y: 0 },
    { width: 132, height: 122 },
    { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }
  );
  const resized = { ...before, size: { width: 120, height: 110 } };
  const child = makeResource("child", before.id, { x: 80, y: 70 }, { width: 40, height: 40 });

  const result = reconcileAreaNodeGeometry(
    [before, child],
    [resized, child],
    new Set([before.id])
  );
  const resultArea = getNode(result, before.id);

  assert.deepEqual(resultArea?.metadata?.areaAutoSizeBaseline, {
    position: { x: 0, y: 0 },
    size: { width: 120, height: 110 }
  });
  assert.deepEqual(geometryOf(resultArea), {
    position: { x: 0, y: 0 },
    size: { width: 132, height: 122 }
  });
});

test("reconcileAreaNodeGeometry translates the baseline when an area moves", () => {
  const before = makeAreaWithBaseline(
    "area",
    undefined,
    { x: 0, y: 0 },
    { width: 132, height: 122 },
    { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }
  );
  const beforeChild = makeResource("child", before.id, { x: 80, y: 70 }, { width: 40, height: 40 });
  const moved = { ...before, position: { x: 50, y: 30 } };
  const movedChild = { ...beforeChild, position: { x: 130, y: 100 } };

  const result = reconcileAreaNodeGeometry(
    [before, beforeChild],
    [moved, movedChild],
    new Set([before.id, beforeChild.id])
  );
  const resultArea = getNode(result, before.id);

  assert.deepEqual(resultArea?.metadata?.areaAutoSizeBaseline, {
    position: { x: 50, y: 30 },
    size: { width: 100, height: 100 }
  });
  assert.deepEqual(geometryOf(resultArea), {
    position: { x: 50, y: 30 },
    size: { width: 132, height: 122 }
  });
});

test("reconcileAreaNodeGeometry preserves legacy geometry and stops safely on parent cycles", () => {
  const areaA = makeArea("a", "b", { x: 0, y: 0 }, { width: 100, height: 100 });
  const areaB = makeArea("b", "a", { x: 0, y: 0 }, { width: 100, height: 100 });
  const child = makeResource("child", areaA.id, { x: 20, y: 30 }, { width: 20, height: 20 });

  assert.doesNotThrow(() =>
    reconcileAreaNodeGeometry([areaA, areaB], [areaA, areaB, child], new Set([child.id]))
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

function makeAreaWithBaseline(
  id: string,
  parentAreaNodeId: string | undefined,
  position: DiagramNode["position"],
  size: DiagramNode["size"],
  areaAutoSizeBaseline: NonNullable<DiagramNode["metadata"]>["areaAutoSizeBaseline"]
): DiagramNode {
  return {
    ...makeArea(id, parentAreaNodeId, position, size),
    metadata: {
      ...(parentAreaNodeId ? { parentAreaNodeId } : {}),
      areaAutoSizeBaseline
    }
  };
}

function makeResource(
  id: string,
  parentAreaNodeId: string,
  position: DiagramNode["position"],
  size: DiagramNode["size"]
): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    metadata: { parentAreaNodeId },
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType: "aws_instance",
      terraformBlockType: "resource",
      values: {}
    },
    position,
    size,
    type: "aws_instance",
    zIndex: 1
  };
}

function getNode(nodes: readonly DiagramNode[], id: string): DiagramNode | undefined {
  return nodes.find((node) => node.id === id);
}

function geometryOf(node: DiagramNode | undefined) {
  return node ? { position: node.position, size: node.size } : undefined;
}
