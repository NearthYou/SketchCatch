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

test("ALB는 VPC 상위 서비스로, CloudFront는 global edge 영역의 supported 카드로 배치한다", () => {
  const architectureJson = createReverseEngineeringArchitectureJson([
    {
      id: "vpc-1",
      provider: "aws",
      providerResourceType: "AWS::EC2::VPC",
      providerResourceId: "vpc-1",
      region: "ap-northeast-2",
      displayName: "Main VPC",
      resourceType: "VPC",
      config: {}
    },
    {
      id: "subnet-a",
      provider: "aws",
      providerResourceType: "AWS::EC2::Subnet",
      providerResourceId: "subnet-a",
      region: "ap-northeast-2",
      displayName: "Public A",
      resourceType: "SUBNET",
      config: { vpcId: "vpc-1" },
      relationships: [{ type: "contains", targetResourceId: "vpc-1" }]
    },
    {
      id: "sg-alb",
      provider: "aws",
      providerResourceType: "AWS::EC2::SecurityGroup",
      providerResourceId: "sg-alb",
      region: "ap-northeast-2",
      displayName: "ALB SG",
      resourceType: "SECURITY_GROUP",
      config: { vpcId: "vpc-1" },
      relationships: [{ type: "depends_on", targetResourceId: "vpc-1" }]
    },
    {
      id: "alb-1",
      provider: "aws",
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
      region: "ap-northeast-2",
      displayName: "orders",
      resourceType: "LOAD_BALANCER",
      config: { vpcId: "vpc-1", securityGroupIds: ["sg-alb"], subnetIds: ["subnet-a"] },
      relationships: [
        { type: "depends_on", targetResourceId: "vpc-1" },
        { type: "connects_to", targetResourceId: "sg-alb" }
      ]
    },
    {
      id: "cloudfront-1",
      provider: "aws",
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
      region: "global",
      displayName: "d111111abcdef8.cloudfront.net",
      resourceType: "CLOUDFRONT",
      config: { id: "EDISTRIBUTION" },
      relationships: [{ type: "depends_on", targetResourceId: "alb-1" }]
    }
  ]);
  const nodeById = new Map(architectureJson.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get("alb-1")?.config["analysisExcluded"], false);
  assert.equal(nodeById.get("cloudfront-1")?.config["analysisExcluded"], false);
  assert.equal(nodeById.get("alb-1")?.positionY, 240);
  assert.ok((nodeById.get("cloudfront-1")?.positionY ?? Infinity) < (nodeById.get("vpc-1")?.positionY ?? 0));
  assert.deepEqual(
    architectureJson.edges.map((edge) => [edge.sourceId, edge.targetId]),
    [
      ["vpc-1", "subnet-a"],
      ["vpc-1", "sg-alb"],
      ["vpc-1", "alb-1"],
      ["sg-alb", "alb-1"],
      ["alb-1", "cloudfront-1"]
    ]
  );
});
