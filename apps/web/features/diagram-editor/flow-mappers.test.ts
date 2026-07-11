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
  const source = makeNode({ id: "source-1", resourceType: "aws_instance" });
  const duplicateTarget = makeNode({ id: "duplicate-1", resourceType: "aws_s3_bucket" });
  const validTarget = makeNode({ id: "valid-1", resourceType: "aws_lambda_function" });
  const lockedTarget = makeNode({ id: "locked-1", locked: true, resourceType: "aws_cloudwatch_log_group" });
  const existingEdge = makeEdge(source.id, duplicateTarget.id);
  const flowNodes = toFlowNodes(
    [source, duplicateTarget, validTarget, lockedTarget],
    [],
    null,
    true,
    handlers,
    {
      activeConnectionSourceNodeId: source.id,
      edges: [existingEdge]
    }
  );

  assert.equal(flowNodes.find((node) => node.id === source.id)?.data.isValidConnectionTarget, false);
  assert.equal(
    flowNodes.find((node) => node.id === duplicateTarget.id)?.data.isValidConnectionTarget,
    false
  );
  assert.equal(
    flowNodes.find((node) => node.id === validTarget.id)?.data.isValidConnectionTarget,
    true
  );
  assert.equal(
    flowNodes.find((node) => node.id === lockedTarget.id)?.data.isValidConnectionTarget,
    false
  );
});

test("flow mappers collapse parameter-helper resources from the rendered board", () => {
  const service = makeNode({ id: "ecs-service", resourceType: "aws_ecs_service" });
  const scalingTarget = makeNode({ id: "scaling-target", resourceType: "aws_appautoscaling_target" });
  const dbSubnetGroup = makeNode({ id: "db-subnet-group", resourceType: "aws_db_subnet_group" });
  const securityGroup = makeNode({ id: "security-group", resourceType: "aws_security_group" });
  const runtimeRole = makeNode({ id: "runtime-role", resourceType: "aws_iam_role" });
  const launchTemplate = makeNode({ id: "launch-template", resourceType: "aws_launch_template" });
  const machineImage = makeNode({ id: "machine-image", resourceType: "aws_ami" });
  const certificate = makeNode({ id: "certificate", resourceType: "aws_acm_certificate" });
  const encryptionKey = makeNode({ id: "encryption-key", resourceType: "aws_kms_key" });
  const database = makeNode({ id: "database", resourceType: "aws_db_instance" });
  const flowNodes = toFlowNodes(
    [
      service,
      scalingTarget,
      dbSubnetGroup,
      securityGroup,
      runtimeRole,
      launchTemplate,
      machineImage,
      certificate,
      encryptionKey,
      database
    ],
    [],
    null,
    false,
    handlers
  );
  const flowEdges = toFlowEdges(
    [
      makeEdge(service.id, scalingTarget.id),
      makeEdge(dbSubnetGroup.id, database.id),
      makeEdge(securityGroup.id, service.id),
      makeEdge(runtimeRole.id, service.id),
      makeEdge(launchTemplate.id, service.id),
      makeEdge(machineImage.id, launchTemplate.id),
      makeEdge(certificate.id, service.id),
      makeEdge(encryptionKey.id, database.id),
      makeEdge(service.id, database.id)
    ],
    [],
    [
      service,
      scalingTarget,
      dbSubnetGroup,
      securityGroup,
      runtimeRole,
      launchTemplate,
      machineImage,
      certificate,
      encryptionKey,
      database
    ]
  );

  assert.deepEqual(
    flowNodes.map((node) => node.id),
    ["ecs-service", "security-group", "database"]
  );
  assert.deepEqual(
    flowEdges.map((edge) => edge.id),
    ["security-group-to-ecs-service", "ecs-service-to-database"]
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
  const flowNodes = toFlowNodes(
    [vpc, instance],
    ["instance-1"],
    "vpc-1",
    false,
    handlers
  );
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
  const autoscalingGroup = makeNode({ id: "asg-1", resourceType: "aws_autoscaling_group" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([vpc, autoscalingGroup, instance], [], null, false, handlers);

  assert.equal(flowNodes.find((node) => node.id === "vpc-1")?.className, "diagramAreaFlowNode");
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
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([subnet, instance], [], null, false, handlers);

  assert.equal(flowNodes.find((node) => node.id === "subnet-1")?.selectable, true);
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
  const loadBalancer = makeNode({
    id: "load-balancer-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_lb"
  });
  const autoscalingGroup = makeNode({
    id: "asg-1",
    parentAreaNodeId: "region-1",
    resourceType: "aws_autoscaling_group"
  });
  const selectedEdge = makeEdge("load-balancer-1", "asg-1");
  const unselectedEdge = makeEdge("instance-1", "asg-1");
  const flowEdges = toFlowEdges(
    [unselectedEdge, selectedEdge],
    [selectedEdge.id],
    [region, instance, loadBalancer, autoscalingGroup]
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

test("toFlowEdges scales compact arrow markers with semantic edge width", () => {
  const edges = (["thin", "medium", "thick"] as const).map((width) => ({
    ...makeEdge(`source-${width}`, `target-${width}`),
    style: { color: "#59687d", lineStyle: "solid" as const, width }
  }));
  const flowEdges = toFlowEdges(edges, []);

  assert.deepEqual(flowEdges.map((edge) => edge.markerEnd), [
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
  ]);
});

test("toFlowEdges renders plain connection lines as thin by default", () => {
  const flowEdges = toFlowEdges([makeEdge("api-1", "queue-1")], []);

  assert.equal(flowEdges[0]?.style?.strokeWidth, 1.25);
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

  assert.deepEqual(mappedEdges.map((edge) => edge.animated), [false, false]);
  assert.deepEqual(mappedEdges.map((edge) => edge.data?.isAnimated), [false, true]);
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
  const bucket = makeNode({ id: "bucket-1", resourceType: "aws_s3_bucket" });
  const logs = makeNode({ id: "logs-1", resourceType: "aws_cloudwatch_log_group" });
  const flowEdges = toFlowEdges(
    [{ ...makeEdge("bucket-1", "logs-1"), id: "bucket-to-logs", label: "depends_on" }],
    [],
    [bucket, logs]
  );

  assert.equal(flowEdges[0]?.style?.strokeDasharray, undefined);
  assert.equal(flowEdges[0]?.style?.stroke, "#6b7280");
  assert.equal(flowEdges[0]?.style?.strokeWidth, 1.25);
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
