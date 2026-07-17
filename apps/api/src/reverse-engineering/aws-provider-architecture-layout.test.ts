import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource } from "@sketchcatch/types";
import { createReverseEngineeringArchitectureJson } from "./aws-provider-architecture-layout.js";

function createReviewOnlyFixture(): DiscoveredResource[] {
  return [
    {
      id: "vpc-1",
      provider: "aws",
      providerResourceType: "AWS::EC2::VPC",
      providerResourceId: "vpc-0123456789abcdef0",
      region: "ap-northeast-2",
      displayName: "Production VPC",
      resourceType: "VPC",
      config: {}
    },
    {
      id: "lambda-1",
      provider: "aws",
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
      region: "ap-northeast-2",
      displayName: "orders-handler",
      resourceType: "UNKNOWN",
      config: {},
      relationships: [{ type: "connects_to", targetResourceId: "vpc-1", label: "uses" }]
    },
    {
      id: "iam-role-1",
      provider: "aws",
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/read-only",
      region: "ap-northeast-2",
      displayName: "read-only",
      resourceType: "UNKNOWN",
      config: {},
      relationships: []
    }
  ];
}

test("관계가 있는 검토 전용 Lambda는 VPC와 관계선을 보드에 남기고 관계 없는 IAM Role은 제외한다", () => {
  const architectureJson = createReverseEngineeringArchitectureJson(createReviewOnlyFixture());

  assert.deepEqual(
    architectureJson.nodes.map((node) => node.id),
    ["vpc-1", "lambda-1"]
  );
  assert.deepEqual(architectureJson.edges, [
    { id: "edge-lambda-1-vpc-1-uses", sourceId: "vpc-1", targetId: "lambda-1", label: "uses" }
  ]);
});
