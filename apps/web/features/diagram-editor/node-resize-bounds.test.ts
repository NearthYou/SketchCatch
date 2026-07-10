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
    minWidth: 48,
    minHeight: 36,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeDesignNode("design_az")), {
    minWidth: 48,
    minHeight: 36,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeDesignNode("design_group")), {
    minWidth: 48,
    minHeight: 36,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_region")), {
    minWidth: 130,
    minHeight: 90,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_availability_zone")), {
    minWidth: 110,
    minHeight: 75,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_vpc")), {
    minWidth: 120,
    minHeight: 80,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_subnet")), {
    minWidth: 72,
    minHeight: 56,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_security_group")), {
    minWidth: 72,
    minHeight: 56,
    ...unrestrictedMax
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_autoscaling_group")), {
    minWidth: 100,
    minHeight: 65,
    ...unrestrictedMax
  });
});

test("getNodeResizeBounds keeps regular resource bounds aligned with compact icon defaults", () => {
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_instance")), {
    minWidth: 28,
    minHeight: 28,
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
