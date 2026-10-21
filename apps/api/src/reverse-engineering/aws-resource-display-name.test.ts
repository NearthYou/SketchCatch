import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAwsResourceDisplayName,
  createAwsResourceDisplayNameMap
} from "./aws-resource-display-name.js";

test("keeps reader-provided ALB and Lambda names while their ARN IDs stay separate", () => {
  const albArn = "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders-alb/50dc6c495c0c9188";
  const lambdaArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:checkout";

  assert.equal(
    createAwsResourceDisplayName({
      displayName: "orders-alb",
      providerResourceId: albArn,
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer"
    }),
    "orders-alb"
  );
  assert.equal(
    createAwsResourceDisplayName({
      displayName: "checkout",
      providerResourceId: lambdaArn,
      providerResourceType: "AWS::Lambda::Function"
    }),
    "checkout"
  );
});

test("derives a readable IAM role name from an ARN instead of displaying the ARN", () => {
  const iamRoleArn = "arn:aws:iam::123456789012:role/service-role/very-long-production-role-name";

  assert.equal(
    createAwsResourceDisplayName({
      displayName: iamRoleArn,
      providerResourceId: iamRoleArn,
      providerResourceType: "AWS::IAM::Role"
    }),
    "very-long-production-role-name"
  );
});

test("uses a human-readable fallback for an ARN without a resource name", () => {
  const namelessArn = "arn:aws:iam::123456789012:role/";

  assert.equal(
    createAwsResourceDisplayName({
      displayName: "",
      providerResourceId: namelessArn,
      providerResourceType: "AWS::Resource"
    }),
    "AWS Resource · 2:role/"
  );
});

test("does not use untagged VPC and EC2 provider IDs as display names", () => {
  const vpcId = "vpc-0123456789abcdef0";
  const instanceId = "i-0123456789abcdef0";

  assert.equal(
    createAwsResourceDisplayName({
      displayName: vpcId,
      providerResourceId: vpcId,
      providerResourceType: "AWS::EC2::VPC"
    }),
    "AWS EC2 VPC · abcdef0"
  );
  assert.equal(
    createAwsResourceDisplayName({
      displayName: instanceId,
      providerResourceId: instanceId,
      providerResourceType: "AWS::EC2::Instance"
    }),
    "AWS EC2 Instance · abcdef0"
  );
});

test("untagged EIP/NAT IDs와 generic ARN을 짧은 이름으로 표시한다", () => {
  assert.equal(
    createAwsResourceDisplayName({
      displayName: "eipalloc-0123456789abcdef0",
      providerResourceId: "eipalloc-0123456789abcdef0",
      providerResourceType: "AWS::EC2::EIP"
    }),
    "AWS EC2 EIP · abcdef0"
  );
  assert.equal(
    createAwsResourceDisplayName({
      displayName:
        "arn:aws:ec2:ap-northeast-2:123456789012:natgateway/nat-0123456789abcdef0",
      providerResourceId:
        "arn:aws:ec2:ap-northeast-2:123456789012:natgateway/nat-0123456789abcdef0",
      providerResourceType: "AWS::EC2::NatGateway"
    }),
    "AWS EC2 NatGateway · abcdef0"
  );
});

test("distinguishes duplicate base names by the final seven original-ID characters", () => {
  const firstArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:checkout-abcdef1";
  const secondArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:checkout-abcdef2";
  const displayNames = createAwsResourceDisplayNameMap([
    {
      displayName: "checkout",
      providerResourceId: firstArn,
      providerResourceType: "AWS::Lambda::Function"
    },
    {
      displayName: "checkout",
      providerResourceId: secondArn,
      providerResourceType: "AWS::Lambda::Function"
    }
  ]);

  assert.equal(displayNames.get(firstArn), "checkout · abcdef1");
  assert.equal(displayNames.get(secondArn), "checkout · abcdef2");
});

test("shortens names beyond 42 characters to the first 34 characters and final seven", () => {
  const longName = `${"a".repeat(34)}0123456789`;

  assert.equal(
    createAwsResourceDisplayName({
      displayName: longName,
      providerResourceId: "arn:aws:s3:::orders-assets",
      providerResourceType: "AWS::S3::Bucket"
    }),
    `${"a".repeat(34)}…3456789`
  );
});
