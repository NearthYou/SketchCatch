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

test("toFlowNodes reuses the cached node when its model and display state are unchanged", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const first = toFlowNodes([instance], [], null, false, handlers);
  const second = toFlowNodes([instance], [], null, false, handlers, {
    cachedNodesById: new Map(first.map((node) => [node.id, node]))
  });

  assert.equal(second[0], first[0]);
});

test("toFlowNodes replaces only the moved node when cached siblings are unchanged", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const bucket = makeNode({ id: "bucket-1", resourceType: "aws_s3_bucket" });
  const first = toFlowNodes([instance, bucket], [], null, false, handlers);
  const moved = { ...instance, position: { x: 120, y: 48 } };
  const second = toFlowNodes([moved, bucket], [], null, false, handlers, {
    cachedNodesById: new Map(first.map((node) => [node.id, node]))
  });

  assert.notEqual(second[0], first[0]);
  assert.equal(second[1], first[1]);
});

test("toFlowNodes replaces cached nodes when selection or dimming changes", () => {
  const previouslySelected = makeNode({ id: "previously-selected", resourceType: "aws_instance" });
  const newlySelected = makeNode({ id: "newly-selected", resourceType: "aws_s3_bucket" });
  const consistentlyDimmed = makeNode({ id: "consistently-dimmed", resourceType: "aws_sqs_queue" });
  const nodes = [previouslySelected, newlySelected, consistentlyDimmed];
  const first = toFlowNodes(nodes, [previouslySelected.id], null, false, handlers);
  const second = toFlowNodes(nodes, [newlySelected.id], null, false, handlers, {
    cachedNodesById: new Map(first.map((node) => [node.id, node]))
  });

  assert.notEqual(second[0], first[0]);
  assert.notEqual(second[1], first[1]);
  assert.equal(second[2], first[2]);
  assert.equal(second[0]?.data.isDimmed, true);
  assert.equal(second[1]?.selected, true);
});

test("toFlowNodes replaces cached nodes for connection activity and target-validity transitions", () => {
  const source = makeNode({ id: "source-1", resourceType: "aws_volume_attachment" });
  const duplicateTarget = makeNode({ id: "duplicate-1", resourceType: "aws_instance" });
  const validTarget = makeNode({ id: "valid-1", resourceType: "aws_instance" });
  const nodes = [source, duplicateTarget, validTarget];
  const inactive = toFlowNodes(nodes, [], null, false, handlers);
  const active = toFlowNodes(nodes, [], null, true, handlers, {
    activeConnectionSourceNodeId: source.id,
    cachedNodesById: new Map(inactive.map((node) => [node.id, node])),
    edges: []
  });
  const validityChanged = toFlowNodes(nodes, [], null, true, handlers, {
    activeConnectionSourceNodeId: source.id,
    cachedNodesById: new Map(active.map((node) => [node.id, node])),
    edges: [makeEdge(source.id, duplicateTarget.id)]
  });

  assert.notEqual(active[0], inactive[0]);
  assert.notEqual(active[1], inactive[1]);
  assert.notEqual(active[2], inactive[2]);
  assert.equal(active[1]?.data.isValidConnectionTarget, true);
  assert.notEqual(validityChanged[1], active[1]);
  assert.equal(validityChanged[2], active[2]);
  assert.equal(validityChanged[1]?.data.isValidConnectionTarget, false);
});

test("toFlowNodes replaces cached preview nodes when preview mode or annotations change", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const bucket = makeNode({ id: "bucket-1", resourceType: "aws_s3_bucket" });
  const nodes = [instance, bucket];
  const live = toFlowNodes(nodes, [], null, false, handlers);
  const modifiedPreview = toFlowNodes(nodes, [], null, false, handlers, {
    cachedNodesById: new Map(live.map((node) => [node.id, node])),
    isPreview: true,
    previewAnnotations: {
      edgeStates: {},
      nodeStates: { [instance.id]: "modified" }
    }
  });
  const deletedPreview = toFlowNodes(nodes, [], null, false, handlers, {
    cachedNodesById: new Map(modifiedPreview.map((node) => [node.id, node])),
    isPreview: true,
    previewAnnotations: {
      edgeStates: {},
      nodeStates: { [instance.id]: "deleted" }
    }
  });

  assert.notEqual(modifiedPreview[0], live[0]);
  assert.notEqual(modifiedPreview[1], live[1]);
  assert.notEqual(deletedPreview[0], modifiedPreview[0]);
  assert.equal(deletedPreview[1], modifiedPreview[1]);
  assert.equal(deletedPreview[0]?.data.previewState, "deleted");
});

test("toFlowNodes replaces cached descendants when an ancestor changes their z-index", () => {
  const account = makeDesignAreaNode({ id: "account-1", type: "sketchcatch_group" });
  const region = makeDesignAreaNode({ id: "region-1", type: "sketchcatch_region" });
  const availabilityZone = makeDesignAreaNode({
    id: "az-1",
    parentAreaNodeId: region.id,
    type: "sketchcatch_az"
  });
  const instance = makeNode({
    id: "instance-1",
    parentAreaNodeId: availabilityZone.id,
    resourceType: "aws_instance"
  });
  const rootBucket = makeNode({ id: "bucket-1", resourceType: "aws_s3_bucket" });
  const first = toFlowNodes(
    [account, region, availabilityZone, instance, rootBucket],
    [],
    null,
    false,
    handlers
  );
  const nestedRegion = { ...region, metadata: { parentAreaNodeId: account.id } };
  const second = toFlowNodes(
    [account, nestedRegion, availabilityZone, instance, rootBucket],
    [],
    null,
    false,
    handlers,
    { cachedNodesById: new Map(first.map((node) => [node.id, node])) }
  );

  assert.equal(second[0], first[0]);
  assert.notEqual(second[2], first[2]);
  assert.notEqual(second[3], first[3]);
  assert.equal(second[4], first[4]);
  assert.ok((second[3]?.zIndex ?? 0) > (first[3]?.zIndex ?? 0));
});

test("toFlowNodes replaces the cached node for every changed handler", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const handlerNames = [
    "onBringForward",
    "onSendBackward",
    "onTextColorChange",
    "onBorderColorChange",
    "onToggleLock",
    "onResizeStart",
    "onResize",
    "onResizeEnd"
  ] as const;

  for (const handlerName of handlerNames) {
    const first = toFlowNodes([instance], [], null, false, handlers);
    const replacementHandlers: DiagramFlowNodeHandlers = {
      ...handlers,
      [handlerName]: () => {}
    };
    const second = toFlowNodes([instance], [], null, false, replacementHandlers, {
      cachedNodesById: new Map(first.map((node) => [node.id, node]))
    });

    assert.notEqual(second[0], first[0], `${handlerName} must invalidate the cached Flow node`);
  }
});

test("toFlowNodes replaces only previous and current Area drop targets from the cache", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const subnet = makeNode({ id: "subnet-1", resourceType: "aws_subnet" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const first = toFlowNodes([vpc, subnet, instance], [], vpc.id, false, handlers);
  const firstById = new Map(first.map((node) => [node.id, node]));
  const second = toFlowNodes([vpc, subnet, instance], [], subnet.id, false, handlers, {
    cachedNodesById: firstById
  });
  const secondById = new Map(second.map((node) => [node.id, node]));

  assert.equal(firstById.get(vpc.id)?.data.isAreaDropTarget, true);
  assert.equal(secondById.get(vpc.id)?.data.isAreaDropTarget, false);
  assert.equal(firstById.get(subnet.id)?.data.isAreaDropTarget, false);
  assert.equal(secondById.get(subnet.id)?.data.isAreaDropTarget, true);
  assert.notEqual(secondById.get(vpc.id), firstById.get(vpc.id));
  assert.notEqual(secondById.get(subnet.id), firstById.get(subnet.id));
  assert.equal(secondById.get(instance.id), firstById.get(instance.id));
});

test("toFlowNodes marks only the active Area placement target in node data and accessibility", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const subnet = makeNode({ id: "subnet-1", resourceType: "aws_subnet" });

  const flowNodes = toFlowNodes([vpc, subnet], [], "vpc-1", false, handlers);
  const vpcFlowNode = flowNodes.find((node) => node.id === "vpc-1");

  assert.equal(vpcFlowNode?.data.isAreaDropTarget, true);
  assert.match(vpcFlowNode?.ariaLabel ?? "", /배치 대상/);
  assert.doesNotMatch(vpcFlowNode?.ariaLabel ?? "", /참조 대상/);
  assert.equal(flowNodes.find((node) => node.id === "subnet-1")?.data.isAreaDropTarget, false);
});

test("connection affordance marks only valid non-duplicate target nodes", () => {
  const source = makeNode({ id: "source-1", resourceType: "aws_volume_attachment" });
  const duplicateTarget = makeNode({ id: "duplicate-1", resourceType: "aws_ebs_volume" });
  const validTarget = makeNode({ id: "valid-1", resourceType: "aws_instance" });
  const invalidTarget = makeNode({ id: "invalid-1", resourceType: "aws_s3_bucket" });
  const lockedTarget = makeNode({ id: "locked-1", locked: true, resourceType: "aws_kms_key" });
  const existingEdge = makeEdge(source.id, duplicateTarget.id);
  const flowNodes = toFlowNodes(
    [source, duplicateTarget, validTarget, invalidTarget, lockedTarget],
    [],
    null,
    true,
    handlers,
    {
      activeConnectionSourceNodeId: source.id,
      edges: [existingEdge]
    }
  );

  assert.equal(
    flowNodes.find((node) => node.id === source.id)?.data.isValidConnectionTarget,
    false
  );
  assert.equal(
    flowNodes.find((node) => node.id === duplicateTarget.id)?.data.isValidConnectionTarget,
    false
  );
  assert.equal(
    flowNodes.find((node) => node.id === validTarget.id)?.data.isValidConnectionTarget,
    true
  );
  assert.equal(
    flowNodes.find((node) => node.id === invalidTarget.id)?.data.isValidConnectionTarget,
    false
  );
  assert.equal(
    flowNodes.find((node) => node.id === lockedTarget.id)?.data.isValidConnectionTarget,
    false
  );
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

test("flow node and edge accessible names include visible identity and state", () => {
  const vpc = makeNode({ id: "vpc-1", locked: true, resourceType: "aws_vpc" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const flowNodes = toFlowNodes([vpc, instance], ["instance-1"], "vpc-1", false, handlers);
  const selectedInstance = flowNodes.find((node) => node.id === "instance-1");
  const areaTargetVpc = flowNodes.find((node) => node.id === "vpc-1");

  assert.equal(selectedInstance?.ariaLabel, "INSTANCE-1, 선택됨");
  assert.equal(areaTargetVpc?.ariaLabel, "VPC-1, 잠김, 흐리게 표시됨, 배치 대상");

  const edge = {
    ...makeEdge("instance-1", "vpc-1"),
    label: "publishes"
  };
  const [selectedEdge] = toFlowEdges([edge], [edge.id]);
  const [deletedPreviewEdge] = toFlowEdges([edge], [], [], {
    isPreview: true,
    previewAnnotations: {
      edgeStates: { [edge.id]: "deleted" },
      nodeStates: {}
    }
  });

  assert.equal(selectedEdge?.ariaLabel, "publishes, 선택됨");
  assert.equal(deletedPreviewEdge?.ariaLabel, "publishes, 미리보기, 삭제됨");
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

  const flowNodes = toFlowNodes(
    [vpc, securityGroup, autoscalingGroup, instance],
    [],
    null,
    false,
    handlers
  );

  assert.equal(flowNodes.find((node) => node.id === "vpc-1")?.className, "diagramAreaFlowNode");
  assert.equal(
    flowNodes.find((node) => node.id === "security-group-1")?.className,
    "diagramAreaFlowNode"
  );
  assert.equal(flowNodes.find((node) => node.id === "asg-1")?.className, undefined);
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

test("toFlowNodes exposes the visual depth of nested Area surfaces", () => {
  const region = makeDesignAreaNode({ id: "region-1", type: "sketchcatch_region" });
  const availabilityZone = makeDesignAreaNode({
    id: "az-1",
    parentAreaNodeId: "region-1",
    type: "sketchcatch_az"
  });
  const vpc = makeNode({
    id: "vpc-1",
    parentAreaNodeId: "az-1",
    resourceType: "aws_vpc"
  });

  const flowNodes = toFlowNodes([region, availabilityZone, vpc], [], null, false, handlers);

  assert.equal(flowNodes.find((node) => node.id === "region-1")?.data.areaDepth, 0);
  assert.equal(flowNodes.find((node) => node.id === "az-1")?.data.areaDepth, 1);
  assert.equal(flowNodes.find((node) => node.id === "vpc-1")?.data.areaDepth, 2);
});

test("toFlowEdges keeps ASG resource connections above backgrounds and behind resource tiles", () => {
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
  const flowEdges = toFlowEdges(
    [makeEdge("instance-1", "asg-1")],
    [],
    [region, instance, autoscalingGroup]
  );

  const regionZIndex = getFlowNodeZIndex(flowNodes, "region-1");
  const autoscalingGroupZIndex = getFlowNodeZIndex(flowNodes, "asg-1");
  const edgeZIndex = getFlowEdgeZIndex(flowEdges, "instance-1-to-asg-1");

  assert.ok(regionZIndex < edgeZIndex);
  assert.ok(edgeZIndex < autoscalingGroupZIndex);
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

  assert.ok(
    getFlowEdgeZIndex(flowEdges, selectedEdge.id) > getFlowEdgeZIndex(flowEdges, unselectedEdge.id)
  );
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

test("toFlowEdges replaces stored handles when their rendered route crosses a resource", () => {
  const source = makeNode({
    id: "source",
    position: { x: 0, y: 100 },
    resourceType: "aws_instance"
  });
  const blocker = makeNode({
    id: "blocker",
    position: { x: 240, y: 100 },
    resourceType: "aws_s3_bucket"
  });
  const target = makeNode({
    id: "target",
    position: { x: 480, y: 100 },
    resourceType: "aws_lambda_function"
  });
  const edge = {
    ...makeEdge(source.id, target.id),
    sourceHandleId: "handle-right",
    targetHandleId: "handle-left"
  };

  const [flowEdge] = toFlowEdges([edge], [], [source, blocker, target]);

  assert.notDeepEqual(
    [flowEdge?.sourceHandle, flowEdge?.targetHandle],
    ["source-handle-right", "target-handle-left"]
  );
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

test("toFlowEdges scales compact arrow markers with semantic edge width", () => {
  const edges = (["thin", "medium", "thick"] as const).map((width) => ({
    ...makeEdge(`source-${width}`, `target-${width}`),
    style: { color: "#59687d", lineStyle: "solid" as const, width }
  }));
  const flowEdges = toFlowEdges(edges, []);

  assert.deepEqual(
    flowEdges.map((edge) => edge.markerEnd),
    [
      {
        type: MarkerType.ArrowClosed,
        color: "#59687d",
        width: 12,
        height: 12,
        markerUnits: "userSpaceOnUse"
      },
      {
        type: MarkerType.ArrowClosed,
        color: "#59687d",
        width: 13,
        height: 13,
        markerUnits: "userSpaceOnUse"
      },
      {
        type: MarkerType.ArrowClosed,
        color: "#59687d",
        width: 14,
        height: 14,
        markerUnits: "userSpaceOnUse"
      }
    ]
  );
});

test("toFlowEdges renders plain connection lines as thin by default", () => {
  const flowEdges = toFlowEdges([makeEdge("api-1", "queue-1")], []);

  assert.equal(flowEdges[0]?.style?.strokeWidth, 1.25);
});

test("toFlowEdges omits detail dependencies while keeping primary and summary relationships", () => {
  const edges: DiagramEdge[] = [
    { ...makeEdge("alb", "listener"), id: "detail", metadata: { presentationRole: "detail" } },
    { ...makeEdge("alb", "service"), id: "summary", metadata: { presentationRole: "summary" } },
    { ...makeEdge("service", "database"), id: "primary", metadata: { presentationRole: "primary" } }
  ];

  assert.deepEqual(
    toFlowEdges(edges, []).map((edge) => edge.id),
    ["summary", "primary"]
  );
});

test("selected edges preserve semantic style and do not force animation", () => {
  const edge: DiagramEdge = {
    ...makeEdge("api-1", "queue-1"),
    label: "publishes",
    style: {
      animated: false,
      color: "#b42318",
      lineStyle: "dotted",
      width: "thick"
    }
  };

  const [flowEdge] = toFlowEdges([edge], [edge.id]);

  assert.equal(flowEdge?.selected, true);
  assert.equal(flowEdge?.style?.stroke, "#b42318");
  assert.equal(flowEdge?.style?.strokeDasharray, "2 5");
  assert.equal(flowEdge?.style?.strokeWidth, 2.25);
  assert.equal(flowEdge?.animated, false);
});

test("toFlowEdges preserves non-empty labels independently of selection", () => {
  const labeled = { ...makeEdge("api-1", "queue-1"), label: "  publishes  " };
  const blank = { ...makeEdge("queue-1", "worker-1"), label: "   " };
  const [labeledFlowEdge, blankFlowEdge] = toFlowEdges([labeled, blank], []);

  assert.equal(labeledFlowEdge?.label, "publishes");
  assert.equal(labeledFlowEdge?.labelStyle?.fontWeight, 600);
  assert.equal(labeledFlowEdge?.labelStyle?.fill, "#172033");
  assert.equal(labeledFlowEdge?.labelBgStyle?.fill, "#f8fbff");
  assert.equal(labeledFlowEdge?.labelBgStyle?.stroke, "#9fb2c8");
  assert.deepEqual(labeledFlowEdge?.labelBgPadding, [8, 3]);
  assert.equal(labeledFlowEdge?.labelBgBorderRadius, 5);
  assert.equal(blankFlowEdge?.label, undefined);
});

test("toFlowEdges bounds long visual labels while preserving the full accessible relationship", () => {
  const label = "modified relationship with a bounded long label";
  const edge = { ...makeEdge("api-1", "queue-1"), label };
  const [flowEdge] = toFlowEdges([edge], []);

  assert.equal(typeof flowEdge?.label, "string");
  assert.ok(String(flowEdge?.label).length <= 30);
  assert.match(String(flowEdge?.label), /…$/u);
  assert.equal(flowEdge?.ariaLabel, label);
});

test("toFlowEdges keeps React Flow animation off and passes explicit motion intent to the custom renderer", () => {
  const staticEdge = { ...makeEdge("api-1", "queue-1"), style: { animated: false } };
  const animatedEdge = { ...makeEdge("queue-1", "worker-1"), style: { animated: true } };

  const mappedEdges = toFlowEdges([staticEdge, animatedEdge], []);

  assert.deepEqual(
    mappedEdges.map((edge) => edge.animated),
    [false, false]
  );
  assert.deepEqual(
    mappedEdges.map((edge) => edge.data?.isAnimated),
    [false, true]
  );
  assert.deepEqual(
    toFlowEdges([animatedEdge], [], [], { isPreview: true }).map((edge) => edge.data?.isAnimated),
    [false]
  );
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
  assert.equal(edgeById.get("https")?.style?.stroke, "#59687d");
  assert.equal(edgeById.get("event")?.style?.strokeDasharray, "7 5");
  assert.equal(edgeById.get("event")?.style?.stroke, "#476582");
  assert.equal(edgeById.get("deploy")?.style?.strokeDasharray, "7 5");
  assert.equal(edgeById.get("deploy")?.style?.stroke, "#8a5a00");
  assert.equal(edgeById.get("deploy")?.style?.strokeWidth, 2.25);
  assert.equal(edgeById.get("encrypts-logs")?.style?.strokeDasharray, undefined);
  assert.equal(edgeById.get("encrypts-logs")?.style?.stroke, "#6b7280");
  assert.equal(edgeById.get("encrypts-logs")?.style?.strokeWidth, 1.25);
});

test("stored edge semantics win over conflicting label inference", () => {
  const [flowEdge] = toFlowEdges(
    [
      {
        ...makeEdge("api-1", "queue-1"),
        label: "event queue",
        style: {
          animated: false,
          color: "#123456",
          lineStyle: "solid",
          width: "thick"
        }
      }
    ],
    []
  );

  assert.equal(flowEdge?.style?.stroke, "#123456");
  assert.equal(flowEdge?.style?.strokeDasharray, undefined);
  assert.equal(flowEdge?.style?.strokeWidth, 2.25);
  assert.equal(
    typeof flowEdge?.markerEnd === "object" ? flowEdge.markerEnd.color : undefined,
    "#123456"
  );
});

test("toFlowEdges renders configuration dependency endpoints as thin solid lines", () => {
  const key = makeNode({ id: "key-1", resourceType: "aws_kms_key" });
  const logs = makeNode({ id: "logs-1", resourceType: "aws_cloudwatch_log_group" });
  const flowEdges = toFlowEdges(
    [{ ...makeEdge("key-1", "logs-1"), id: "key-to-logs", label: "uses" }],
    [],
    [key, logs]
  );

  assert.equal(flowEdges[0]?.style?.strokeDasharray, undefined);
  assert.equal(flowEdges[0]?.style?.stroke, "#6b7280");
  assert.equal(flowEdges[0]?.style?.strokeWidth, 1.25);
});

test("toFlowEdges hides containment labels only when a real containment Area is the source", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const subnet = makeNode({ id: "subnet-1", parentAreaNodeId: vpc.id, resourceType: "aws_subnet" });
  const instance = makeNode({
    id: "instance-1",
    parentAreaNodeId: subnet.id,
    resourceType: "aws_instance"
  });
  const securityGroup = makeNode({
    id: "security-group-1",
    parentAreaNodeId: vpc.id,
    resourceType: "aws_security_group"
  });
  const flowEdges = toFlowEdges(
    [
      { ...makeEdge("vpc-1", "subnet-1"), id: "contains", label: "contains" },
      { ...makeEdge("subnet-1", "instance-1"), id: "hosts", label: "hosts" },
      { ...makeEdge("security-group-1", "instance-1"), id: "sg-contains", label: "contains" },
      { ...makeEdge("client-1", "api-1"), id: "https", label: "HTTPS" }
    ],
    [],
    [vpc, subnet, instance, securityGroup]
  );

  assert.deepEqual(
    flowEdges.map((edge) => edge.id),
    ["sg-contains", "https"]
  );
});

test("flow mappers make AI preview nodes and edges read-only", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const flowNodes = toFlowNodes([instance], ["instance-1"], "instance-1", false, handlers, {
    isPreview: true
  });
  const flowEdges = toFlowEdges(
    [
      {
        id: "edge-1",
        sourceNodeId: "instance-1",
        targetNodeId: "bucket-1",
        style: {
          animated: true,
          color: "#287d3c",
          lineStyle: "dotted",
          width: "medium"
        }
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
  assert.equal(flowEdges[0]?.data?.isAnimated, false);
  assert.equal(flowEdges[0]?.selectable, false);
  assert.equal(flowEdges[0]?.deletable, false);
  assert.equal(flowEdges[0]?.style?.stroke, "#287d3c");
  assert.equal(flowEdges[0]?.style?.strokeDasharray, "2 5");
  assert.equal(flowEdges[0]?.style?.strokeOpacity, 0.8);
  assert.equal(
    typeof flowEdges[0]?.markerEnd === "object" ? flowEdges[0].markerEnd.color : undefined,
    "#287d3ccc"
  );
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
        targetNodeId: "bucket-1",
        style: {
          color: "#b42318",
          lineStyle: "dotted",
          width: "thick"
        }
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
  assert.equal(previewEdge.style?.stroke, "#b42318");
  assert.equal(previewEdge.style?.strokeDasharray, "2 5");
  assert.equal(previewEdge.style?.strokeWidth, 2.25);
  assert.equal(previewEdge.style?.strokeOpacity, 0.8);
  assert.equal(
    typeof previewEdge.markerEnd === "object" ? previewEdge.markerEnd.color : undefined,
    "#b42318cc"
  );
});

function makeNode({
  id,
  locked = false,
  parentAreaNodeId,
  position = { x: 0, y: 0 },
  resourceType
}: {
  id: string;
  locked?: boolean;
  parentAreaNodeId?: string;
  position?: DiagramNode["position"];
  resourceType: string;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position,
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
