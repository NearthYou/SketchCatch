import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  createAwsImportManagerContract,
  createAwsImportPolicyStackCreateInput,
  createAwsImportPolicyStackUpdateInput
} from "./aws-import-access-manager-template.js";
import { publishAwsImportCloudFormationTemplateToS3 } from "./aws-connection-template-storage.js";

const connectionFixture = {
  connectionId: "11111111-2222-4333-8444-555555555555",
  accountId: "123456789012",
  region: "ap-northeast-2",
  targetRoleArn:
    "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-11111111",
  templateBucketName: "sketchcatch-private-templates"
} as const;

const signedWindowClock = () => new Date("2026-07-19T12:05:00.000Z");

type PolicyStatement = {
  Sid: string;
  Effect: string;
  Action: string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
};

test("manager control policy is bound to one immutable policy template", () => {
  const contract = createAwsImportManagerContract(connectionFixture);
  const statements = contract.controlPolicyDocument.Statement as PolicyStatement[];
  const stackMutation = statements.find((statement) => statement.Sid === "ManageExactPolicyStack");
  const passRole = statements.find((statement) => statement.Sid === "PassExactServiceRole");
  const templateRead = statements.find((statement) => statement.Sid === "ReadExactPolicyTemplate");
  const text = JSON.stringify(contract.controlPolicyDocument);

  assert(stackMutation);
  assert.deepEqual(stackMutation.Action, [
    "cloudformation:CreateStack",
    "cloudformation:UpdateStack"
  ]);
  assert.equal(stackMutation.Resource, contract.policyStackArn);
  assert.deepEqual(
    stackMutation.Condition?.StringLike?.["cloudformation:TemplateUrl"],
    contract.policyTemplateUrlPatterns
  );
  assert(
    contract.policyTemplateUrlPatterns.every((pattern) =>
      pattern.startsWith(`${contract.policyTemplateBaseUrl}\${?}X-Amz-Algorithm=`)
    )
  );
  assert(
    contract.policyTemplateUrlPatterns.every(
      (pattern) => !pattern.startsWith(`${contract.policyTemplateBaseUrl}?X-Amz-Algorithm=`)
    )
  );
  assert.equal(
    stackMutation.Condition?.StringEquals?.["cloudformation:RoleArn"],
    contract.serviceRoleArn
  );
  assert.equal(
    stackMutation.Condition?.StringEquals?.["aws:RequestTag/SketchCatchConnectionId"],
    connectionFixture.connectionId
  );
  assert.deepEqual(stackMutation.Condition?.["ForAllValues:StringEquals"]?.["aws:TagKeys"], [
    "SketchCatchConnectionId",
    "SketchCatchImportContractVersion"
  ]);
  assert.equal(templateRead, undefined);
  assert(passRole);
  assert.deepEqual(passRole.Action, ["iam:PassRole"]);
  assert.equal(passRole.Resource, contract.serviceRoleArn);
  assert.equal(
    passRole.Condition?.StringEquals?.["iam:PassedToService"],
    "cloudformation.amazonaws.com"
  );
  assert.match(text, new RegExp(contract.policyStackArn.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.match(text, new RegExp(contract.policyTemplateBaseUrl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.match(text, new RegExp(contract.serviceRoleArn.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.doesNotMatch(text, /TemplateBody|ResourceTypes/u);
});

test("cross-region connection keeps Stack region separate from template storage region", () => {
  const contract = createAwsImportManagerContract({
    ...connectionFixture,
    region: "ap-northeast-1",
    templateStorageRegion: "ap-northeast-2"
  });

  assert.equal(contract.region, "ap-northeast-1");
  assert.equal(contract.templateStorageRegion, "ap-northeast-2");
  assert.match(contract.managerStackArn, /^arn:aws:cloudformation:ap-northeast-1:/u);
  assert.match(contract.policyStackArn, /^arn:aws:cloudformation:ap-northeast-1:/u);
  assert.match(contract.templateBaseUrl, /\.s3\.ap-northeast-2\.amazonaws\.com\//u);
  assert.match(contract.policyTemplateBaseUrl, /\.s3\.ap-northeast-2\.amazonaws\.com\//u);
});

test("policy stack create and update inputs accept only the internally published presigned template", async () => {
  const contract = createAwsImportManagerContract(connectionFixture);
  const published = await publishAwsImportCloudFormationTemplateToS3({
    bucketName: connectionFixture.templateBucketName,
    region: connectionFixture.region,
    connectionId: connectionFixture.connectionId,
    kind: "policy",
    contractVersion: contract.policyContractVersion,
    templateBody: contract.policyTemplateBody,
    expiresInSeconds: 600,
    now: signedWindowClock,
    s3Client: { async send() { return {}; } } as unknown as S3Client,
    signTemplateUrl: async ({ baseUrl }) => createValidPresignedUrl(baseUrl)
  });
  const createInput = createAwsImportPolicyStackCreateInput(contract, published, {
    now: signedWindowClock
  });
  const updateInput = createAwsImportPolicyStackUpdateInput(contract, published, {
    now: signedWindowClock
  });

  for (const input of [createInput, updateInput]) {
    assert.equal(input.StackName, contract.policyStackName);
    assert.equal(input.TemplateURL, published.templateUrl);
    assert.equal(input.RoleARN, contract.serviceRoleArn);
    assert.deepEqual(input.Capabilities, ["CAPABILITY_NAMED_IAM"]);
    assert.deepEqual(input.Tags, contract.ownershipTags);
    assert(!("TemplateBody" in input));
    assert(!("ResourceTypes" in input));
  }
});

test("policy stack update targets only the exact approved Stack ID", async () => {
  const contract = createAwsImportManagerContract(connectionFixture);
  const published = await publishAwsImportCloudFormationTemplateToS3({
    bucketName: connectionFixture.templateBucketName,
    region: connectionFixture.region,
    connectionId: connectionFixture.connectionId,
    kind: "policy",
    contractVersion: contract.policyContractVersion,
    templateBody: contract.policyTemplateBody,
    expiresInSeconds: 600,
    now: signedWindowClock,
    s3Client: { async send() { return {}; } } as unknown as S3Client,
    signTemplateUrl: async ({ baseUrl }) => createValidPresignedUrl(baseUrl)
  });
  const exactStackId = `${contract.policyStackArn.slice(0, -1)}existing-id`;

  const input = createAwsImportPolicyStackUpdateInput(
    contract,
    published,
    { now: signedWindowClock },
    undefined,
    exactStackId
  );

  assert.equal(input.StackName, exactStackId);
  assert.throws(
    () => createAwsImportPolicyStackUpdateInput(
      contract,
      published,
      { now: signedWindowClock },
      undefined,
      "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/foreign/id"
    ),
    /identity is invalid/u
  );
});

test("policy stack create and update reject an internally published expired URL", async () => {
  const contract = createAwsImportManagerContract(connectionFixture);
  const published = await publishAwsImportCloudFormationTemplateToS3({
    bucketName: connectionFixture.templateBucketName,
    region: connectionFixture.region,
    connectionId: connectionFixture.connectionId,
    kind: "policy",
    contractVersion: contract.policyContractVersion,
    templateBody: contract.policyTemplateBody,
    expiresInSeconds: 600,
    now: signedWindowClock,
    s3Client: { async send() { return {}; } } as unknown as S3Client,
    signTemplateUrl: async ({ baseUrl }) => createValidPresignedUrl(baseUrl)
  });
  const expiredClock = () => new Date("2026-07-19T12:10:00.000Z");

  assert.throws(
    () => createAwsImportPolicyStackCreateInput(contract, published, { now: expiredClock }),
    /expired/u
  );
  assert.throws(
    () => createAwsImportPolicyStackUpdateInput(contract, published, { now: expiredClock }),
    /expired/u
  );
});

test("manager template owns only the service Role and its control and cleanup Policies", () => {
  const contract = createAwsImportManagerContract(connectionFixture);
  const template = JSON.parse(contract.templateBody) as {
    Resources: Record<string, Record<string, unknown>>;
  };
  const serviceStatements = contract.serviceRolePolicyDocument.Statement as PolicyStatement[];
  const managePolicy = serviceStatements.find(
    (statement) => statement.Sid === "ManageExactReadManagedPolicy"
  );
  const manageAttachment = serviceStatements.find(
    (statement) => statement.Sid === "ManageExactTargetRoleAttachment"
  );
  const readAttachments = serviceStatements.find(
    (statement) => statement.Sid === "ReadExactTargetRoleAttachments"
  );
  const cleanupText = JSON.stringify(contract.cleanupVerificationPolicyDocument);
  const cleanupStatements = contract.cleanupVerificationPolicyDocument.Statement as PolicyStatement[];

  assert.deepEqual(Object.keys(template.Resources).sort(), [
    "CleanupVerificationPolicy",
    "CloudFormationServiceRole",
    "PolicyStackControlPolicy"
  ]);
  assert.equal(template.Resources.CloudFormationServiceRole?.Type, "AWS::IAM::Role");
  assert.equal(template.Resources.PolicyStackControlPolicy?.Type, "AWS::IAM::ManagedPolicy");
  assert.equal(template.Resources.CleanupVerificationPolicy?.Type, "AWS::IAM::ManagedPolicy");
  assert.equal(
    ((template.Resources.CloudFormationServiceRole?.Properties as Record<string, unknown>)
      .Policies as Array<Record<string, unknown>>)[0]?.PolicyName,
    contract.serviceRoleInlinePolicyName
  );
  assert.equal(template.Resources.CloudFormationServiceRole?.DependsOn, "CleanupVerificationPolicy");
  assert.equal(template.Resources.PolicyStackControlPolicy?.DependsOn, "CleanupVerificationPolicy");
  assert.deepEqual(
    template.Resources.CloudFormationServiceRole?.Properties &&
      (template.Resources.CloudFormationServiceRole.Properties as Record<string, unknown>)
        .AssumeRolePolicyDocument,
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "cloudformation.amazonaws.com" },
          Action: "sts:AssumeRole"
        }
      ]
    }
  );
  assert(
    serviceStatements.every((statement) => {
      const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
      return resources.every(
        (resource) => resource === contract.readManagedPolicyArn || resource === contract.targetRoleArn
      );
    })
  );
  assert.deepEqual(managePolicy, {
    Sid: "ManageExactReadManagedPolicy",
    Effect: "Allow",
    Action: [
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:DeletePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListEntitiesForPolicy",
      "iam:ListPolicyVersions"
    ],
    Resource: contract.readManagedPolicyArn
  });
  assert.deepEqual(manageAttachment, {
    Sid: "ManageExactTargetRoleAttachment",
    Effect: "Allow",
    Action: ["iam:AttachRolePolicy", "iam:DetachRolePolicy"],
    Resource: contract.targetRoleArn,
    Condition: {
      ArnEquals: {
        "iam:PolicyARN": contract.readManagedPolicyArn
      }
    }
  });
  assert.deepEqual(readAttachments, {
    Sid: "ReadExactTargetRoleAttachments",
    Effect: "Allow",
    Action: ["iam:ListAttachedRolePolicies"],
    Resource: contract.targetRoleArn
  });
  assert.doesNotMatch(JSON.stringify(contract.serviceRolePolicyDocument), /cloudformation:|s3:|Resource":"\*"/u);
  assert.doesNotMatch(cleanupText, /"iam:(?:Create|Update|Put|Delete|Attach|Detach|PassRole)/u);
  assert.match(cleanupText, new RegExp(contract.managerStackArn.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.match(cleanupText, new RegExp(contract.policyStackArn.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.deepEqual(
    cleanupStatements.find((statement) => statement.Sid === "ReadExactServiceRoleInlinePolicy"),
    {
      Sid: "ReadExactServiceRoleInlinePolicy",
      Effect: "Allow",
      Action: ["iam:ListRolePolicies", "iam:GetRolePolicy"],
      Resource: contract.serviceRoleArn
    }
  );
});

test("manager contract exposes immutable template and post-verification hashes", () => {
  const first = createAwsImportManagerContract(connectionFixture);
  const second = createAwsImportManagerContract(connectionFixture);
  const expectedHash = createHash("sha256").update(first.templateBody).digest("hex");

  assert.deepEqual(first, second);
  assert.equal(first.templateSha256, expectedHash);
  assert(first.templateObjectKey.endsWith(`/${expectedHash}.json`));
  assert(first.templateBaseUrl.endsWith(`/${first.templateObjectKey}`));
  assert.equal(first.postVerification.managerTemplateSha256, expectedHash);
  assert.equal(first.postVerification.policyTemplateSha256, first.policyTemplateSha256);
  assert.equal(first.postVerification.policyFingerprint, first.policyFingerprint);
  assert.equal(first.postVerification.targetRoleArn, first.targetRoleArn);
  assert.equal(first.postVerification.serviceRoleArn, first.serviceRoleArn);
});

// gg: request builder 검증에 pinned S3 signer의 query 모양을 사용합니다.
function createValidPresignedUrl(baseUrl: string): string {
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": "AKIDEXAMPLE/20260719/ap-northeast-2/s3/aws4_request",
    "X-Amz-Date": "20260719T120000Z",
    "X-Amz-Expires": "600",
    "X-Amz-Signature": "b".repeat(64),
    "X-Amz-SignedHeaders": "host",
    "x-amz-checksum-mode": "ENABLED",
    "x-id": "GetObject"
  });
  return `${baseUrl}?${params.toString()}`;
}
