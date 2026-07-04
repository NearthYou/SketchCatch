import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, DiagramNodeParameters } from "../../../../packages/types/src";
import {
  createRegionNodeParameters,
  getRegionNodeAwsRegion,
  isRegionDesignNode
} from "./region-node-metadata";

const baseRegionParameters: DiagramNodeParameters = {
  resourceType: "aws_region",
  resourceName: "region",
  fileName: "main",
  values: {}
};

const baseRegionNode: DiagramNode = {
  id: "node-region",
  type: "aws_region",
  kind: "resource",
  position: { x: 0, y: 0 },
  size: { width: 480, height: 320 },
  label: "Region",
  locked: false,
  zIndex: 1,
  parameters: baseRegionParameters
};

test("isRegionDesignNode matches Region area resource and legacy design node types only", () => {
  assert.equal(isRegionDesignNode(baseRegionNode), true);
  assert.equal(
    isRegionDesignNode({ ...baseRegionNode, type: "design_region", kind: "design", parameters: undefined }),
    true
  );
  assert.equal(
    isRegionDesignNode({ ...baseRegionNode, type: "sketchcatch_group", kind: "design", parameters: undefined }),
    false
  );
  assert.equal(
    isRegionDesignNode({
      ...baseRegionNode,
      type: "aws_vpc",
      parameters: {
        ...baseRegionParameters,
        resourceType: "aws_vpc"
      }
    }),
    false
  );
});

test("getRegionNodeAwsRegion reads a valid selected region and falls back to Seoul", () => {
  const persistedNodeWithUnknownRegion = JSON.parse(
    JSON.stringify({
      ...baseRegionNode,
      parameters: {
        ...baseRegionParameters,
        values: { awsRegion: "af-south-1" }
      }
    })
  ) as DiagramNode;

  assert.equal(
    getRegionNodeAwsRegion({
      ...baseRegionNode,
      parameters: {
        ...baseRegionParameters,
        values: { awsRegion: "eu-central-1" }
      }
    }),
    "eu-central-1"
  );

  assert.equal(getRegionNodeAwsRegion(persistedNodeWithUnknownRegion), "ap-northeast-2");
  assert.equal(getRegionNodeAwsRegion(baseRegionNode), "ap-northeast-2");
});

test("createRegionNodeParameters preserves existing values while updating awsRegion", () => {
  assert.deepEqual(
    createRegionNodeParameters(baseRegionNode, "us-west-2"),
    {
      ...baseRegionParameters,
      values: {
        awsRegion: "us-west-2"
      }
    }
  );
});
