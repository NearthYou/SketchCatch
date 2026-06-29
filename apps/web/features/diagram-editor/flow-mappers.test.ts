import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import { toFlowNodes } from "./flow-mappers";
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

function makeNode({
  id,
  resourceType
}: {
  id: string;
  resourceType: string;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 168, height: 96 },
    label: id,
    locked: false,
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
