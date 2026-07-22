import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AWS_IMPORT_READERS,
  createAwsImportReadPolicyDocument,
  getAwsImportPolicyFingerprint
} from "./aws-import-access-catalog.js";

test("import catalog produces the read-only policy Task 4 gateway and probes will share", () => {
  const catalogActions = AWS_IMPORT_READERS.flatMap((reader) => reader.actions);
  const normalizedActions = [...new Set(catalogActions)].sort();
  const policy = createAwsImportReadPolicyDocument();

  assert.equal(policy.Statement.length, 1);
  assert.deepEqual([...policy.Statement[0]!.Action].sort(), normalizedActions);
  assert.equal(policy.Statement[0]!.Effect, "Allow");
  assert.equal(policy.Statement[0]!.Resource, "*");
  assert(
    catalogActions.every((action) => /^(?:Describe|Get|GET|List|Search)/u.test(action.split(":")[1] ?? ""))
  );
  assert.doesNotMatch(
    JSON.stringify(policy),
    /"[^"]*:(?:Create|Update|Put|Delete|Attach|Detach|PassRole)/u
  );
});

test("import policy fingerprint addresses the exact deterministic document", () => {
  const policy = createAwsImportReadPolicyDocument();
  const expected = createHash("sha256").update(JSON.stringify(policy)).digest("hex");

  assert.equal(getAwsImportPolicyFingerprint(), expected);
  assert.match(expected, /^[a-f0-9]{64}$/u);
  assert.equal(getAwsImportPolicyFingerprint(), getAwsImportPolicyFingerprint());
});

test("EventBridge import reader는 Rule과 Target을 읽는 최소 권한만 요청한다", () => {
  const reader = AWS_IMPORT_READERS.find((candidate) => candidate.serviceKey === "eventbridge");

  assert.equal(reader?.displayName, "EventBridge");
  assert.equal(reader?.tier, "expanded");
  assert.deepEqual(reader?.actions, [
    "events:ListEventBuses",
    "events:ListRules",
    "events:ListTargetsByRule",
    "events:ListTagsForResource"
  ]);
  assert.doesNotMatch(
    JSON.stringify(reader),
    /Create|Put|Delete|events:(?:TagResource|UntagResource)/u
  );
});

test("데모 토폴로지 reader는 필요한 metadata 읽기 권한만 요청한다", () => {
  const readers = new Map(AWS_IMPORT_READERS.map((reader) => [reader.serviceKey, reader]));

  assert.deepEqual(readers.get("ec2")?.actions.slice(-2), [
    "ec2:DescribeAddresses",
    "ec2:DescribeNatGateways"
  ]);
  assert.deepEqual(readers.get("elbv2")?.actions, [
    "elasticloadbalancing:DescribeLoadBalancers",
    "elasticloadbalancing:DescribeLoadBalancerAttributes",
    "elasticloadbalancing:DescribeTargetGroups",
    "elasticloadbalancing:DescribeTargetGroupAttributes",
    "elasticloadbalancing:DescribeListeners",
    "elasticloadbalancing:DescribeListenerAttributes",
    "elasticloadbalancing:DescribeListenerCertificates",
    "elasticloadbalancing:DescribeTags"
  ]);
  assert.deepEqual(readers.get("cloudfront")?.actions, [
    "cloudfront:ListDistributions",
    "cloudfront:ListTagsForResource",
    "cloudfront:ListOriginAccessControls",
    "cloudfront:GetOriginAccessControl"
  ]);
  assert.deepEqual(readers.get("ecr")?.actions, [
    "ecr:DescribeRepositories",
    "ecr:ListTagsForResource"
  ]);
  assert.deepEqual(readers.get("secretsmanager")?.actions, [
    "secretsmanager:ListSecrets",
    "secretsmanager:DescribeSecret"
  ]);
  assert.deepEqual(readers.get("application-autoscaling")?.actions, [
    "application-autoscaling:DescribeScalableTargets",
    "application-autoscaling:DescribeScalingPolicies",
    "application-autoscaling:ListTagsForResource"
  ]);
  assert.deepEqual(readers.get("cloudwatch")?.actions, [
    "cloudwatch:DescribeAlarms",
    "cloudwatch:ListTagsForResource"
  ]);
  assert.deepEqual(readers.get("logs")?.actions, [
    "logs:DescribeLogGroups",
    "logs:ListTagsForResource"
  ]);
  assert.deepEqual(readers.get("iam")?.actions, [
    "iam:ListRoles",
    "iam:ListPolicies",
    "iam:ListInstanceProfiles",
    "iam:ListAttachedRolePolicies"
  ]);
  assert.equal(readers.get("ecr")?.tier, "expanded");
  assert.equal(readers.get("secretsmanager")?.tier, "expanded");
  assert.equal(readers.get("application-autoscaling")?.tier, "expanded");
  assert.doesNotMatch(
    JSON.stringify([...readers.values()]),
    /GetSecretValue|Create|Update|Put|Delete|TagResource|UntagResource/u
  );
});
