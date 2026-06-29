import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  clearDeletedAreaParentAssignments,
  applyAreaNodeMovement,
  applyAreaNodeParentAssignments
} from "./area-node-movement";

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
    size: { width: 96, height: 72 },
    parentAreaNodeId: region.id
  });
  const movedRegion = moveNode(region, { x: 40, y: 25 });

  const result = applyAreaNodeMovement([region, instance], [movedRegion, instance], new Set([region.id]));

  assert.deepEqual(getNodePosition(result, instance.id), { x: 120, y: 95 });
});

test("applyAreaNodeMovement does not adopt a resource just because an area was moved over it", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 300, y: 200 },
    size: { width: 300, height: 220 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 360, y: 260 },
    size: { width: 96, height: 72 }
  });
  const movedRegion = moveNode(region, { x: 340, y: 225 });

  const result = applyAreaNodeMovement([region, instance], [movedRegion, instance], new Set([region.id]));

  assert.deepEqual(getNodePosition(result, instance.id), instance.position);
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
    parentAreaNodeId: region.id,
    type: "design_az",
    position: { x: 80, y: 70 },
    size: { width: 280, height: 220 },
    zIndex: 2
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 140, y: 130 },
    size: { width: 96, height: 72 },
    parentAreaNodeId: availabilityZone.id
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

test("applyAreaNodeMovement moves descendants through the parent area chain", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 400 },
    zIndex: 1
  });
  const availabilityZone = makeDesignNode({
    id: "az-1",
    parentAreaNodeId: region.id,
    type: "design_az",
    position: { x: 80, y: 70 },
    size: { width: 280, height: 220 },
    zIndex: 2
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 140, y: 130 },
    size: { width: 96, height: 72 },
    parentAreaNodeId: availabilityZone.id
  });
  const movedRegion = moveNode(region, { x: 30, y: 20 });

  const result = applyAreaNodeMovement(
    [region, availabilityZone, instance],
    [movedRegion, availabilityZone, instance],
    new Set([region.id])
  );

  assert.deepEqual(getNodePosition(result, availabilityZone.id), { x: 110, y: 90 });
  assert.deepEqual(getNodePosition(result, instance.id), { x: 170, y: 150 });
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
    size: { width: 96, height: 72 },
    parentAreaNodeId: region.id
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

test("applyAreaNodeMovement does not move an overlapping parent area when a nested area moves", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 }
  });
  const availabilityZone = makeDesignNode({
    id: "az-1",
    parentAreaNodeId: region.id,
    type: "design_az",
    position: { x: 100, y: 80 },
    size: { width: 220, height: 160 },
    zIndex: 2
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 150, y: 120 },
    size: { width: 96, height: 72 },
    parentAreaNodeId: availabilityZone.id
  });
  const movedAvailabilityZone = moveNode(availabilityZone, { x: 130, y: 100 });

  const result = applyAreaNodeMovement(
    [region, availabilityZone, instance],
    [region, movedAvailabilityZone, instance],
    new Set([availabilityZone.id])
  );

  assert.deepEqual(getNodePosition(result, region.id), region.position);
  assert.deepEqual(getNodePosition(result, instance.id), { x: 180, y: 140 });
});

test("applyAreaNodeParentAssignments assigns a parent only to directly moved nodes", () => {
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

  const result = applyAreaNodeParentAssignments([region, instance], new Set([instance.id]));

  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, region.id);
});

test("applyAreaNodeParentAssignments does not assign stationary nodes to a moved area", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 300, y: 200 },
    size: { width: 300, height: 220 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 360, y: 260 },
    size: { width: 96, height: 72 }
  });

  const result = applyAreaNodeParentAssignments([region, instance], new Set([region.id]));

  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, undefined);
});

test("clearDeletedAreaParentAssignments removes only deleted direct parent references", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 400 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_subnet",
    position: { x: 80, y: 70 },
    size: { width: 300, height: 220 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    parentAreaNodeId: subnet.id,
    resourceType: "aws_instance",
    position: { x: 140, y: 130 },
    size: { width: 96, height: 72 }
  });

  const result = clearDeletedAreaParentAssignments([subnet, instance], new Set([region.id]));

  assert.equal(getNodeById(result, subnet.id)?.metadata?.parentAreaNodeId, undefined);
  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, subnet.id);
});

test("clearDeletedAreaParentAssignments preserves unrelated metadata when clearing parent", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 400 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_instance",
    position: { x: 140, y: 130 },
    size: { width: 96, height: 72 }
  });
  const nodeWithRegion = {
    ...instance,
    metadata: {
      ...instance.metadata,
      awsRegion: "ap-northeast-2" as const
    }
  };

  const result = clearDeletedAreaParentAssignments([nodeWithRegion], new Set([region.id]));

  assert.deepEqual(getNodeById(result, instance.id)?.metadata, { awsRegion: "ap-northeast-2" });
});

function makeDesignNode({
  id,
  parentAreaNodeId,
  position,
  size,
  type,
  zIndex = 1
}: {
  id: string;
  parentAreaNodeId?: string;
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
    ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {}),
    zIndex
  };
}

function makeResourceNode({
  id,
  parentAreaNodeId,
  position,
  resourceType,
  size,
  zIndex = 1
}: {
  id: string;
  parentAreaNodeId?: string;
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
    ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {}),
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

function getNodeById(nodes: readonly DiagramNode[], nodeId: string): DiagramNode | undefined {
  return nodes.find((node) => node.id === nodeId);
}
