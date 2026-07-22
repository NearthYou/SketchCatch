import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createAwsImportReadPolicyDocument } from "./aws-import-access-catalog.js";
import {
  AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION,
  AWS_IMPORT_POLICY_CONTRACT_VERSION,
  createAwsImportPolicyContract
} from "./aws-import-access-policy-template.js";
import { createAwsImportTemplateObjectKey } from "./aws-connection-template-storage.js";

const connectionFixture = {
  connectionId: "11111111-2222-4333-8444-555555555555",
  accountId: "123456789012",
  region: "ap-northeast-2",
  targetRoleArn:
    "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-11111111",
  templateBucketName: "sketchcatch-private-templates"
} as const;

const issuedV1Actions = [
  "apigateway:GET",
  "cloudfront:ListDistributions",
  "cloudwatch:DescribeAlarms",
  "ec2:DescribeImages",
  "ec2:DescribeInstances",
  "ec2:DescribeInternetGateways",
  "ec2:DescribeRouteTables",
  "ec2:DescribeSecurityGroups",
  "ec2:DescribeSubnets",
  "ec2:DescribeVpcs",
  "ecs:DescribeClusters",
  "ecs:DescribeServices",
  "ecs:DescribeTaskDefinition",
  "ecs:ListClusters",
  "ecs:ListServices",
  "elasticloadbalancing:DescribeLoadBalancers",
  "iam:ListInstanceProfiles",
  "iam:ListPolicies",
  "iam:ListRoles",
  "kms:DescribeKey",
  "kms:ListKeys",
  "lambda:GetPolicy",
  "lambda:ListFunctions",
  "logs:DescribeLogGroups",
  "rds:DescribeDBInstances",
  "resource-explorer-2:GetDefaultView",
  "resource-explorer-2:GetView",
  "resource-explorer-2:Search",
  "s3:GetBucketLocation",
  "s3:GetBucketPolicyStatus",
  "s3:GetBucketPublicAccessBlock",
  "s3:GetBucketTagging",
  "s3:GetBucketVersioning",
  "s3:GetBucketWebsite",
  "s3:GetEncryptionConfiguration",
  "s3:ListAllMyBuckets",
  "tag:GetResources"
] as const;

const issuedV2Actions = [
  ...issuedV1Actions,
  "events:ListRules",
  "events:ListTargetsByRule"
].sort();

const issuedV3Actions = [
  ...issuedV2Actions,
  "application-autoscaling:DescribeScalableTargets",
  "application-autoscaling:DescribeScalingPolicies",
  "cloudfront:GetOriginAccessControl",
  "cloudfront:ListOriginAccessControls",
  "ec2:DescribeAddresses",
  "ec2:DescribeNatGateways",
  "ecr:DescribeRepositories",
  "ecr:ListTagsForResource",
  "elasticloadbalancing:DescribeListeners",
  "elasticloadbalancing:DescribeTargetGroups",
  "events:ListTagsForResource",
  "secretsmanager:DescribeSecret",
  "secretsmanager:ListSecrets"
].sort();

const issuedV4Actions = [
  ...issuedV3Actions,
  "events:ListEventBuses"
].sort();

test("Policy contract v5는 Role 연결 관계 읽기만 추가하고 발급된 v1-v4 권한은 보존한다", () => {
  assert.equal(AWS_IMPORT_POLICY_CONTRACT_VERSION, "5");
  assert.deepEqual(Object.keys(AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["1"], issuedV1Actions);
  assert.deepEqual(
    [...AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["2"]].sort(),
    issuedV2Actions
  );
  assert.deepEqual(
    [...AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["3"]].sort(),
    issuedV3Actions
  );
  assert.deepEqual(
    [...AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["4"]].sort(),
    issuedV4Actions
  );
  assert.deepEqual(
    [...AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["5"]].sort(),
    [...createAwsImportReadPolicyDocument().Statement[0].Action].sort()
  );
  assert.deepEqual(
    AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["5"]
      .filter((action) => !issuedV4Actions.includes(action))
      .sort(),
    ["iam:ListAttachedRolePolicies"]
  );
  assert.doesNotMatch(
    JSON.stringify(AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["5"]),
    /GetSecretValue|Create|Update|Put|Delete|TagResource|UntagResource/u
  );
});

test("policy template owns only one read ManagedPolicy attached to the existing Role", () => {
  const contract = createAwsImportPolicyContract(connectionFixture);
  const template = JSON.parse(contract.templateBody) as {
    Resources: Record<string, { Type: string; Properties: Record<string, unknown> }>;
  };

  assert.deepEqual(Object.keys(template.Resources), ["ImportReadManagedPolicy"]);
  assert.equal(template.Resources.ImportReadManagedPolicy!.Type, "AWS::IAM::ManagedPolicy");
  assert.deepEqual(template.Resources.ImportReadManagedPolicy!.Properties.Roles, [
    "SketchCatchTerraformExecutionRole-11111111"
  ]);
  assert.deepEqual(
    template.Resources.ImportReadManagedPolicy!.Properties.PolicyDocument,
    createAwsImportReadPolicyDocument()
  );
  assert.doesNotMatch(contract.templateBody, /AWS::IAM::Role|Create|Update|Put|Delete|PassRole/u);
});

test("policy template contract is deterministic, immutable, and hash-verifiable", () => {
  const first = createAwsImportPolicyContract(connectionFixture);
  const second = createAwsImportPolicyContract(connectionFixture);
  const expectedHash = createHash("sha256").update(first.templateBody).digest("hex");

  assert.deepEqual(first, second);
  assert.equal(first.templateSha256, expectedHash);
  assert.equal(
    first.templateObjectKey,
    createAwsImportTemplateObjectKey({
      connectionId: connectionFixture.connectionId,
      kind: "policy",
      contractVersion: first.contractVersion,
      sha256: expectedHash
    })
  );
  assert(first.templateObjectKey.endsWith(`/${expectedHash}.json`));
  assert(first.templateBaseUrl.endsWith(`/${first.templateObjectKey}`));
  assert.equal(first.postVerification.templateSha256, expectedHash);
  assert.equal(first.postVerification.policyFingerprint, first.policyFingerprint);
  assert.equal(first.postVerification.targetRoleArn, connectionFixture.targetRoleArn);
  assert.equal(first.contractVersion, "5");
  assert.equal(first.postVerification.contractVersion, "5");
});
