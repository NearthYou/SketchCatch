import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
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

  const flowNodes = toFlowNodes([vpc, subnet], [], "vpc-1", handlers);

  assert.equal(flowNodes.find((node) => node.id === "vpc-1")?.data.isReferenceDropTarget, true);
  assert.equal(flowNodes.find((node) => node.id === "subnet-1")?.data.isReferenceDropTarget, false);
});

test("toFlowNodes keeps dimmed nodes interactive when another node is selected", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([vpc, instance], ["instance-1"], null, handlers);
  const areaNode = flowNodes.find((node) => node.id === "vpc-1");
  const regularNode = flowNodes.find((node) => node.id === "instance-1");

  assert.equal(areaNode?.data.isDimmed, true);
  assert.equal(areaNode?.style?.pointerEvents, "none");
  assert.equal(areaNode?.selectable, true);
  assert.equal(areaNode?.draggable, true);
  assert.equal(regularNode?.data.isDimmed, false);
  assert.equal(regularNode?.style?.pointerEvents, undefined);
});

test("toFlowNodes marks area nodes for click-through body hit testing", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });
  const securityGroup = makeNode({ id: "security-group-1", resourceType: "aws_security_group" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([vpc, securityGroup, instance], [], null, handlers);

  assert.equal(flowNodes.find((node) => node.id === "vpc-1")?.className, "diagramAreaFlowNode");
  assert.equal(flowNodes.find((node) => node.id === "security-group-1")?.className, "diagramAreaFlowNode");
  assert.equal(flowNodes.find((node) => node.id === "instance-1")?.className, undefined);
});

test("toFlowNodes keeps selected area nodes pointer-addressable for resize controls", () => {
  const vpc = makeNode({ id: "vpc-1", resourceType: "aws_vpc" });

  const flowNodes = toFlowNodes([vpc], ["vpc-1"], null, handlers);
  const flowNode = flowNodes.find((node) => node.id === "vpc-1");

  assert.equal(flowNode?.style?.pointerEvents, undefined);
  assert.equal(flowNode?.selectable, true);
  assert.match(flowNode?.className ?? "", /\bdiagramAreaFlowNodeInteractive\b/);
});

test("toFlowNodes keeps unselected area nodes available for marquee selection", () => {
  const subnet = makeNode({ id: "subnet-1", resourceType: "aws_subnet" });
  const securityGroup = makeNode({ id: "security-group-1", resourceType: "aws_security_group" });
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });

  const flowNodes = toFlowNodes([subnet, securityGroup, instance], [], null, handlers);

  assert.equal(flowNodes.find((node) => node.id === "subnet-1")?.selectable, true);
  assert.equal(flowNodes.find((node) => node.id === "security-group-1")?.selectable, true);
  assert.equal(flowNodes.find((node) => node.id === "instance-1")?.selectable, true);
});

test("toFlowNodes keeps locked area node bodies from falling through to pane selection", () => {
  const vpc = makeNode({ id: "vpc-1", locked: true, resourceType: "aws_vpc" });

  const flowNodes = toFlowNodes([vpc], [], null, handlers);
  const flowNode = flowNodes.find((node) => node.id === "vpc-1");

  assert.equal(flowNode?.style?.pointerEvents, undefined);
  assert.equal(flowNode?.draggable, false);
  assert.equal(flowNode?.connectable, false);
});

test("flow mappers make AI preview nodes and edges read-only", () => {
  const instance = makeNode({ id: "instance-1", resourceType: "aws_instance" });
  const flowNodes = toFlowNodes([instance], ["instance-1"], "instance-1", handlers, { isPreview: true });
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

function makeNode({
  id,
  locked = false,
  resourceType
}: {
  id: string;
  locked?: boolean;
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
