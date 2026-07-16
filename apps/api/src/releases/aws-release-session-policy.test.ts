import assert from "node:assert/strict";
import test from "node:test";
import {
  createEcsDeployReleaseSessionPolicy,
  createFrontendDeployReleaseSessionPolicy,
  createReadOnlyReleaseSessionPolicy,
  type AwsReleaseRuntimeCoordinates
} from "./aws-release-session-policy.js";

const coordinates: AwsReleaseRuntimeCoordinates = {
  accountId: "123456789012",
  region: "ap-northeast-2",
  ecrRepositoryArn:
    "arn:aws:ecr:ap-northeast-2:123456789012:repository/demo-api",
  ecsClusterArn: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/demo",
  ecsServiceArn: "arn:aws:ecs:ap-northeast-2:123456789012:service/demo/demo-api",
  targetGroupArn:
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/abc",
  frontendBucketName: "demo-web",
  cloudFrontDistributionId: "E123456",
  taskRoleArn: "arn:aws:iam::123456789012:role/demo-task",
  executionRoleArn: "arn:aws:iam::123456789012:role/demo-execution"
};

test("ECS deploy session policy limits mutation coordinates", () => {
  const policy = JSON.parse(createEcsDeployReleaseSessionPolicy(coordinates)) as {
    Statement: Array<Record<string, unknown>>;
  };
  const publish = policy.Statement.find(
    (statement) =>
      Array.isArray(statement["Action"]) &&
      (statement["Action"] as string[]).includes("ecr:PutImage")
  );
  const passRole = policy.Statement.find(
    (statement) => statement["Action"] === "iam:PassRole"
  );
  const activateService = policy.Statement.find(
    (statement) => statement["Action"] === "ecs:UpdateService"
  );
  const authorizationToken = policy.Statement.find(
    (statement) => statement["Action"] === "ecr:GetAuthorizationToken"
  );
  const verifyEcs = policy.Statement.find(
    (statement) =>
      Array.isArray(statement["Action"]) &&
      (statement["Action"] as string[]).includes("ecs:DescribeTasks")
  );
  const verifyTargets = policy.Statement.find(
    (statement) =>
      Array.isArray(statement["Action"]) &&
      (statement["Action"] as string[]).includes("elasticloadbalancing:DescribeTargetHealth")
  );
  const tagTaskDefinition = policy.Statement.find(
    (statement) => statement["Action"] === "ecs:TagResource"
  );

  assert.equal(publish?.["Resource"], coordinates.ecrRepositoryArn);
  assert.equal(activateService?.["Resource"], coordinates.ecsServiceArn);
  assert.equal(authorizationToken?.["Resource"], "*");
  assert.equal(verifyEcs?.["Resource"], "*");
  assert.equal(verifyTargets?.["Resource"], "*");
  assert.match(JSON.stringify(tagTaskDefinition?.["Condition"]), /RegisterTaskDefinition/u);
  assert.deepEqual(passRole?.["Resource"], [coordinates.taskRoleArn, coordinates.executionRoleArn]);
  assert.match(JSON.stringify(passRole?.["Condition"]), /ecs-tasks\.amazonaws\.com/u);
});

test("split deploy policies stay within the STS inline-session limit for maximum valid names", () => {
  const maximumCoordinates = {
    ...coordinates,
    ecrRepositoryArn: `arn:aws:ecr:ap-northeast-2:123456789012:repository/${"e".repeat(256)}`,
    ecsClusterArn: `arn:aws:ecs:ap-northeast-2:123456789012:cluster/${"c".repeat(255)}`,
    ecsServiceArn: `arn:aws:ecs:ap-northeast-2:123456789012:service/${"c".repeat(255)}/${"s".repeat(255)}`,
    targetGroupArn: `arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/${"t".repeat(32)}/${"a".repeat(32)}`,
    frontendBucketName: "b".repeat(63),
    taskRoleArn: `arn:aws:iam::123456789012:role/${"r".repeat(64)}`,
    executionRoleArn: `arn:aws:iam::123456789012:role/${"x".repeat(64)}`
  };
  const ecsPolicy = createEcsDeployReleaseSessionPolicy(maximumCoordinates);
  const frontendPolicy = createFrontendDeployReleaseSessionPolicy(maximumCoordinates);

  assert(ecsPolicy.length <= 2_048);
  assert(frontendPolicy.length <= 2_048);
});

test("frontend deploy policy is limited to the approved bucket and distribution", () => {
  const policy = JSON.parse(createFrontendDeployReleaseSessionPolicy(coordinates)) as {
    Statement: Array<Record<string, unknown>>;
  };
  assert.deepEqual(policy.Statement, [
    {
      Effect: "Allow",
      Action: "s3:PutObject",
      Resource: `arn:aws:s3:::${coordinates.frontendBucketName}/*`
    },
    {
      Effect: "Allow",
      Action: ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
      Resource: `arn:aws:cloudfront::${coordinates.accountId}:distribution/${coordinates.cloudFrontDistributionId}`
    }
  ]);
});

test("read-only verification policy contains no mutating release action", () => {
  const value = createReadOnlyReleaseSessionPolicy(coordinates);
  assert.doesNotMatch(value, /PutImage|UpdateService|PutObject|CreateInvalidation|PassRole/u);
  assert.match(value, /DescribeTargetHealth/u);
});
