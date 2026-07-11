import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramNode } from "../../../../packages/types/src";

import { getResourceNodeDisplayLabel } from "./resource-node-display-label";

const baseNode = {
  label: "AMI",
  type: "aws_ami",
  parameters: {
    fileName: "main",
    resourceName: "ami_2",
    resourceType: "aws_ami",
    terraformBlockType: "data" as const,
    values: {}
  }
} satisfies Pick<DiagramNode, "label" | "parameters" | "type">;

test("uses an explicit diagram label and uppercases it", () => {
  const node = {
    ...baseNode,
    parameters: { ...baseNode.parameters, values: { diagramLabel: "Latest image" } }
  };
  assert.equal(getResourceNodeDisplayLabel(node), "LATEST IMAGE");
});

test("uppercases friendly labels without exposing Terraform uniqueness suffixes", () => {
  assert.equal(getResourceNodeDisplayLabel(baseNode), "AMI");
  assert.equal(getResourceNodeDisplayLabel({ ...baseNode, label: "API Gateway" }), "API GATEWAY");
  assert.equal(getResourceNodeDisplayLabel({ ...baseNode, label: "S3 Bucket" }), "S3 BUCKET");
});

test("falls back to the node type", () => {
  assert.equal(getResourceNodeDisplayLabel({ ...baseNode, label: "  " }), "AWS_AMI");
});
