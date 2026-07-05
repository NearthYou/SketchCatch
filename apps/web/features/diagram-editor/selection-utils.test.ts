import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";
import {
  canStartAreaBlankDrag,
  getSingleSelectedEdgeForToolbar,
  normalizeSelectedNodeIds
} from "./selection-utils";

const originEdge: DiagramEdge = {
  id: "cloudfront-to-s3",
  sourceNodeId: "cloudfront-site",
  targetNodeId: "s3-site",
  label: "origin",
  type: "smoothstep"
};

test("getSingleSelectedEdgeForToolbar returns an edge only for edge-only selection", () => {
  assert.equal(
    getSingleSelectedEdgeForToolbar([originEdge], [], ["cloudfront-to-s3"]),
    originEdge
  );
});

test("getSingleSelectedEdgeForToolbar hides the edge toolbar during node lasso selection", () => {
  assert.equal(
    getSingleSelectedEdgeForToolbar([originEdge], ["s3-site", "cloudfront-site"], ["cloudfront-to-s3"]),
    null
  );
});

test("getSingleSelectedEdgeForToolbar ignores missing or multi-edge selections", () => {
  assert.equal(getSingleSelectedEdgeForToolbar([originEdge], [], ["missing-edge"]), null);
  assert.equal(
    getSingleSelectedEdgeForToolbar(
      [originEdge, { ...originEdge, id: "second-edge" }],
      [],
      ["cloudfront-to-s3", "second-edge"]
    ),
    null
  );
});

const baseNode: DiagramNode = {
  id: "node",
  type: "aws_instance",
  kind: "resource",
  label: "Node",
  position: { x: 0, y: 0 },
  size: { width: 120, height: 120 },
  locked: false,
  zIndex: 0
};

test("normalizeSelectedNodeIds keeps a single area node selection", () => {
  const vpcNode: DiagramNode = {
    ...baseNode,
    id: "vpc",
    type: "aws_vpc",
    parameters: { resourceType: "aws_vpc", resourceName: "vpc", fileName: "main", values: {} }
  };

  assert.deepEqual(normalizeSelectedNodeIds([vpcNode], ["vpc"]), ["vpc"]);
});

test("normalizeSelectedNodeIds removes area nodes from mixed lasso selection", () => {
  const nodes: DiagramNode[] = [
    {
      ...baseNode,
      id: "vpc",
      type: "aws_vpc",
      parameters: { resourceType: "aws_vpc", resourceName: "vpc", fileName: "main", values: {} }
    },
    { ...baseNode, id: "ec2-instance" },
    { ...baseNode, id: "s3-site", type: "aws_s3_bucket" }
  ];

  assert.deepEqual(
    normalizeSelectedNodeIds(nodes, ["vpc", "ec2-instance", "s3-site"]),
    ["ec2-instance", "s3-site"]
  );
});

test("normalizeSelectedNodeIds keeps multiple area nodes selected for marquee deletion", () => {
  const nodes: DiagramNode[] = [
    {
      ...baseNode,
      id: "vpc",
      type: "aws_vpc",
      parameters: { resourceType: "aws_vpc", resourceName: "vpc", fileName: "main", values: {} }
    },
    {
      ...baseNode,
      id: "subnet",
      type: "aws_subnet",
      parameters: { resourceType: "aws_subnet", resourceName: "subnet", fileName: "main", values: {} }
    }
  ];

  assert.deepEqual(normalizeSelectedNodeIds(nodes, ["vpc", "subnet"]), ["vpc", "subnet"]);
});

test("canStartAreaBlankDrag only allows dragging the single selected area", () => {
  assert.equal(canStartAreaBlankDrag("sg-app", []), false);
  assert.equal(canStartAreaBlankDrag("sg-app", ["sg-db"]), false);
  assert.equal(canStartAreaBlankDrag("sg-app", ["sg-app", "sg-db"]), false);
  assert.equal(canStartAreaBlankDrag("sg-app", ["sg-app"]), true);
});
