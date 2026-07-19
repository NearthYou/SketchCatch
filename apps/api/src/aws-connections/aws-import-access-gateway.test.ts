import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CreateStackCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
  UpdateStackCommand
} from "@aws-sdk/client-cloudformation";
import {
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand
} from "@aws-sdk/client-iam";
import type { S3Client } from "@aws-sdk/client-s3";
import { publishAwsImportCloudFormationTemplateToS3 } from "./aws-connection-template-storage.js";
import { createAwsImportReadPolicyDocument } from "./aws-import-access-catalog.js";
import { createAwsImportManagerContract } from "./aws-import-access-manager-template.js";
import { createAwsImportAccessGateway } from "./aws-import-access-gateway.js";

const connection = {
  id: "11111111-2222-4333-8444-555555555555",
  userId: "owner-user",
  accountId: "123456789012",
  roleArn:
    "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-11111111",
  externalId: "external-id",
  region: "ap-northeast-2",
  status: "verified",
  lastVerifiedAt: new Date("2026-07-19T00:00:00.000Z"),
  deletionStartedAt: null,
  deletionErrorSummary: null,
  createdAt: new Date("2026-07-19T00:00:00.000Z"),
  updatedAt: new Date("2026-07-19T00:00:00.000Z")
} as const;
const contract = createAwsImportManagerContract({
  connectionId: connection.id,
  accountId: connection.accountId,
  region: connection.region,
  targetRoleArn: connection.roleArn,
  templateBucketName: "sketchcatch-private-templates"
});

test("policy stack creation uses only Task 2 exact request builders", async () => {
  const commands: unknown[] = [];
  const gateway = createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send(command: unknown) {
        commands.push(command);
        if (command instanceof DescribeStacksCommand) {
          throw Object.assign(new Error("not found"), { name: "ValidationError" });
        }
        if (command instanceof CreateStackCommand) {
          return { StackId: "policy-stack-id" };
        }
        return {};
      }
    }),
    assumeConnectionRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    publishTemplate: async (input) => publishAwsImportCloudFormationTemplateToS3({
      ...input,
      s3Client: { async send() { return {}; } } as unknown as S3Client,
      signTemplateUrl: async ({ baseUrl }) => createPresignedUrl(baseUrl)
    }),
    now: () => new Date("2026-07-19T12:05:00.000Z")
  });

  const operationId = "33333333-3333-4333-8333-333333333333";
  await gateway.createOrUpdatePolicyStack({ connection, contract, operationId });

  const mutation = commands.find((command) => command instanceof CreateStackCommand);
  assert(mutation instanceof CreateStackCommand);
  assert.deepEqual(mutation.input, {
    StackName: contract.policyStackName,
    TemplateURL: createPresignedUrl(contract.policyTemplateBaseUrl),
    RoleARN: contract.serviceRoleArn,
    Capabilities: ["CAPABILITY_NAMED_IAM"],
    Tags: contract.ownershipTags,
    ClientRequestToken: operationId
  });
  assert(!("TemplateBody" in mutation.input));
  assert(!("ResourceTypes" in mutation.input));
});

test("manager preparation returns the exact CloudFormation Quick Create URL", async () => {
  const gateway = createAwsImportAccessGateway({
    publishTemplate: async () => ({
      templateUrl: "https://private.example/template?X-Amz-Signature=secret"
    }) as never
  });

  const result = await gateway.prepareManager({ connection, contract });

  assert.equal(
    result.consoleUrl,
    "https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-2#/stacks/quickcreate?" +
      "templateURL=https%3A%2F%2Fprivate.example%2Ftemplate%3FX-Amz-Signature%3Dsecret&" +
      `stackName=${contract.managerStackName}&capabilities=CAPABILITY_NAMED_IAM`
  );
});

test("manager inspection checks exact template hash, tags and outputs", async () => {
  const commands: unknown[] = [];
  const gateway = createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send(command: unknown) {
        commands.push(command);
        if (command instanceof DescribeStacksCommand) {
          if (command.input.StackName === contract.policyStackName) {
            return {
              Stacks: [{
                StackId: "policy-stack-id",
                StackName: contract.policyStackName,
                StackStatus: "CREATE_COMPLETE",
                Tags: contract.ownershipTags,
                Outputs: Object.entries({
                  SketchCatchConnectionId: contract.connectionId,
                  TemplateContractVersion: contract.policyContractVersion,
                  TargetRoleArn: contract.targetRoleArn,
                  ReadManagedPolicyArn: contract.readManagedPolicyArn,
                  PolicyFingerprint: contract.policyFingerprint
                }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
              }]
            };
          }
          return {
            Stacks: [{
              StackId: "manager-stack-id",
              StackName: contract.managerStackName,
              StackStatus: "CREATE_COMPLETE",
              Tags: contract.ownershipTags,
              Outputs: Object.entries({
                SketchCatchConnectionId: contract.connectionId,
                TemplateContractVersion: contract.contractVersion,
                TargetRoleArn: contract.targetRoleArn,
                CloudFormationServiceRoleArn: contract.serviceRoleArn,
                PolicyStackName: contract.policyStackName,
                PolicyStackArnPattern: contract.policyStackArn,
                PolicyTemplateSha256: contract.policyTemplateSha256,
                PolicyFingerprint: contract.policyFingerprint,
                ControlPolicyArn: contract.controlPolicyArn,
                CleanupVerificationPolicyArn: contract.cleanupVerificationPolicyArn
              }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
            }]
          };
        }
        if (command instanceof GetTemplateCommand) {
          return {
            TemplateBody: command.input.StackName === "policy-stack-id"
              ? contract.policyTemplateBody
              : contract.templateBody
          };
        }
        return {};
      }
    }),
    createIamClient: () => ({
      async send(command: unknown) {
        commands.push(command);
        if (command instanceof GetRoleCommand) {
          return {
            Role: {
              AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                  Effect: "Allow",
                  Principal: { Service: "cloudformation.amazonaws.com" },
                  Action: "sts:AssumeRole"
                }]
              }))
            }
          };
        }
        if (command instanceof GetRolePolicyCommand) {
          return {
            PolicyDocument: encodeURIComponent(JSON.stringify(contract.serviceRolePolicyDocument))
          };
        }
        if (command instanceof ListRolePoliciesCommand) {
          return { PolicyNames: [contract.serviceRoleInlinePolicyName] };
        }
        if (command instanceof ListAttachedRolePoliciesCommand) {
          return {
            AttachedPolicies: [
              { PolicyArn: "arn:aws:iam::123456789012:policy/existing-deployment-policy" },
              { PolicyArn: contract.controlPolicyArn },
              { PolicyArn: contract.cleanupVerificationPolicyArn },
              { PolicyArn: contract.readManagedPolicyArn }
            ]
          };
        }
        if (command instanceof GetPolicyCommand) {
          return { Policy: { DefaultVersionId: "v1" } };
        }
        if (command instanceof GetPolicyVersionCommand) {
          const document = command.input.PolicyArn === contract.controlPolicyArn
            ? contract.controlPolicyDocument
            : command.input.PolicyArn === contract.cleanupVerificationPolicyArn
              ? contract.cleanupVerificationPolicyDocument
              : createAwsImportReadPolicyDocument();
          return { PolicyVersion: { Document: encodeURIComponent(JSON.stringify(document)) } };
        }
        return {};
      }
    }),
    assumeConnectionRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    })
  });

  const result = await gateway.inspectManager({ connection, contract });

  assert.equal(result.verified, true);
  assert.equal(result.managerStackId, "manager-stack-id");
  assert(commands.some((command) => command instanceof DescribeStacksCommand));
  assert(commands.some((command) => command instanceof GetTemplateCommand));
  assert(commands.some((command) => command instanceof GetRoleCommand));
  assert(commands.some((command) => command instanceof GetRolePolicyCommand));
  assert(commands.some((command) => command instanceof ListRolePoliciesCommand));
  assert.equal(commands.filter((command) => command instanceof GetPolicyCommand).length, 3);
  assert.equal(commands.filter((command) => command instanceof GetPolicyVersionCommand).length, 3);
  assert(commands.some((command) => command instanceof ListAttachedRolePoliciesCommand));
});

test("gateway exposes no DeleteStack operation", () => {
  const gateway = createAwsImportAccessGateway();
  assert.equal("deleteStack" in gateway, false);
  assert.equal("delete" in gateway, false);
  assert.equal(typeof UpdateStackCommand, "function");
});

function createPresignedUrl(baseUrl: string): string {
  return `${baseUrl}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA%2F20260719%2Fap-northeast-2%2Fs3%2Faws4_request&X-Amz-Date=20260719T120000Z&X-Amz-Expires=600&X-Amz-Signature=${"a".repeat(64)}&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject`;
}
