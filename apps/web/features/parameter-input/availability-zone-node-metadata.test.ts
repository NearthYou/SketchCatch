import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, DiagramNodeParameters } from "../../../../packages/types/src";
import {
  createAvailabilityZoneNodeParameters,
  getAvailabilityZoneNodeAwsAvailabilityZone,
  isAvailabilityZoneDesignNode
} from "./availability-zone-node-metadata";

const baseAvailabilityZoneParameters: DiagramNodeParameters = {
  resourceType: "aws_availability_zone",
  resourceName: "availability_zone",
  fileName: "main",
  values: {}
};

const baseAvailabilityZoneNode: DiagramNode = {
  id: "node-az",
  type: "aws_availability_zone",
  kind: "resource",
  position: { x: 0, y: 0 },
  size: { width: 360, height: 240 },
  label: "Availability Zone",
  locked: false,
  zIndex: 1,
  parameters: baseAvailabilityZoneParameters
};

test("isAvailabilityZoneDesignNode matches AZ area resource and legacy design node types only", () => {
  assert.equal(isAvailabilityZoneDesignNode(baseAvailabilityZoneNode), true);
  assert.equal(
    isAvailabilityZoneDesignNode({
      ...baseAvailabilityZoneNode,
      type: "sketchcatch_az",
      kind: "design",
      parameters: undefined
    }),
    true
  );
  assert.equal(
    isAvailabilityZoneDesignNode({
      ...baseAvailabilityZoneNode,
      type: "design_region",
      kind: "design",
      parameters: undefined
    }),
    false
  );
  assert.equal(
    isAvailabilityZoneDesignNode({
      ...baseAvailabilityZoneNode,
      type: "aws_vpc",
      parameters: {
        ...baseAvailabilityZoneParameters,
        resourceType: "aws_vpc"
      }
    }),
    false
  );
});

test("getAvailabilityZoneNodeAwsAvailabilityZone reads a valid selected AZ and falls back to Seoul a", () => {
  const persistedNodeWithUnknownAz = JSON.parse(
    JSON.stringify({
      ...baseAvailabilityZoneNode,
      parameters: {
        ...baseAvailabilityZoneParameters,
        values: { awsAvailabilityZone: "unknown" }
      }
    })
  ) as DiagramNode;

  assert.equal(
    getAvailabilityZoneNodeAwsAvailabilityZone({
      ...baseAvailabilityZoneNode,
      parameters: {
        ...baseAvailabilityZoneParameters,
        values: { awsAvailabilityZone: "eu-central-1c" }
      }
    }),
    "eu-central-1c"
  );

  assert.equal(
    getAvailabilityZoneNodeAwsAvailabilityZone(persistedNodeWithUnknownAz),
    "ap-northeast-2a"
  );
  assert.equal(
    getAvailabilityZoneNodeAwsAvailabilityZone(baseAvailabilityZoneNode),
    "ap-northeast-2a"
  );
});

test("createAvailabilityZoneNodeParameters preserves existing values while updating awsAvailabilityZone", () => {
  assert.deepEqual(
    createAvailabilityZoneNodeParameters(baseAvailabilityZoneNode, "us-west-2b"),
    {
      ...baseAvailabilityZoneParameters,
      values: {
        awsAvailabilityZone: "us-west-2b"
      }
    }
  );
});
