import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, ResourceConfig } from "../../../../packages/types/src";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import {
  finalizeDraggedNodes,
  getDraggedPreviewNodes,
  snapPositionToDiagramGrid
} from "./drag-transaction";

test("snapPositionToDiagramGrid rounds a free canvas position to the nearest grid point", () => {
  assert.deepEqual(snapPositionToDiagramGrid({ x: 103, y: 58 }, 12), { x: 108, y: 60 });
});

test("getDraggedPreviewNodes applies free drag positions without snapping", () => {
  const nodes = [
    makeResourceNode({ id: "node-a", resourceName: "web", resourceType: "aws_instance", x: 0, y: 0 })
  ];

  const previewNodes = getDraggedPreviewNodes({
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["node-a"]),
    positionByNodeId: new Map([["node-a", { x: 103, y: 58 }]]),
    snapshotNodes: nodes
  });

  assert.deepEqual(previewNodes[0]?.position, { x: 103, y: 58 });
});

test("finalizeDraggedNodes preserves multi-select spacing from the snapped anchor delta", () => {
  const nodes = [
    makeResourceNode({ id: "node-a", resourceName: "web", resourceType: "aws_instance", x: 0, y: 0 }),
    makeResourceNode({ id: "node-b", resourceName: "api", resourceType: "aws_instance", x: 31, y: 7 })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "node-a",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["node-a", "node-b"]),
    positionByNodeId: new Map([
      ["node-a", { x: 103, y: 58 }],
      ["node-b", { x: 134, y: 65 }]
    ]),
    snapGridSize: 12,
    snapshotNodes: nodes
  });

  assert.deepEqual(result.nodes.find((node) => node.id === "node-a")?.position, { x: 108, y: 60 });
  assert.deepEqual(result.nodes.find((node) => node.id === "node-b")?.position, { x: 139, y: 67 });
});

test("finalizeDraggedNodes moves area descendants from the snapped parent delta", () => {
  const nodes = [
    makeResourceNode({
      id: "vpc-1",
      resourceName: "main",
      resourceType: "aws_vpc",
      width: 240,
      height: 180,
      x: 0,
      y: 0
    }),
    makeResourceNode({
      id: "instance-1",
      metadata: { parentAreaNodeId: "vpc-1" },
      resourceName: "web",
      resourceType: "aws_instance",
      x: 20,
      y: 30
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "vpc-1",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["vpc-1"]),
    positionByNodeId: new Map([["vpc-1", { x: 103, y: 58 }]]),
    snapGridSize: 12,
    snapshotNodes: nodes
  });

  assert.deepEqual(result.nodes.find((node) => node.id === "vpc-1")?.position, {
    x: 30,
    y: 13.199999999999989
  });
  assert.deepEqual(result.nodes.find((node) => node.id === "vpc-1")?.size, {
    width: 396,
    height: 273.6
  });
  assert.deepEqual(result.nodes.find((node) => node.id === "instance-1")?.position, { x: 128, y: 90 });
  assert.deepEqual(result.movedNodeIds, new Set(["vpc-1", "instance-1"]));
});

test("finalizeDraggedNodes updates containing Terraform references only after the final drop", () => {
  const nodes = [
    makeResourceNode({
      id: "vpc-1",
      resourceName: "main",
      resourceType: "aws_vpc",
      width: 240,
      height: 180,
      x: 0,
      y: 0
    }),
    makeResourceNode({
      id: "subnet-1",
      resourceName: "public",
      resourceType: "aws_subnet",
      x: 300,
      y: 240
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "subnet-1",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["subnet-1"]),
    positionByNodeId: new Map([["subnet-1", { x: 63, y: 47 }]]),
    snapGridSize: 12,
    snapshotNodes: nodes
  });
  const subnet = result.nodes.find((node) => node.id === "subnet-1");

  assert.equal(subnet?.parameters?.values.vpcId, "aws_vpc.main.id");
  assert.equal(subnet?.metadata?.parentAreaNodeId, "vpc-1");
});

test("finalizeDraggedNodes assigns children to an ASG Area", () => {
  const nodes = [
    makeResourceNode({
      id: "asg-1",
      resourceName: "auto_scaling_group",
      resourceType: "aws_autoscaling_group",
      width: 200,
      height: 130,
      x: 0,
      y: 0
    }),
    makeResourceNode({
      id: "instance-1",
      resourceName: "web",
      resourceType: "aws_instance",
      x: 260,
      y: 180
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "instance-1",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["instance-1"]),
    positionByNodeId: new Map([["instance-1", { x: 48, y: 36 }]]),
    snapGridSize: 12,
    snapshotNodes: nodes
  });
  const instance = result.nodes.find((node) => node.id === "instance-1");

  assert.deepEqual(instance?.position, { x: 48, y: 36 });
  assert.equal(instance?.metadata?.parentAreaNodeId, "asg-1");
});

test("finalizeDraggedNodes refits a Security Group scope after its referenced Resource moves", () => {
  const securityGroup = makeResourceNode({
    id: "security-group-1",
    resourceName: "web",
    resourceType: "aws_security_group",
    width: 180,
    height: 178,
    x: 72,
    y: 56
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceName: "web",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.web.id"] },
    x: 100,
    y: 100
  });

  const result = finalizeDraggedNodes({
    anchorNodeId: instance.id,
    catalog: terraformParameterCatalog,
    currentNodes: [securityGroup, instance],
    directlyMovedNodeIds: new Set([instance.id]),
    positionByNodeId: new Map([[instance.id, { x: 220, y: 180 }]]),
    snapGridSize: 1,
    snapshotNodes: [securityGroup, instance]
  });

  const securityGroupAfter = result.nodes.find((node) => node.id === securityGroup.id);

  assert.deepEqual(securityGroupAfter?.position, { x: 192, y: 136 });
  assert.deepEqual(securityGroupAfter?.size, { width: 180, height: 178 });
});

test("finalizeDraggedNodes preserves a directly moved Security Group scope", () => {
  const securityGroup = makeResourceNode({
    id: "security-group-1",
    resourceName: "web",
    resourceType: "aws_security_group",
    width: 180,
    height: 178,
    x: 72,
    y: 56
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceName: "web",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.web.id"] },
    x: 100,
    y: 100
  });

  const result = finalizeDraggedNodes({
    anchorNodeId: securityGroup.id,
    catalog: terraformParameterCatalog,
    currentNodes: [securityGroup, instance],
    directlyMovedNodeIds: new Set([securityGroup.id]),
    positionByNodeId: new Map([[securityGroup.id, { x: 20, y: 40 }]]),
    snapGridSize: 1,
    snapshotNodes: [securityGroup, instance]
  });
  const securityGroupAfter = result.nodes.find((node) => node.id === securityGroup.id);

  assert.deepEqual(securityGroupAfter?.position, { x: 20, y: 40 });
  assert.deepEqual(securityGroupAfter?.size, securityGroup.size);
});

test("finalizeDraggedNodes refits a stationary Security Group around an indirectly moved target", () => {
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceName: "public",
    resourceType: "aws_subnet",
    width: 320,
    height: 240,
    x: 0,
    y: 0
  });
  const securityGroup = makeResourceNode({
    id: "security-group-1",
    resourceName: "web",
    resourceType: "aws_security_group",
    width: 180,
    height: 178,
    x: 72,
    y: 56
  });
  const instance = makeResourceNode({
    id: "instance-1",
    metadata: { parentAreaNodeId: subnet.id },
    resourceName: "web",
    resourceType: "aws_instance",
    values: { vpcSecurityGroupIds: ["aws_security_group.web.id"] },
    x: 100,
    y: 100
  });

  const result = finalizeDraggedNodes({
    anchorNodeId: subnet.id,
    catalog: terraformParameterCatalog,
    currentNodes: [subnet, securityGroup, instance],
    directlyMovedNodeIds: new Set([subnet.id]),
    positionByNodeId: new Map([[subnet.id, { x: 120, y: 80 }]]),
    snapGridSize: 1,
    snapshotNodes: [subnet, securityGroup, instance]
  });
  const securityGroupAfter = result.nodes.find((node) => node.id === securityGroup.id);

  assert.deepEqual(securityGroupAfter?.position, { x: 192, y: 136 });
  assert.deepEqual(securityGroupAfter?.size, { width: 180, height: 178 });
});

test("finalizeDraggedNodes stores a baseline and expands by 1.3 times the entered child size", () => {
  const nodes = [
    makeResourceNode({
      id: "vpc-1",
      resourceName: "main",
      resourceType: "aws_vpc",
      width: 80,
      height: 60,
      x: 0,
      y: 0
    }),
    makeResourceNode({
      id: "instance-1",
      resourceName: "web",
      resourceType: "aws_instance",
      width: 20,
      height: 20,
      x: 120,
      y: 20
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "instance-1",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["instance-1"]),
    positionByNodeId: new Map([["instance-1", { x: 5, y: 5 }]]),
    snapGridSize: 1,
    snapshotNodes: nodes
  });

  const vpcAfter = result.nodes.find((node) => node.id === "vpc-1");
  const instanceAfter = result.nodes.find((node) => node.id === "instance-1");
  assert.equal(instanceAfter?.metadata?.parentAreaNodeId, "vpc-1");
  assert.deepEqual(vpcAfter?.metadata?.areaAutoSizeBaseline, {
    position: { x: 0, y: 0 },
    size: { width: 80, height: 60 }
  });
  assert.deepEqual(vpcAfter?.position, { x: -13, y: -13 });
  assert.deepEqual(vpcAfter?.size, { width: 106, height: 86 });
});

test("finalizeDraggedNodes stores a baseline when the newly entered child is an area", () => {
  const nodes = [
    makeResourceNode({
      id: "region-1",
      resourceName: "seoul",
      resourceType: "aws_region",
      width: 300,
      height: 220,
      x: 0,
      y: 0
    }),
    makeResourceNode({
      id: "vpc-1",
      resourceName: "main",
      resourceType: "aws_vpc",
      width: 80,
      height: 60,
      x: 400,
      y: 300
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "vpc-1",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["vpc-1"]),
    positionByNodeId: new Map([["vpc-1", { x: 100, y: 80 }]]),
    snapGridSize: 1,
    snapshotNodes: nodes
  });

  const regionAfter = result.nodes.find((node) => node.id === "region-1");
  const vpcAfter = result.nodes.find((node) => node.id === "vpc-1");

  assert.equal(vpcAfter?.metadata?.parentAreaNodeId, "region-1");
  assert.deepEqual(vpcAfter?.position, { x: 100, y: 80 });
  assert.deepEqual(regionAfter?.metadata?.areaAutoSizeBaseline, {
    position: { x: 0, y: 0 },
    size: { width: 300, height: 220 }
  });
  assert.deepEqual(regionAfter?.position, { x: -52, y: -39 });
  assert.deepEqual(regionAfter?.size, { width: 404, height: 298 });
});

test("finalizeDraggedNodes assigns the parent without resizing it when auto expansion is OFF", () => {
  const nodes = [
    makeResourceNode({
      id: "vpc-1",
      resourceName: "main",
      resourceType: "aws_vpc",
      width: 80,
      height: 60,
      x: 0,
      y: 0
    }),
    makeResourceNode({
      id: "instance-1",
      resourceName: "web",
      resourceType: "aws_instance",
      width: 20,
      height: 20,
      x: 120,
      y: 20
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "instance-1",
    autoExpandAreasEnabled: false,
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["instance-1"]),
    positionByNodeId: new Map([["instance-1", { x: 5, y: 5 }]]),
    snapGridSize: 1,
    snapshotNodes: nodes
  });

  const vpcAfter = result.nodes.find((node) => node.id === "vpc-1");
  const instanceAfter = result.nodes.find((node) => node.id === "instance-1");

  assert.equal(instanceAfter?.metadata?.parentAreaNodeId, "vpc-1");
  assert.deepEqual(vpcAfter?.position, { x: 0, y: 0 });
  assert.deepEqual(vpcAfter?.size, { width: 80, height: 60 });
});

test("finalizeDraggedNodes recomputes the same parent size without cumulative expansion", () => {
  const nodes = [
    makeResourceNode({
      id: "vpc-1",
      resourceName: "main",
      resourceType: "aws_vpc",
      width: 80,
      height: 60,
      x: 0,
      y: 0
    }),
    makeResourceNode({
      id: "instance-1",
      metadata: { parentAreaNodeId: "vpc-1" },
      resourceName: "web",
      resourceType: "aws_instance",
      width: 20,
      height: 20,
      x: 10,
      y: 10
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "instance-1",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["instance-1"]),
    positionByNodeId: new Map([["instance-1", { x: 20, y: 28 }]]),
    snapGridSize: 1,
    snapshotNodes: nodes
  });

  const repeatedResult = finalizeDraggedNodes({
    anchorNodeId: "instance-1",
    catalog: terraformParameterCatalog,
    currentNodes: result.nodes,
    directlyMovedNodeIds: new Set(["instance-1"]),
    positionByNodeId: new Map([["instance-1", { x: 22, y: 30 }]]),
    snapGridSize: 1,
    snapshotNodes: result.nodes
  });

  const vpcAfter = repeatedResult.nodes.find((node) => node.id === "vpc-1");
  assert.deepEqual(vpcAfter?.position, { x: -13, y: -13 });
  assert.deepEqual(vpcAfter?.size, { width: 106, height: 86 });
  assert.deepEqual(vpcAfter?.metadata?.areaAutoSizeBaseline, {
    position: { x: 0, y: 0 },
    size: { width: 80, height: 60 }
  });
});

test("finalizeDraggedNodes restores the previous parent baseline after its last child leaves", () => {
  const nodes = [
    makeResourceNode({
      id: "vpc-1",
      metadata: {
        areaAutoSizeBaseline: {
          position: { x: 0, y: 0 },
          size: { width: 100, height: 100 }
        }
      },
      resourceName: "main",
      resourceType: "aws_vpc",
      width: 152,
      height: 152,
      x: -26,
      y: -26
    }),
    makeResourceNode({
      id: "instance-1",
      metadata: { parentAreaNodeId: "vpc-1" },
      resourceName: "web",
      resourceType: "aws_instance",
      width: 40,
      height: 40,
      x: 80,
      y: 70
    })
  ];

  const result = finalizeDraggedNodes({
    anchorNodeId: "instance-1",
    catalog: terraformParameterCatalog,
    currentNodes: nodes,
    directlyMovedNodeIds: new Set(["instance-1"]),
    positionByNodeId: new Map([["instance-1", { x: 300, y: 240 }]]),
    snapGridSize: 1,
    snapshotNodes: nodes
  });
  const vpcAfter = result.nodes.find((node) => node.id === "vpc-1");
  const instanceAfter = result.nodes.find((node) => node.id === "instance-1");

  assert.equal(instanceAfter?.metadata?.parentAreaNodeId, undefined);
  assert.deepEqual(vpcAfter?.position, { x: 0, y: 0 });
  assert.deepEqual(vpcAfter?.size, { width: 100, height: 100 });
  assert.equal(vpcAfter?.metadata?.areaAutoSizeBaseline, undefined);
});

/** Drag transaction fixture를 최소 Diagram Resource 형태로 만듭니다. */
function makeResourceNode({
  height = 72,
  id,
  metadata,
  resourceName,
  resourceType,
  values = {},
  width = 120,
  x,
  y
}: {
  height?: number;
  id: string;
  metadata?: DiagramNode["metadata"];
  resourceName: string;
  resourceType: string;
  values?: ResourceConfig;
  width?: number;
  x: number;
  y: number;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    label: resourceName,
    locked: false,
    metadata,
    position: { x, y },
    size: { width, height },
    zIndex: 0,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName,
      fileName: "main",
      values
    }
  };
}
