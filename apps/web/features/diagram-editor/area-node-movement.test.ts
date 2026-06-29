import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import { applyAreaNodeMovement } from "./area-node-movement";

test("applyAreaNodeMovement moves nodes contained in a moved area by the same delta", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 80, y: 70 },
    size: { width: 96, height: 72 }
  });
  const movedRegion = moveNode(region, { x: 40, y: 25 });

  const result = applyAreaNodeMovement([region, instance], [movedRegion, instance], new Set([region.id]));

  assert.deepEqual(getNodePosition(result, instance.id), { x: 120, y: 95 });
});

test("applyAreaNodeMovement leaves nodes outside the moved area unchanged", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 300, height: 220 }
  });
  const bucket = makeResourceNode({
    id: "bucket-1",
    resourceType: "aws_s3_bucket",
    position: { x: 420, y: 320 },
    size: { width: 96, height: 72 }
  });
  const movedRegion = moveNode(region, { x: 40, y: 25 });

  const result = applyAreaNodeMovement([region, bucket], [movedRegion, bucket], new Set([region.id]));

  assert.deepEqual(getNodePosition(result, bucket.id), bucket.position);
});

test("applyAreaNodeMovement uses the innermost moved area without applying nested deltas twice", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 400 },
    zIndex: 1
  });
  const availabilityZone = makeDesignNode({
    id: "az-1",
    type: "design_az",
    position: { x: 80, y: 70 },
    size: { width: 280, height: 220 },
    zIndex: 2
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 140, y: 130 },
    size: { width: 96, height: 72 }
  });
  const movedRegion = moveNode(region, { x: 20, y: 10 });
  const movedAvailabilityZone = moveNode(availabilityZone, { x: 100, y: 80 });

  const result = applyAreaNodeMovement(
    [region, availabilityZone, instance],
    [movedRegion, movedAvailabilityZone, instance],
    new Set([region.id, availabilityZone.id])
  );

  assert.deepEqual(getNodePosition(result, instance.id), { x: 160, y: 140 });
});

test("applyAreaNodeMovement keeps directly moved child positions instead of adding the area delta", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 80, y: 70 },
    size: { width: 96, height: 72 }
  });
  const movedRegion = moveNode(region, { x: 40, y: 25 });
  const movedInstance = moveNode(instance, { x: 200, y: 180 });

  const result = applyAreaNodeMovement(
    [region, instance],
    [movedRegion, movedInstance],
    new Set([region.id, instance.id])
  );

  assert.deepEqual(getNodePosition(result, instance.id), movedInstance.position);
});

function makeDesignNode({
  id,
  position,
  size,
  type,
  zIndex = 1
}: {
  id: string;
  position: DiagramNode["position"];
  size: DiagramNode["size"];
  type: string;
  zIndex?: number;
}): DiagramNode {
  return {
    id,
    type,
    kind: "design",
    position,
    size,
    label: type,
    locked: false,
    zIndex
  };
}

function makeResourceNode({
  id,
  position,
  resourceType,
  size,
  zIndex = 1
}: {
  id: string;
  position: DiagramNode["position"];
  resourceType: string;
  size: DiagramNode["size"];
  zIndex?: number;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position,
    size,
    label: resourceType,
    locked: false,
    zIndex,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: resourceType.replace("aws_", ""),
      fileName: "main",
      values: {}
    }
  };
}

function moveNode(node: DiagramNode, position: DiagramNode["position"]): DiagramNode {
  return {
    ...node,
    position
  };
}

function getNodePosition(nodes: readonly DiagramNode[], nodeId: string): DiagramNode["position"] | undefined {
  return nodes.find((node) => node.id === nodeId)?.position;
}
