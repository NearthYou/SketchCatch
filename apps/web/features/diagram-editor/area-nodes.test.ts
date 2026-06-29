import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  isAreaNode,
  isDesignAreaNode,
  isResourceAreaNode
} from "./area-nodes";

test("isAreaNode matches Region, Availability Zone, Group, VPC, and Subnet nodes", () => {
  assert.equal(isAreaNode(makeDesignNode({ type: "design_region" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "design_az" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "design_group" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "sketchcatch_region" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "sketchcatch_az" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "sketchcatch_group" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_vpc" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_subnet" })), true);
});

test("isAreaNode excludes regular design and resource nodes", () => {
  assert.equal(isAreaNode(makeDesignNode({ type: "design_note" })), false);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_instance" })), false);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_internet_gateway" })), false);
});

test("area node helpers distinguish design containers from resource containers", () => {
  const region = makeDesignNode({ type: "design_region" });
  const vpc = makeResourceNode({ resourceType: "aws_vpc" });

  assert.equal(isDesignAreaNode(region), true);
  assert.equal(isResourceAreaNode(region), false);
  assert.equal(isDesignAreaNode(vpc), false);
  assert.equal(isResourceAreaNode(vpc), true);
});

function makeDesignNode({ type }: { type: string }): DiagramNode {
  return {
    id: `${type}-1`,
    type,
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 260, height: 180 },
    label: type,
    locked: false,
    zIndex: 1
  };
}

function makeResourceNode({ resourceType }: { resourceType: string }): DiagramNode {
  return {
    id: `${resourceType}-1`,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 168, height: 96 },
    label: resourceType,
    locked: false,
    zIndex: 1,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: resourceType.replace("aws_", ""),
      fileName: "main",
      values: {}
    }
  };
}
