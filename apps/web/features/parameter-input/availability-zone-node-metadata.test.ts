import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  createAvailabilityZoneNodeMetadata,
  getAvailabilityZoneNodeAwsAvailabilityZone,
  isAvailabilityZoneDesignNode
} from "./availability-zone-node-metadata";

const baseAvailabilityZoneNode: DiagramNode = {
  id: "node-az",
  type: "design_az",
  kind: "design",
  position: { x: 0, y: 0 },
  size: { width: 360, height: 240 },
  label: "Availability Zone",
  locked: false,
  zIndex: 1
};

test("isAvailabilityZoneDesignNode matches supported AZ design node types only", () => {
  assert.equal(isAvailabilityZoneDesignNode(baseAvailabilityZoneNode), true);
  assert.equal(
    isAvailabilityZoneDesignNode({ ...baseAvailabilityZoneNode, type: "sketchcatch_az" }),
    true
  );
  assert.equal(
    isAvailabilityZoneDesignNode({ ...baseAvailabilityZoneNode, type: "design_region" }),
    false
  );
  assert.equal(
    isAvailabilityZoneDesignNode({ ...baseAvailabilityZoneNode, kind: "resource" }),
    false
  );
});

test("getAvailabilityZoneNodeAwsAvailabilityZone reads a valid selected AZ and falls back to Seoul a", () => {
  const persistedNodeWithUnknownAz = JSON.parse(
    JSON.stringify({
      ...baseAvailabilityZoneNode,
      metadata: { awsAvailabilityZone: "unknown" }
    })
  ) as DiagramNode;

  assert.equal(
    getAvailabilityZoneNodeAwsAvailabilityZone({
      ...baseAvailabilityZoneNode,
      metadata: { awsAvailabilityZone: "eu-central-1c" }
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

test("createAvailabilityZoneNodeMetadata preserves existing metadata fields while updating awsAvailabilityZone", () => {
  assert.deepEqual(
    createAvailabilityZoneNodeMetadata(
      {
        ...baseAvailabilityZoneNode,
        metadata: {
          awsRegion: "ap-northeast-2",
          parentAreaNodeId: "region-1"
        }
      },
      "us-west-2b"
    ),
    {
      awsAvailabilityZone: "us-west-2b",
      awsRegion: "ap-northeast-2",
      parentAreaNodeId: "region-1"
    }
  );
});
