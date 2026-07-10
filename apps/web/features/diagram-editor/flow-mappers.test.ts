import assert from "node:assert/strict";
import { test } from "node:test";
import { MarkerType } from "@xyflow/react";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";
import { toFlowEdges, toFlowNodes } from "./flow-mappers";
import type { DiagramFlowNodeHandlers } from "./types";

const handlers: DiagramFlowNodeHandlers = {
  onBringForward: () => {},
  onSendBackward: () => {},
  onTextColorChange: () => {},
  onBorderColorChange: () => {},
  onToggleLock: () => {},
  onResizeStart: () => {},
  onResize: () => {},
  onResizeEnd: () => {}
};

test("toFlowNodes marks the active reference drop target in node data", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const subnet = makeNode({ id: "subnet-1", resourceType: "aws_subnet" });

  const flowNodes = toFlowNodes([vpc, subnet], [], "vpc-1", false, handlers);

  assert.equal(flowNodes.find((node) => node.id === "vpc-1")?.data.isReferenceDropTarget, true);
  assert.equal(flowNodes.find((node) => node.id === "subnet-1")?.data.isReferenceDropTarget, false);
});

test("toFlowNodes keeps dimmed nodes interactive when another node is selected", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([vpc, instance], ["instance-1"], null, false, handlers);
  const areaNode = flowNodes.find((node) => node.id === "vpc-1");
  const regularNode = flowNodes.find((node) => node.id === "instance-1");

  assert.equal(areaNode?.data.isDimmed, true);
  assert.equal(areaNode?.style?.pointerEvents, "none");
  assert.equal(areaNode?.selectable, true);
  assert.equal(areaNode?.draggable, true);
  assert.equal(regularNode?.data.isDimmed, false);
  assert.equal(regularNode?.style?.pointerEvents, undefined);
});

test("toFlowNodes keeps an unselected regular node clickable while another node is selected", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([vpc, instance], ["vpc-1"], null, false, handlers);
  const dimmedInstance = flowNodes.find((node) => node.id === instance.id);

  assert.equal(dimmedInstance?.data.isDimmed, true);
  assert.equal(dimmedInstance?.selectable, true);
  assert.equal(dimmedInstance?.draggable, true);
  assert.equal(dimmedInstance?.style?.pointerEvents, undefined);
});

test("toFlowNodes marks area nodes for click-through body hit testing", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const securityGroup = makeNode({ id: "security-group-1", resourceType: "aws_security_group" });
  const autoscalingGroup = makeNode({ id: "asg-1", resourceType: "aws_autoscaling_group" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([vpc, securityGroup, autoscalingGroup, instance], [], null, false, handlers);

  assert.equal(flowNodes.find((node) => node.id === "vpc-1")?.className, "diagramAreaFlowNode");
  assert.equal(flowNodes.find((node) => node.id === "security-group-1")?.className, "diagramAreaFlowNode");
  assert.equal(flowNodes.find((node) => node.id === "asg-1")?.className, "diagramAreaFlowNode");
  assert.equal(flowNodes.find((node) => node.id === "instance-1")?.className, undefined);
});

test("toFlowNodes keeps selected area nodes pointer-addressable for resize controls", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });

  const flowNodes = toFlowNodes([vpc], ["vpc-1"], null, false, handlers);
  const flowNode = flowNodes.find((node) => node.id === "vpc-1");

  assert.equal(flowNode?.style?.pointerEvents, undefined);
  assert.equal(flowNode?.selectable, true);
  assert.match(flowNode?.className ?? "", /\bdiagramAreaFlowNodeInteractive\b/);
});

test("toFlowNodes keeps unselected area nodes available for marquee selection", () => {
  const subnet = makeNode({ id: "subnet-1", resourceType: "aws_subnet" });
  const securityGroup = makeNode({ id: "security-group-1", resourceType: "aws_security_group" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([subnet, securityGroup, instance], [], null, false, handlers);

  assert.equal(flowNodes.find((node) => node.id === "subnet-1")?.selectable, true);
  assert.equal(flowNodes.find((node) => node.id === "security-group-1")?.selectable, true);
  assert.equal(flowNodes.find((node) => node.id === "instance-1")?.selectable, true);
});

test("toFlowNodes keeps locked area node bodies from falling through to pane selection", () => {
  const vpc = makeNode({ id: "vpc-1", locked: true, resourceType: "aws_vpc" });

  const flowNodes = toFlowNodes([vpc], [], null, false, handlers);
  const flowNode = flowNodes.find((node) => node.id === "vpc-1");

  assert.equal(flowNode?.style?.pointerEvents, undefined);
  assert.equal(flowNode?.draggable, false);
  assert.equal(flowNode?.connectable, false);
});

test("toFlowNodes keeps every area below resources even when the area is nested", () => {
  const region = makeDesignAreaNode({ id: "region-1", type: "sketchcatch_region" });
  const instance = makeNode({
    id: "instance-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_instance"
  });
  const availabilityZone = makeDesignAreaNode({
    id: "az-1",
    parentAreaNodeId: "region-1",
    type: "sketchcatch_az"
  });

  const flowNodes = toFlowNodes([region, instance, availabilityZone], [], null, false, handlers);

  const regionZIndex = getFlowNodeZIndex(flowNodes, "region-1");
  const instanceZIndex = getFlowNodeZIndex(flowNodes, "instance-1");
  const availabilityZoneZIndex = getFlowNodeZIndex(flowNodes, "az-1");

  assert.ok(regionZIndex < instanceZIndex);
  assert.ok(regionZIndex < availabilityZoneZIndex);
  assert.ok(availabilityZoneZIndex < instanceZIndex);
});

test("toFlowNodes stacks resources above the nested area they belong to", () => {
  const region = makeDesignAreaNode({ id: "region-1", type: "sketchcatch_region" });
  const availabilityZone = makeDesignAreaNode({
    id: "az-1",
    parentAreaNodeId: "region-1",
    type: "sketchcatch_az"
  });
  const instance = makeNode({
    id: "instance-1",
    parentAreaNodeId: "az-1",
    resourceType: "aws_instance"
  });

  const flowNodes = toFlowNodes([region, availabilityZone, instance], [], null, false, handlers);

  const regionZIndex = getFlowNodeZIndex(flowNodes, "region-1");
  const availabilityZoneZIndex = getFlowNodeZIndex(flowNodes, "az-1");
  const instanceZIndex = getFlowNodeZIndex(flowNodes, "instance-1");

  assert.ok(regionZIndex < availabilityZoneZIndex);
  assert.ok(availabilityZoneZIndex < instanceZIndex);
});

test("toFlowEdges stacks ASG resource connections above containing area backgrounds", () => {
  const region = makeDesignAreaNode({ id: "region-1", type: "sketchcatch_region" });
  const instance = makeNode({
    id: "instance-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_instance"
  });
  const autoscalingGroup = makeNode({
    id: "asg-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_autoscaling_group"
  });
  const flowNodes = toFlowNodes([region, instance, autoscalingGroup], [], null, false, handlers);
  const flowEdges = toFlowEdges([makeEdge("instance-1", "asg-1")], [], [region, instance, autoscalingGroup]);

  const regionZIndex = getFlowNodeZIndex(flowNodes, "region-1");
  const autoscalingGroupZIndex = getFlowNodeZIndex(flowNodes, "asg-1");
  const edgeZIndex = getFlowEdgeZIndex(flowEdges, "instance-1-to-asg-1");

  assert.ok(regionZIndex < edgeZIndex);
  assert.ok(autoscalingGroupZIndex < edgeZIndex);
});

test("toFlowEdges stacks selected area endpoint edges above unselected area endpoint edges", () => {
  const region = makeDesignAreaNode({ id: "region-1", type: "sketchcatch_region" });
  const instance = makeNode({
    id: "instance-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_instance"
  });
  const launchTemplate = makeNode({
    id: "launch-template-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_launch_template"
  });
  const autoscalingGroup = makeNode({
    id: "asg-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_autoscaling_group"
  });
  const selectedEdge = makeEdge("launch-template-1", "asg-1");
  const unselectedEdge = makeEdge("instance-1", "asg-1");
  const flowEdges = toFlowEdges(
    [unselectedEdge, selectedEdge],
    [selectedEdge.id],
    [region, instance, launchTemplate, autoscalingGroup]
  );

  assert.ok(getFlowEdgeZIndex(flowEdges, selectedEdge.id) > getFlowEdgeZIndex(flowEdges, unselectedEdge.id));
});

test("toFlowEdges maps logical handle ids to real source and target handles", () => {
  const flowEdges = toFlowEdges(
    [
      {
        ...makeEdge("instance-1", "asg-1"),
        sourceHandleId: "handle-right",
        targetHandleId: "handle-left"
      }
    ],
    []
  );

  assert.equal(flowEdges[0]?.sourceHandle, "source-handle-right");
  assert.equal(flowEdges[0]?.targetHandle, "target-handle-left");
});

test("toFlowEdges keeps existing React Flow source and target handle ids stable", () => {
  const flowEdges = toFlowEdges(
    [
      {
        ...makeEdge("instance-1", "asg-1"),
        sourceHandleId: "source-handle-bottom",
        targetHandleId: "target-handle-top"
      }
    ],
    []
  );

  assert.equal(flowEdges[0]?.sourceHandle, "source-handle-bottom");
  assert.equal(flowEdges[0]?.targetHandle, "target-handle-top");
});

test("toFlowEdges renders connection arrowheads as elongated filled triangles", () => {
  const flowEdges = toFlowEdges([makeEdge("api-1", "queue-1")], []);

  assert.deepEqual(flowEdges[0]?.markerEnd, {
    type: MarkerType.ArrowClosed,
    color: "#506176",
    width: 36,
    height: 10
  });
});

test("toFlowEdges renders plain connection lines as thin by default", () => {
  const flowEdges = toFlowEdges([makeEdge("api-1", "queue-1")], []);

  assert.equal(flowEdges[0]?.style?.strokeWidth, 1.5);
});

test("toFlowEdges renders dashed diagram edge styles outside preview mode", () => {
  const flowEdges = toFlowEdges(
    [
      {
        ...makeEdge("api-1", "queue-1"),
        style: {
          color: "#476582",
          lineStyle: "dashed",
          width: "medium"
        }
      }
    ],
    []
  );

  assert.equal(flowEdges[0]?.style?.stroke, "#476582");
  assert.equal(flowEdges[0]?.style?.strokeDasharray, "7 5");
});

test("toFlowEdges derives line style from legacy edge labels", () => {
  const flowEdges = toFlowEdges(
    [
      { ...makeEdge("client-1", "api-1"), id: "https", label: "HTTPS" },
      { ...makeEdge("api-1", "queue-1"), id: "event", label: "event queue" },
      { ...makeEdge("pipeline-1", "api-1"), id: "deploy", label: "Terraform apply" },
      { ...makeEdge("key-1", "logs-1"), id: "encrypts-logs", label: "encrypts logs" }
    ],
    []
  );

  const edgeById = new Map(flowEdges.map((edge) => [edge.id, edge]));

  assert.equal(edgeById.get("https")?.style?.strokeDasharray, undefined);
  assert.equal(edgeById.get("https")?.style?.stroke, "#506176");
  assert.equal(edgeById.get("event")?.style?.strokeDasharray, "7 5");
  assert.equal(edgeById.get("event")?.style?.stroke, "#476582");
  assert.equal(edgeById.get("deploy")?.style?.strokeDasharray, "7 5");
  assert.equal(edgeById.get("deploy")?.style?.stroke, "#8a5a00");
  assert.equal(edgeById.get("deploy")?.style?.strokeWidth, 4);
  assert.equal(edgeById.get("encrypts-logs")?.style?.strokeDasharray, undefined);
  assert.equal(edgeById.get("encrypts-logs")?.style?.stroke, "#6b7280");
  assert.equal(edgeById.get("encrypts-logs")?.style?.strokeWidth, 1.5);
});

test("toFlowEdges renders configuration dependency endpoints as thin solid lines", () => {
  const key = makeNode({ id: "key-1", resourceType: "aws_kms_key" });
  const logs = makeNode({ id: "logs-1", resourceType: "aws_cloudwatch_log_group" });
  const flowEdges = toFlowEdges([{ ...makeEdge("key-1", "logs-1"), id: "key-to-logs", label: "uses" }], [], [key, logs]);

  assert.equal(flowEdges[0]?.style?.strokeDasharray, undefined);
  assert.equal(flowEdges[0]?.style?.stroke, "#6b7280");
  assert.equal(flowEdges[0]?.style?.strokeWidth, 1.5);
});

test("toFlowEdges hides containment labels from rendered edges", () => {
  const flowEdges = toFlowEdges(
    [
      { ...makeEdge("vpc-1", "subnet-1"), id: "contains", label: "contains" },
      { ...makeEdge("subnet-1", "instance-1"), id: "hosts", label: "hosts" },
      { ...makeEdge("client-1", "api-1"), id: "https", label: "HTTPS" }
    ],
    []
  );

  assert.deepEqual(
    flowEdges.map((edge) => edge.id),
    ["https"]
  );
});

test("flow mappers make AI preview nodes and edges read-only", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const flowNodes = toFlowNodes([instance], ["instance-1"], "instance-1", false, handlers, { isPreview: true });
  const flowEdges = toFlowEdges(
    [
      {
        id: "edge-1",
        sourceNodeId: "instance-1",
        targetNodeId: "bucket-1",
        style: { animated: true }
      }
    ],
    ["edge-1"],
    [],
    { isPreview: true }
  );

  assert.equal(flowNodes[0]?.data.isPreview, true);
  assert.equal(flowNodes[0]?.selected, false);
  assert.equal(flowNodes[0]?.draggable, false);
  assert.equal(flowNodes[0]?.selectable, false);
  assert.equal(flowNodes[0]?.connectable, false);
  assert.equal(flowNodes[0]?.deletable, false);
  assert.equal(flowEdges[0]?.selected, false);
  assert.equal(flowEdges[0]?.animated, false);
  assert.equal(flowEdges[0]?.selectable, false);
  assert.equal(flowEdges[0]?.deletable, false);
  assert.equal(flowEdges[0]?.style?.strokeOpacity, 0.48);
});

test("flow mappers carry patch preview states for added, modified, and deleted elements", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const bucket = makeNode({ id: "bucket-1", resourceType: "aws_s3_bucket" });
  const flowNodes = toFlowNodes([instance, bucket], [], null, false, handlers, {
    isPreview: true,
    previewAnnotations: {
      edgeStates: {
        "instance-to-bucket": "deleted"
      },
      nodeStates: {
        "bucket-1": "deleted",
        "instance-1": "modified"
      }
    }
  });
  const flowEdges = toFlowEdges(
    [
      {
        id: "instance-to-bucket",
        sourceNodeId: "instance-1",
        targetNodeId: "bucket-1"
      }
    ],
    [],
    [],
    {
      isPreview: true,
      previewAnnotations: {
        edgeStates: {
          "instance-to-bucket": "deleted"
        },
        nodeStates: {}
      }
    }
  );

  const previewEdge = flowEdges[0];

  assert.ok(previewEdge);
  assert.ok(previewEdge.data);
  assert.equal(flowNodes.find((node) => node.id === "bucket-1")?.data.previewState, "deleted");
  assert.equal(flowNodes.find((node) => node.id === "instance-1")?.data.previewState, "modified");
  assert.equal(previewEdge.data.previewState, "deleted");
  assert.equal(previewEdge.style?.stroke, "#8b949e");
  assert.equal(previewEdge.style?.strokeOpacity, 0.36);
});

function makeNode({
  id,
  locked = false,
  parentAreaNodeId,
  resourceType
}: {
  id: string;
  locked?: boolean;
  parentAreaNodeId?: string;
  resourceType: string;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 168, height: 96 },
    label: id,
    locked,
    ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {}),
    zIndex: 1,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: id.replaceAll("-", "_"),
      fileName: "main",
      values: {}
    }
  };
}

function makeEdge(sourceNodeId: string, targetNodeId: string): DiagramEdge {
  return {
    id: `${sourceNodeId}-to-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    type: "default"
  };
}

function makeDesignAreaNode({
  id,
  parentAreaNodeId,
  type
}: {
  id: string;
  parentAreaNodeId?: string;
  type: string;
}): DiagramNode {
  return {
    id,
    type,
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 360, height: 240 },
    label: id,
    locked: false,
    ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {}),
    zIndex: 1
  };
}

function getFlowNodeZIndex(flowNodes: ReturnType<typeof toFlowNodes>, nodeId: string): number {
  const flowNode = flowNodes.find((node) => node.id === nodeId);

  assert.ok(flowNode);

  const zIndex = flowNode.zIndex;

  if (typeof zIndex !== "number") {
    assert.fail(`Expected ${nodeId} to have a numeric zIndex`);
  }

  return zIndex;
}

function getFlowEdgeZIndex(flowEdges: ReturnType<typeof toFlowEdges>, edgeId: string): number {
  const flowEdge = flowEdges.find((edge) => edge.id === edgeId);

  assert.ok(flowEdge);

  const zIndex = flowEdge.zIndex;

  if (typeof zIndex !== "number") {
    assert.fail(`Expected ${edgeId} to have a numeric zIndex`);
  }

  return zIndex;
}
