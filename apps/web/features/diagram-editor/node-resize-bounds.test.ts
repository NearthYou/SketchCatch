import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import { getNodeResizeBounds } from "./node-resize-bounds";

test("getNodeResizeBounds returns area resource bounds for VPC and Subnet", () => {
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_vpc")), {
    minWidth: 360,
    minHeight: 240,
    maxWidth: 1440,
    maxHeight: 960
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_subnet")), {
    minWidth: 240,
    minHeight: 168,
    maxWidth: 960,
    maxHeight: 720
  });
});

test("getNodeResizeBounds keeps regular resource and design bounds unchanged", () => {
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_instance")), {
    minWidth: 74,
    minHeight: 74,
    maxWidth: 260,
    maxHeight: 260
  });
  assert.deepEqual(getNodeResizeBounds(makeDesignNode()), {
    minWidth: 140,
    minHeight: 100,
    maxWidth: 840,
    maxHeight: 640
  });
});

function makeResourceNode(resourceType: string): Pick<DiagramNode, "kind" | "parameters" | "type"> {
  return {
    kind: "resource",
    type: resourceType,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: "example",
      fileName: "main",
      values: {}
    }
  };
}

function makeDesignNode(): Pick<DiagramNode, "kind" | "parameters" | "type"> {
  return {
    kind: "design",
    type: "design_group"
  };
}
