import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createAwsImportReadPolicyDocument } from "./aws-import-access-catalog.js";
import { createAwsImportPolicyContract } from "./aws-import-access-policy-template.js";
import { createAwsImportTemplateObjectKey } from "./aws-connection-template-storage.js";

const connectionFixture = {
  connectionId: "11111111-2222-4333-8444-555555555555",
  accountId: "123456789012",
  region: "ap-northeast-2",
  targetRoleArn:
    "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-11111111",
  templateBucketName: "sketchcatch-private-templates"
} as const;

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
});
