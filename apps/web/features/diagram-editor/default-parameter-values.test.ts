import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, ResourceDragPayload, ResourceItem } from "@sketchcatch/types";

import { createDiagramNodeFromPayload } from "./diagram-utils";

test("dropping an ECS scaling target fills the contextual identity parameters", () => {
  const currentNodes = [
    resourceNode("cluster", "aws_ecs_cluster", "demo_cluster"),
    resourceNode("service", "aws_ecs_service", "demo_service")
  ];
  const payload: ResourceDragPayload = {
    source: "resource-settings-panel",
    item: scalingTargetItem()
  };

  const node = createDiagramNodeFromPayload(payload, { x: 100, y: 200 }, 3, currentNodes);

  assert.equal(node.parameters?.resourceName, "ecs_service_requests");
  assert.deepEqual(node.parameters?.values, {
    resourceId: "service/${aws_ecs_cluster.demo_cluster.name}/${aws_ecs_service.demo_service.name}",
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs"
  });
});

function resourceNode(id: string, resourceType: string, resourceName: string): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName,
      resourceType,
      values: {}
    },
    position: { x: 0, y: 0 },
    size: { width: 48, height: 48 },
    type: resourceType,
    zIndex: 1
  };
}

function scalingTargetItem(): ResourceItem {
  return {
    id: "aws-appautoscaling-target",
    name: "Application Auto Scaling Target",
    cloudProvider: "aws",
    area: "containers",
    category: "Containers",
    iconUrl: "/autoscaling.svg",
    enabled: true,
    nodeDefaults: {
      label: "Scaling Target",
      size: { width: 48, height: 48 },
      type: "aws_appautoscaling_target"
    }
  };
}
