import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  getAvailabilityZoneNodeValue,
  getRegionNodeAwsRegion,
  isAvailabilityZoneAreaNode,
  isAvailabilityZoneResourceNode,
  isRegionAreaNode,
  isRegionResourceNode,
  updateAvailabilityZoneNodeParameters,
  updateRegionNodeParameters
} from "./region-node-metadata";

const baseRegionNode: DiagramNode = {
  id: "node-region",
  type: "sketchcatch_region",
  kind: "design",
  position: { x: 0, y: 0 },
  size: { width: 480, height: 320 },
  label: "Region",
  locked: false,
  zIndex: 1
};

test("area node predicates match Region and AZ resource nodes with legacy design support", () => {
  const regionResourceNode = makeAreaResourceNode("aws_region");
  const availabilityZoneResourceNode = makeAreaResourceNode("aws_availability_zone");

  assert.equal(isRegionAreaNode(regionResourceNode), true);
  assert.equal(isRegionResourceNode(regionResourceNode), true);
  assert.equal(isRegionAreaNode({ ...baseRegionNode, type: "design_region" }), true);
  assert.equal(isRegionAreaNode({ ...baseRegionNode, type: "sketchcatch_group" }), false);

  assert.equal(isAvailabilityZoneAreaNode(availabilityZoneResourceNode), true);
  assert.equal(isAvailabilityZoneResourceNode(availabilityZoneResourceNode), true);
  assert.equal(isAvailabilityZoneAreaNode({ ...baseRegionNode, type: "design_az" }), true);
  assert.equal(isAvailabilityZoneAreaNode(regionResourceNode), false);
});

test("getRegionNodeAwsRegion reads a valid selected region and falls back to Seoul", () => {
  const persistedNodeWithSelectedRegion = JSON.parse(
    JSON.stringify({
      ...baseRegionNode,
      metadata: { awsRegion: "eu-central-1" }
    })
  ) as DiagramNode;
  const persistedNodeWithUnknownRegion = JSON.parse(
    JSON.stringify({
      ...baseRegionNode,
      metadata: { awsRegion: "af-south-1" }
    })
  ) as DiagramNode;

  assert.equal(
    getRegionNodeAwsRegion(persistedNodeWithSelectedRegion),
    "eu-central-1"
  );

  assert.equal(getRegionNodeAwsRegion(persistedNodeWithUnknownRegion), "ap-northeast-2");
  assert.equal(getRegionNodeAwsRegion(baseRegionNode), "ap-northeast-2");
});

test("getRegionNodeAwsRegion reads parameters values before legacy metadata", () => {
  const regionResourceNode = JSON.parse(
    JSON.stringify({
      ...baseRegionNode,
      kind: "resource",
      metadata: { awsRegion: "eu-central-1" },
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_region",
        resourceName: "primary",
        fileName: "main.tf",
        values: {
          awsRegion: "us-west-2"
        }
      },
      type: "aws_region"
    })
  ) as DiagramNode;

  assert.equal(getRegionNodeAwsRegion(regionResourceNode), "us-west-2");
});

test("getAvailabilityZoneNodeValue reads parameters values and falls back to Seoul AZ", () => {
  const availabilityZoneNode = makeAreaResourceNode("aws_availability_zone", {
    awsAvailabilityZone: "us-east-1b"
  });
  const invalidAvailabilityZoneNode = makeAreaResourceNode("aws_availability_zone", {
    awsAvailabilityZone: "unknown-1a"
  });

  assert.equal(getAvailabilityZoneNodeValue(availabilityZoneNode), "us-east-1b");
  assert.equal(getAvailabilityZoneNodeValue(invalidAvailabilityZoneNode), "ap-northeast-2a");
});

test("parameter update helpers change only Region and AZ values", () => {
  const regionParameters = makeAreaResourceNode("aws_region").parameters;
  const availabilityZoneParameters = makeAreaResourceNode("aws_availability_zone").parameters;

  assert(regionParameters);
  assert(availabilityZoneParameters);

  assert.deepEqual(updateRegionNodeParameters(regionParameters, "eu-west-1"), {
    ...regionParameters,
    values: {
      ...regionParameters.values,
      awsRegion: "eu-west-1"
    }
  });
  assert.deepEqual(
    updateAvailabilityZoneNodeParameters(availabilityZoneParameters, "eu-central-1b"),
    {
      ...availabilityZoneParameters,
      values: {
        ...availabilityZoneParameters.values,
        awsAvailabilityZone: "eu-central-1b"
      }
    }
  );
});

function makeAreaResourceNode(
  resourceType: "aws_availability_zone" | "aws_region",
  values: Record<string, unknown> = {}
): DiagramNode {
  return {
    ...baseRegionNode,
    kind: "resource",
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: resourceType === "aws_region" ? "ap_northeast_2" : "ap_northeast_2a",
      fileName: "main",
      values
    },
    type: resourceType
  };
}
