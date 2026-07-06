import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";

import {
  AREA_NODE_DEFAULT_BORDER_COLOR,
  RESOURCE_NODE_BORDER_COLOR,
  canChangeNodeBorderColor,
  getNodeDisplayBorderColor
} from "./node-style";

test("getNodeDisplayBorderColor keeps area border colors independent from resource borders", () => {
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_vpc")), AREA_NODE_DEFAULT_BORDER_COLOR);
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_vpc", "#2f8c55")), "#2f8c55");
  assert.equal(getNodeDisplayBorderColor(makeResourceNode("aws_instance", "#c9473d")), RESOURCE_NODE_BORDER_COLOR);
});

test("canChangeNodeBorderColor allows border color changes only for area nodes", () => {
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_vpc")), true);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_security_group")), true);
  assert.equal(canChangeNodeBorderColor(makeDesignNode("design_region")), true);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_instance")), false);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_s3_bucket")), false);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_db_subnet_group")), false);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_api_gateway_rest_api")), false);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_api_gateway_resource")), false);
  assert.equal(canChangeNodeBorderColor(makeResourceNode("aws_cloudwatch_event_rule")), false);
});

function makeResourceNode(resourceType: string, borderColor?: string): DiagramNode {
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
    ...(borderColor ? { style: { borderColor } } : {})
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
