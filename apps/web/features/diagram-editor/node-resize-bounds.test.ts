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
    minWidth: 96,
    minHeight: 72,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeDesignNode("design_az")), {
    minWidth: 96,
    minHeight: 72,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeDesignNode("design_group")), {
    minWidth: 96,
    minHeight: 72,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_region")), {
    minWidth: 260,
    minHeight: 180,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_availability_zone")), {
    minWidth: 220,
    minHeight: 150,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_vpc")), {
    minWidth: 240,
    minHeight: 160,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_subnet")), {
    minWidth: 144,
    minHeight: 112,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_security_group")), {
    minWidth: 144,
    minHeight: 112,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_autoscaling_group")), {
    minWidth: 200,
    minHeight: 130,
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
