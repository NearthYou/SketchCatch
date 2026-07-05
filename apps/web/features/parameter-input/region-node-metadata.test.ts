import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  createRegionNodeMetadata,
  getRegionNodeAwsRegion,
  isRegionDesignNode
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

test("isRegionDesignNode matches supported Region design node types only", () => {
  assert.equal(isRegionDesignNode(baseRegionNode), true);
  assert.equal(isRegionDesignNode({ ...baseRegionNode, type: "design_region" }), true);
  assert.equal(isRegionDesignNode({ ...baseRegionNode, type: "sketchcatch_group" }), false);
  assert.equal(isRegionDesignNode({ ...baseRegionNode, kind: "resource" }), false);
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

test("createRegionNodeMetadata no longer writes awsRegion metadata", () => {
  assert.deepEqual(
    createRegionNodeMetadata(
      {
        ...baseRegionNode,
        metadata: { parentAreaNodeId: "parent-1" }
      },
      "us-west-2"
    ),
    { parentAreaNodeId: "parent-1" }
  );
});
