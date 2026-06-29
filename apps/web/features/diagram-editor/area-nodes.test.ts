import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  getAreaNodeIconUrl,
  getAreaNodeLabel,
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

test("getAreaNodeLabel uses resource name for VPC and Subnet area resources", () => {
  assert.equal(
    getAreaNodeLabel(makeResourceNode({ resourceName: "main_vpc", resourceType: "aws_vpc" })),
    "main_vpc"
  );
  assert.equal(
    getAreaNodeLabel(makeResourceNode({ resourceName: "public_subnet", resourceType: "aws_subnet" })),
    "public_subnet"
  );
});

test("getAreaNodeLabel falls back to node label for design areas and unnamed resources", () => {
  assert.equal(getAreaNodeLabel(makeDesignNode({ label: "Asia Pacific", type: "design_region" })), "Asia Pacific");
  assert.equal(
    getAreaNodeLabel(makeResourceNode({ label: "VPC", resourceName: "", resourceType: "aws_vpc" })),
    "VPC"
  );
});

test("getAreaNodeIconUrl returns icons only for resource area nodes", () => {
  assert.equal(
    getAreaNodeIconUrl(makeResourceNode({ iconUrl: "/icons/vpc.svg", resourceType: "aws_vpc" })),
    "/icons/vpc.svg"
  );
  assert.equal(
    getAreaNodeIconUrl(makeDesignNode({ iconUrl: "/icons/region.svg", type: "design_region" })),
    undefined
  );
  assert.equal(
    getAreaNodeIconUrl(makeResourceNode({ iconUrl: "/icons/ec2.svg", resourceType: "aws_instance" })),
    undefined
  );
});

function makeDesignNode({
  iconUrl,
  label,
  type
}: {
  iconUrl?: string;
  label?: string;
  type: string;
}): DiagramNode {
  return {
    id: `${type}-1`,
    type,
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 260, height: 180 },
    label: label ?? type,
    ...(iconUrl ? { iconUrl } : {}),
    locked: false,
    zIndex: 1
  };
}

function makeResourceNode({
  iconUrl,
  label,
  resourceName,
  resourceType
}: {
  iconUrl?: string;
  label?: string;
  resourceName?: string;
  resourceType: string;
}): DiagramNode {
  return {
    id: `${resourceType}-1`,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 168, height: 96 },
    label: label ?? resourceType,
    ...(iconUrl ? { iconUrl } : {}),
    locked: false,
    zIndex: 1,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: resourceName ?? resourceType.replace("aws_", ""),
      fileName: "main",
      values: {}
    }
  };
}
