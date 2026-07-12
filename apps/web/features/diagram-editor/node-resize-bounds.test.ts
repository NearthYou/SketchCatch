import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { DiagramNode } from "../../../../packages/types/src";
import { getNodeResizeBounds } from "./node-resize-bounds";
import { RESOURCE_NODE_COMPACT_MIN_SIZE } from "./resource-node-geometry";

const nodeResizeBoundsSource = readFileSync(
  fileURLToPath(new URL("./node-resize-bounds.ts", import.meta.url)),
  "utf8"
);

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
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_autoscaling_group")), {
    minWidth: 100,
    minHeight: 65,
    ...unrestrictedMax
  });
});

test("getNodeResizeBounds lets regular icon resources shrink below their 48px default", () => {
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_instance")), {
    minWidth: RESOURCE_NODE_COMPACT_MIN_SIZE.width,
    minHeight: RESOURCE_NODE_COMPACT_MIN_SIZE.height,
    maxWidth: 260,
    maxHeight: 260
  });
  assert.deepEqual(getNodeResizeBounds(makeResourceNode("aws_security_group")), {
    minWidth: RESOURCE_NODE_COMPACT_MIN_SIZE.width,
    minHeight: RESOURCE_NODE_COMPACT_MIN_SIZE.height,
    maxWidth: 260,
    maxHeight: 260
  });
});

test("regular resize bounds derive their minimum from shared resource geometry", () => {
  assert.match(
    nodeResizeBoundsSource,
    /import \{ RESOURCE_NODE_COMPACT_MIN_SIZE \} from "\.\/resource-node-geometry";/
  );
  assert.match(nodeResizeBoundsSource, /minHeight:\s*RESOURCE_NODE_COMPACT_MIN_SIZE\.height/);
  assert.match(nodeResizeBoundsSource, /minWidth:\s*RESOURCE_NODE_COMPACT_MIN_SIZE\.width/);
});

test("getNodeResizeBounds applies icon bounds to non-area design icons", () => {
  assert.deepEqual(getNodeResizeBounds(makeDesignNode("sketchcatch_user_client", "/icons/user.svg")), {
    minWidth: RESOURCE_NODE_COMPACT_MIN_SIZE.width,
    minHeight: RESOURCE_NODE_COMPACT_MIN_SIZE.height,
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

function makeDesignNode(
  type: string,
  iconUrl?: string
): Pick<DiagramNode, "iconUrl" | "kind" | "parameters" | "type"> {
  return {
    ...(iconUrl ? { iconUrl } : {}),
    kind: "design",
    type
  };
}
