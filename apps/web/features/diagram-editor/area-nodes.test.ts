import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  findInnermostAreaDropTarget,
  findInnermostAreaNodeAtPoint,
  getAreaNodeIconUrl,
  getAreaNodeLabel,
  getAreaNodeMetaLabel,
  isAreaNode,
  isDesignAreaNode,
  isResourceAreaNode
} from "./area-nodes";

test("findInnermostAreaDropTarget selects the innermost Area without Terraform reference rules", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 600, height: 420 },
    zIndex: 1
  });
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceType: "aws_vpc",
    position: { x: 60, y: 60 },
    size: { width: 460, height: 320 },
    zIndex: 2
  });
  const autoscalingGroup = makeResourceNode({
    id: "asg-1",
    resourceType: "aws_autoscaling_group",
    position: { x: 140, y: 120 },
    size: { width: 240, height: 180 },
    zIndex: 3
  });
  const bucket = makeResourceNode({
    id: "bucket-1",
    resourceType: "aws_s3_bucket",
    position: { x: 200, y: 170 },
    size: { width: 48, height: 48 },
    zIndex: 4
  });

  assert.equal(
    findInnermostAreaDropTarget(bucket, [region, vpc, autoscalingGroup, bucket])?.id,
    "asg-1"
  );
});

test("findInnermostAreaDropTarget excludes Area nodes from Resource placement feedback", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 600, height: 420 }
  });
  const autoscalingGroup = makeResourceNode({
    id: "asg-1",
    resourceType: "aws_autoscaling_group",
    position: { x: 140, y: 120 },
    size: { width: 240, height: 180 }
  });

  assert.equal(findInnermostAreaDropTarget(autoscalingGroup, [region, autoscalingGroup]), null);
});

test("isAreaNode matches Region, Availability Zone, Group, and resource area nodes", () => {
  assert.equal(isAreaNode(makeDesignNode({ type: "design_region" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "design_az" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "design_group" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "sketchcatch_region" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "sketchcatch_az" })), true);
  assert.equal(isAreaNode(makeDesignNode({ type: "sketchcatch_group" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_region" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_availability_zone" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_autoscaling_group" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_vpc" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_subnet" })), true);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_security_group" })), true);
});

test("isAreaNode excludes regular design and resource nodes", () => {
  assert.equal(isAreaNode(makeDesignNode({ type: "design_note" })), false);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_instance" })), false);
  assert.equal(isAreaNode(makeResourceNode({ resourceType: "aws_internet_gateway" })), false);
  assert.equal(
    isAreaNode(
      makeResourceNode({
        resourceType: "aws_autoscaling_group",
        values: { diagramRenderAsResource: true }
      })
    ),
    false
  );
  assert.equal(
    isAreaNode(
      makeResourceNode({
        resourceType: "aws_security_group",
        values: { diagramRenderAsResource: true }
      })
    ),
    false
  );
});

test("area node helpers distinguish design containers from resource containers", () => {
  const region = makeDesignNode({ type: "design_region" });
  const regionResource = makeResourceNode({ resourceType: "aws_region" });
  const availabilityZoneResource = makeResourceNode({ resourceType: "aws_availability_zone" });
  const autoscalingGroupResource = makeResourceNode({ resourceType: "aws_autoscaling_group" });
  const vpc = makeResourceNode({ resourceType: "aws_vpc" });

  assert.equal(isDesignAreaNode(region), true);
  assert.equal(isResourceAreaNode(region), false);
  assert.equal(isDesignAreaNode(regionResource), false);
  assert.equal(isResourceAreaNode(regionResource), true);
  assert.equal(isDesignAreaNode(availabilityZoneResource), false);
  assert.equal(isResourceAreaNode(availabilityZoneResource), true);
  assert.equal(isDesignAreaNode(autoscalingGroupResource), false);
  assert.equal(isResourceAreaNode(autoscalingGroupResource), true);
  assert.equal(isDesignAreaNode(vpc), false);
  assert.equal(isResourceAreaNode(vpc), true);
});

test("getAreaNodeLabel uses the friendly uppercase board label instead of Terraform resource names", () => {
  assert.equal(
    getAreaNodeLabel(
      makeResourceNode({ label: "Main VPC", resourceName: "main_vpc", resourceType: "aws_vpc" })
    ),
    "MAIN VPC"
  );
  assert.equal(
    getAreaNodeLabel(
      makeResourceNode({ label: "Public Subnet", resourceName: "public_subnet", resourceType: "aws_subnet" })
    ),
    "PUBLIC SUBNET"
  );
  assert.equal(
    getAreaNodeLabel(
      makeResourceNode({ label: "Web Security Group", resourceName: "web_sg", resourceType: "aws_security_group" })
    ),
    "WEB SECURITY GROUP"
  );
  assert.equal(
    getAreaNodeLabel(
      makeResourceNode({
        label: "Auto Scaling Group",
        resourceName: "auto_scaling_group",
        resourceType: "aws_autoscaling_group"
      })
    ),
    "AUTO SCALING GROUP"
  );
  assert.equal(
    getAreaNodeLabel(
      makeResourceNode({ label: "Seoul Region", resourceName: "ap_northeast_2", resourceType: "aws_region" })
    ),
    "SEOUL REGION"
  );
});

test("getAreaNodeLabel falls back to node label for design areas and unnamed resources", () => {
  assert.equal(getAreaNodeLabel(makeDesignNode({ label: "Asia Pacific", type: "design_region" })), "Asia Pacific");
  assert.equal(
    getAreaNodeLabel(makeResourceNode({ label: "VPC", resourceName: "", resourceType: "aws_vpc" })),
    "VPC"
  );
});

test("getAreaNodeLabel falls back to node label when legacy resource data is missing resourceName", () => {
  const legacyVpc = makeResourceNode({ label: "VPC", resourceType: "aws_vpc" });

  Object.assign(legacyVpc.parameters ?? {}, { resourceName: undefined });

  assert.equal(getAreaNodeLabel(legacyVpc), "VPC");
});

test("getAreaNodeIconUrl returns resource and design area icons", () => {
  assert.equal(
    getAreaNodeIconUrl(makeResourceNode({ iconUrl: "/icons/vpc.svg", resourceType: "aws_vpc" })),
    "/icons/vpc.svg"
  );
  assert.equal(
    getAreaNodeIconUrl(makeDesignNode({ iconUrl: "/icons/region.svg", type: "design_region" })),
    "/icons/region.svg"
  );
  assert.equal(
    getAreaNodeIconUrl(makeDesignNode({ type: "sketchcatch_group" })),
    "/Architecture-Group-Icons_07312025/Auto-Scaling-group_32.svg"
  );
  assert.equal(
    getAreaNodeIconUrl(makeResourceNode({ iconUrl: "/icons/ec2.svg", resourceType: "aws_instance" })),
    undefined
  );
});

test("getAreaNodeMetaLabel summarizes Region area parameters without cluttering AZ headers", () => {
  assert.equal(
    getAreaNodeMetaLabel(
      makeResourceNode({
        resourceType: "aws_region",
        values: {
          awsRegion: "eu-west-1"
        }
      })
    ),
    "Europe (Ireland)"
  );
  assert.equal(
    getAreaNodeMetaLabel(
      makeResourceNode({
        resourceType: "aws_availability_zone",
        values: {
          awsAvailabilityZone: "us-east-1b"
        }
      })
    ),
    undefined
  );
});

test("findInnermostAreaNodeAtPoint returns the smallest area containing the point", () => {
  const region = makeDesignNode({
    id: "region-1",
    type: "design_region",
    position: { x: 0, y: 0 },
    size: { width: 600, height: 420 },
    zIndex: 1
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceType: "aws_subnet",
    position: { x: 80, y: 70 },
    size: { width: 360, height: 260 },
    zIndex: 2
  });
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceType: "aws_vpc",
    position: { x: 140, y: 120 },
    size: { width: 180, height: 120 },
    zIndex: 3
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 160, y: 140 },
    size: { width: 80, height: 60 },
    zIndex: 4
  });

  assert.equal(
    findInnermostAreaNodeAtPoint([region, subnet, vpc, instance], { x: 180, y: 150 })?.id,
    "vpc-1"
  );
});

test("findInnermostAreaNodeAtPoint distinguishes parent and nested area blank spaces", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceType: "aws_vpc",
    position: { x: 100, y: 100 },
    size: { width: 420, height: 300 },
    zIndex: 1
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceType: "aws_subnet",
    position: { x: 180, y: 160 },
    size: { width: 220, height: 140 },
    zIndex: 2
  });

  assert.equal(findInnermostAreaNodeAtPoint([vpc, subnet], { x: 140, y: 140 })?.id, "vpc-1");
  assert.equal(findInnermostAreaNodeAtPoint([vpc, subnet], { x: 220, y: 200 })?.id, "subnet-1");
});

test("findInnermostAreaNodeAtPoint uses zIndex when overlapping areas have the same size", () => {
  const lowerGroup = makeDesignNode({
    id: "group-1",
    type: "design_group",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    zIndex: 1
  });
  const upperGroup = makeDesignNode({
    id: "group-2",
    type: "design_group",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    zIndex: 5
  });

  assert.equal(findInnermostAreaNodeAtPoint([lowerGroup, upperGroup], { x: 40, y: 40 })?.id, "group-2");
});

function makeDesignNode({
  id,
  iconUrl,
  label,
  position = { x: 0, y: 0 },
  size = { width: 260, height: 180 },
  type,
  zIndex = 1
}: {
  id?: string;
  iconUrl?: string;
  label?: string;
  position?: DiagramNode["position"];
  size?: DiagramNode["size"];
  type: string;
  zIndex?: number;
}): DiagramNode {
  return {
    id: id ?? `${type}-1`,
    type,
    kind: "design",
    position,
    size,
    label: label ?? type,
    ...(iconUrl ? { iconUrl } : {}),
    locked: false,
    zIndex
  };
}

function makeResourceNode({
  id,
  iconUrl,
  label,
  position = { x: 0, y: 0 },
  resourceName,
  resourceType,
  size = { width: 168, height: 96 },
  values,
  zIndex = 1
}: {
  id?: string;
  iconUrl?: string;
  label?: string;
  position?: DiagramNode["position"];
  resourceName?: string;
  resourceType: string;
  size?: DiagramNode["size"];
  values?: Record<string, unknown>;
  zIndex?: number;
}): DiagramNode {
  return {
    id: id ?? `${resourceType}-1`,
    type: resourceType,
    kind: "resource",
    position,
    size,
    label: label ?? resourceType,
    ...(iconUrl ? { iconUrl } : {}),
    locked: false,
    zIndex,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: resourceName ?? resourceType.replace("aws_", ""),
      fileName: "main",
      values: values ?? {}
    }
  };
}
