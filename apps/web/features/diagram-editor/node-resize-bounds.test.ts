import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import { getNodeResizeBounds } from "./node-resize-bounds";

test("getNodeResizeBounds removes area node max limits while keeping minimum sizes", () => {
  const unrestrictedMax = {
    maxWidth: Number.MAX_SAFE_INTEGER,
    maxHeight: Number.MAX_SAFE_INTEGER
  };

  assert.deepEqual(getNodeResizeBounds(makeDesignNode("design_region")), {
    minWidth: 140,
    minHeight: 100,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeDesignNode("design_az")), {
    minWidth: 140,
    minHeight: 100,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeDesignNode("design_group")), {
    minWidth: 140,
    minHeight: 100,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_vpc")), {
    minWidth: 360,
    minHeight: 240,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_subnet")), {
    minWidth: 240,
    minHeight: 168,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_security_group")), {
    minWidth: 240,
    minHeight: 168,
    ...unrestrictedMax
  });
});

test("getNodeResizeBounds keeps regular resource bounds unchanged", () => {
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_instance")), {
    minWidth: 74,
    minHeight: 74,
    maxWidth: 260,
    maxHeight: 260
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

function makeDesignNode(type: string): Pick<DiagramNode, "kind" | "parameters" | "type"> {
  return {
    kind: "design",
    type
  };
}
