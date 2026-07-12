import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  clearDeletedAreaParentAssignments,
  clearOutOfBoundsAreaParentAssignments,
  applyAreaNodeMovement,
  applyAreaNodeParentAssignments,
  getDirectlyMovedNodeIdsFromPositionMap,
  placeDroppedNodeInsideArea
} from "./area-node-movement";
import { calculateNodeResize } from "./node-resize";

test("placeDroppedNodeInsideArea keeps a dropped Subnet fully inside its VPC", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    position: { x: 600, y: 504 },
    resourceType: "aws_vpc",
    size: { width: 240, height: 160 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    position: { x: 720, y: 588 },
    resourceType: "aws_subnet",
    size: { width: 180, height: 120 }
  });

  const placedSubnet = placeDroppedNodeInsideArea([vpc], subnet, { x: 720, y: 588 });

  assert.deepEqual(placedSubnet.position, { x: 648, y: 532 });
  assert.ok(placedSubnet.position.x + placedSubnet.size.width <= vpc.position.x + vpc.size.width);
  assert.ok(placedSubnet.position.y + placedSubnet.size.height <= vpc.position.y + vpc.size.height);
});

test("placeDroppedNodeInsideArea leaves a Resource unchanged when no Area contains the drop", () => {
  const instance = makeResourceNode({
    id: "instance-1",
    position: { x: 420, y: 340 },
    resourceType: "aws_instance",
    size: { width: 56, height: 56 }
  });

  assert.strictEqual(placeDroppedNodeInsideArea([], instance, instance.position), instance);
});

test("placeDroppedNodeInsideArea does not force a child into an Area that is too small", () => {
  const subnet = makeResourceNode({
    id: "subnet-1",
    position: { x: 100, y: 100 },
    resourceType: "aws_subnet",
    size: { width: 180, height: 120 }
  });
  const vpc = makeResourceNode({
    id: "vpc-1",
    position: { x: 120, y: 120 },
    resourceType: "aws_vpc",
    size: { width: 240, height: 160 }
  });

  assert.strictEqual(placeDroppedNodeInsideArea([subnet], vpc, { x: 140, y: 140 }), vpc);
});

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

test("applyAreaNodeMovement moves nodes contained in a moved ASG area by the same delta", () => {
  const autoscalingGroup = makeResourceNode({
    id: "asg-1",
    resourceType: "aws_autoscaling_group",
    position: { x: 0, y: 0 },
    size: { width: 200, height: 130 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 56, y: 48 },
    size: { width: 56, height: 56 },
    parentAreaNodeId: autoscalingGroup.id
  });
  const movedAutoscalingGroup = moveNode(autoscalingGroup, { x: 36, y: 24 });

  const result = applyAreaNodeMovement(
    [autoscalingGroup, instance],
    [movedAutoscalingGroup, instance],
    new Set([autoscalingGroup.id])
  );

  assert.deepEqual(getNodePosition(result, instance.id), { x: 92, y: 72 });
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

test("getDirectlyMovedNodeIdsFromPositionMap ignores parent position changes outside direct drag candidates", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_subnet",
    position: { x: 80, y: 70 },
    size: { width: 280, height: 220 }
  });
  const positionByNodeId = new Map([
    [region.id, { x: 20, y: 20 }],
    [subnet.id, { x: 120, y: 110 }]
  ]);

  const result = getDirectlyMovedNodeIdsFromPositionMap(
    [region, subnet],
    positionByNodeId,
    new Set([subnet.id])
  );

  assert.deepEqual([...result], [subnet.id]);
});

test("getDirectlyMovedNodeIdsFromPositionMap falls back to all moved positions without candidates", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_subnet",
    position: { x: 80, y: 70 },
    size: { width: 280, height: 220 }
  });
  const positionByNodeId = new Map([
    [region.id, { x: 20, y: 20 }],
    [subnet.id, { x: 120, y: 110 }]
  ]);

  const result = getDirectlyMovedNodeIdsFromPositionMap([region, subnet], positionByNodeId);

  assert.deepEqual([...result], [region.id, subnet.id]);
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

test("applyAreaNodeParentAssignments assigns a moved child to an ASG area", () => {
  const autoscalingGroup = makeResourceNode({
    id: "asg-1",
    resourceType: "aws_autoscaling_group",
    position: { x: 0, y: 0 },
    size: { width: 200, height: 130 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 64, y: 36 },
    size: { width: 56, height: 56 }
  });

  const result = applyAreaNodeParentAssignments([autoscalingGroup, instance], new Set([instance.id]));

  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, autoscalingGroup.id);
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

test("applyAreaNodeParentAssignments requires full containment when assigning area parents", () => {
  const smallSecurityGroup = makeResourceNode({
    id: "sg-small-1",
    resourceType: "aws_security_group",
    position: { x: 120, y: 80 },
    size: { width: 160, height: 140 },
    zIndex: 2
  });
  const largeSubnet = makeResourceNode({
    id: "subnet-large-1",
    resourceType: "aws_subnet",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 360 },
    zIndex: 1
  });

  const result = applyAreaNodeParentAssignments(
    [largeSubnet, smallSecurityGroup],
    new Set([largeSubnet.id])
  );

  assert.equal(getNodeById(result, largeSubnet.id)?.metadata?.parentAreaNodeId, undefined);
});

test("applyAreaNodeParentAssignments assigns an area parent when the full child box is contained", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 360 },
    zIndex: 1
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceType: "aws_subnet",
    position: { x: 80, y: 70 },
    size: { width: 280, height: 220 },
    zIndex: 2
  });

  const result = applyAreaNodeParentAssignments([region, subnet], new Set([subnet.id]));

  assert.equal(getNodeById(result, subnet.id)?.metadata?.parentAreaNodeId, region.id);
});

test("applyAreaNodeParentAssignments keeps regular resources on center-point containment", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 60, y: 40 },
    size: { width: 60, height: 60 }
  });

  const result = applyAreaNodeParentAssignments([region, instance], new Set([instance.id]));

  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, region.id);
});

test("applyAreaNodeParentAssignments does not assign overlapping areas moved together as parents", () => {
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceType: "aws_subnet",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 360 },
    zIndex: 1
  });
  const securityGroupApp = makeResourceNode({
    id: "sg-app-1",
    resourceType: "aws_security_group",
    position: { x: 120, y: 80 },
    size: { width: 260, height: 220 },
    zIndex: 2
  });
  const securityGroupDb = makeResourceNode({
    id: "sg-db-1",
    resourceType: "aws_security_group",
    position: { x: 170, y: 120 },
    size: { width: 160, height: 140 },
    zIndex: 3
  });

  const result = applyAreaNodeParentAssignments(
    [subnet, securityGroupApp, securityGroupDb],
    new Set([subnet.id, securityGroupApp.id, securityGroupDb.id])
  );

  assert.equal(getNodeById(result, subnet.id)?.metadata?.parentAreaNodeId, undefined);
  assert.equal(getNodeById(result, securityGroupApp.id)?.metadata?.parentAreaNodeId, undefined);
  assert.equal(getNodeById(result, securityGroupDb.id)?.metadata?.parentAreaNodeId, undefined);
});

test("applyAreaNodeParentAssignments keeps existing area ancestry when nested areas move together", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 360 },
    zIndex: 1
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_subnet",
    position: { x: 80, y: 70 },
    size: { width: 280, height: 220 },
    zIndex: 2
  });

  const result = applyAreaNodeParentAssignments([region, subnet], new Set([region.id, subnet.id]));

  assert.equal(getNodeById(result, subnet.id)?.metadata?.parentAreaNodeId, region.id);
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

test("clearOutOfBoundsAreaParentAssignments removes children outside a resized parent area", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 180, height: 140 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_subnet",
    position: { x: 40, y: 40 },
    size: { width: 80, height: 60 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_instance",
    position: { x: 160, y: 130 },
    size: { width: 96, height: 72 }
  });

  const result = clearOutOfBoundsAreaParentAssignments(
    [region, subnet, instance],
    new Set([region.id])
  );

  assert.equal(getNodeById(result, subnet.id)?.metadata?.parentAreaNodeId, region.id);
  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, undefined);
});

test("clearOutOfBoundsAreaParentAssignments requires full containment for area children", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 200, height: 160 }
  });
  const securityGroup = makeResourceNode({
    id: "sg-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_security_group",
    position: { x: 120, y: 40 },
    size: { width: 120, height: 100 }
  });

  const result = clearOutOfBoundsAreaParentAssignments([region, securityGroup], new Set([region.id]));

  assert.equal(getNodeById(result, securityGroup.id)?.metadata?.parentAreaNodeId, undefined);
});

test("clearOutOfBoundsAreaParentAssignments keeps regular resources on center-point containment", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_instance",
    position: { x: 60, y: 40 },
    size: { width: 60, height: 60 }
  });

  const result = clearOutOfBoundsAreaParentAssignments([region, instance], new Set([region.id]));

  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, region.id);
});

test("clearOutOfBoundsAreaParentAssignments does not adopt stationary nodes covered by a resized area", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 160, y: 130 },
    size: { width: 96, height: 72 }
  });

  const result = clearOutOfBoundsAreaParentAssignments([region, instance], new Set([region.id]));

  assert.equal(getNodeById(result, instance.id)?.metadata?.parentAreaNodeId, undefined);
});

test("clearOutOfBoundsAreaParentAssignments keeps child positions after top-left area resize", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 }
  });
  const resizedRegion = {
    ...region,
    ...calculateNodeResize({
      bounds: {
        minWidth: 140,
        minHeight: 100,
        maxWidth: Number.MAX_SAFE_INTEGER,
        maxHeight: Number.MAX_SAFE_INTEGER
      },
      delta: { x: 60, y: 40 },
      handlePosition: "top-left",
      startPosition: region.position,
      startSize: region.size,
      zoom: 1
    })
  };
  const insideInstance = makeResourceNode({
    id: "inside-instance-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_instance",
    position: { x: 100, y: 90 },
    size: { width: 40, height: 40 }
  });
  const outsideInstance = makeResourceNode({
    id: "outside-instance-1",
    parentAreaNodeId: region.id,
    resourceType: "aws_instance",
    position: { x: 20, y: 20 },
    size: { width: 40, height: 40 }
  });

  const result = clearOutOfBoundsAreaParentAssignments(
    [resizedRegion, insideInstance, outsideInstance],
    new Set([region.id])
  );

  assert.deepEqual(getNodeById(result, insideInstance.id)?.position, insideInstance.position);
  assert.deepEqual(getNodeById(result, outsideInstance.id)?.position, outsideInstance.position);
  assert.equal(getNodeById(result, insideInstance.id)?.metadata?.parentAreaNodeId, region.id);
  assert.equal(getNodeById(result, outsideInstance.id)?.metadata?.parentAreaNodeId, undefined);
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
