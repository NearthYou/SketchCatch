import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";

import { BORDER_COLOR_SWATCHES } from "./constants";
import {
  AREA_NODE_DEFAULT_BORDER_COLOR,
  RESOURCE_NODE_BORDER_COLOR,
  canChangeNodeBorderColor,
  getNodeDisplayBorderColor,
  getNodeDisplayBorderStyle
} from "./node-style";

test("getNodeDisplayBorderColor keeps area border colors independent from resource borders", () => {
  assert.equal(AREA_NODE_DEFAULT_BORDER_COLOR, "#6f4cf6");
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_vpc")), "#6f4cf6");
  assert.equal(getNodeDisplayBorderColor(makeDesignNode("design_region")), "#6f4cf6");
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_vpc", "#8b98aa")), "#6f4cf6");
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_vpc", "#2f6db3")), "#6f4cf6");
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_vpc", "#2f8c55")), "#2f8c55");
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_instance", "#c9473d")), RESOURCE_NODE_BORDER_COLOR);
});

test("area border palette starts with the purple default and avoids legacy defaults", () => {
  assert.deepEqual(BORDER_COLOR_SWATCHES, [
    "#6f4cf6",
    "#1f6feb",
    "#2f8c55",
    "#d76613",
    "#c9473d"
  ]);
  assert.equal(BORDER_COLOR_SWATCHES[0], AREA_NODE_DEFAULT_BORDER_COLOR);
});

test("canChangeNodeBorderColor allows border color changes only for area nodes", () => {
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_vpc")), true);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_security_group")), true);
  assert.equal(canChangeNodeBorderColor(makeDesignNode("design_region")), true);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_instance")), false);
});

test("getNodeDisplayBorderStyle follows AWS group defaults for area nodes", () => {
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_region")), "dashed");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_availability_zone")), "dashed");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_autoscaling_group")), "dashed");
  assert.equal(getNodeDisplayBorderStyle(makeDesignNode("design_group")), "dashed");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_vpc")), "solid");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_subnet")), "solid");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_security_group")), "solid");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_instance")), "solid");
});

test("getNodeDisplayBorderStyle lets explicit area border style override the AWS default", () => {
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_region", undefined, "dotted")), "dotted");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_vpc", undefined, "dashed")), "dashed");
  assert.equal(getNodeDisplayBorderStyle(makeResourceNode("aws_instance", undefined, "dashed")), "solid");
});

function makeResourceNode(
  resourceType: string,
  borderColor?: string,
  borderStyle?: "solid" | "dashed" | "dotted"
): DiagramNode {
  const style = {
    ...(borderColor ? { borderColor } : {}),
    ...(borderStyle ? { borderStyle } : {})
  };

  return {
    id: `${resourceType}-1`,
    kind: "resource",
    label: resourceType,
    locked: false,
    position: { x: 0, y: 0 },
    size: { width: 112, height: 112 },
    type: resourceType,
    zIndex: 1,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: "example",
      fileName: "main",
      values: {}
    },
    ...(Object.keys(style).length > 0 ? { style } : {})
  };
}

function makeDesignNode(type: string): DiagramNode {
  return {
    id: `${type}-1`,
    kind: "design",
    label: type,
    locked: false,
    position: { x: 0, y: 0 },
    size: { width: 260, height: 180 },
    type,
    zIndex: 1
  };
}
