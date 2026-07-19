import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION } from "./aws-import-access-policy-template.js";

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

test("default registry pins the exact issued Policy v1 action set", () => {
  assert.deepEqual(Object.keys(AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION), ["1"]);
  assert.deepEqual(
    [...AWS_IMPORT_ISSUED_POLICY_ACTIONS_BY_VERSION["1"]].sort(),
    [...createAwsImportReadPolicyDocument().Statement[0].Action].sort()
  );
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
    createIamClient: () => createPolicyApplyIamClient({
      isDrifted: () => false,
      driftKind: "trust",
      readPolicyDocument: createAwsImportReadPolicyDocument()
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
  await gateway.createOrUpdatePolicyStack({
    connection,
    contract,
    operationId,
    expectedPolicy: { kind: "absent" }
  });

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

test("manager preparation returns the official regional CloudFormation Create Review URL", async () => {
  const gateway = createAwsImportAccessGateway({
    publishTemplate: async () => ({
      templateUrl: "https://private.example/template?X-Amz-Signature=secret"
    }) as never
  });

  const result = await gateway.prepareManager({
    connection,
    contract,
    mode: { kind: "create" }
  });

  assert.equal(
    result.consoleUrl,
    "https://ap-northeast-2.console.aws.amazon.com/cloudformation/home?" +
      "region=ap-northeast-2#/stacks/create/review?" +
      "templateURL=https%3A%2F%2Fprivate.example%2Ftemplate%3FX-Amz-Signature%3Dsecret&" +
      `stackName=${contract.managerStackName}`
  );
  assert.equal(
    (result as unknown as { managerTemplateUrl?: string }).managerTemplateUrl,
    undefined
  );
});

test("manager update preparation opens the exact existing Stack info fallback", async () => {
  const managerStackId =
    `arn:aws:cloudformation:${connection.region}:${connection.accountId}:stack/` +
    `${contract.managerStackName}/existing-id`;
  const gateway = createAwsImportAccessGateway({
    publishTemplate: async () => ({
      templateUrl: "https://private.example/template?X-Amz-Signature=secret"
    }) as never
  });

  const result = await gateway.prepareManager({
    connection,
    contract,
    mode: { kind: "update", stackId: managerStackId }
  } as never);

  assert.equal(
    result.consoleUrl,
    "https://ap-northeast-2.console.aws.amazon.com/cloudformation/home?" +
      `region=ap-northeast-2#/stacks/stackinfo?stackId=${encodeURIComponent(managerStackId)}`
  );
  assert.doesNotMatch(result.consoleUrl, /templateURL|update\/template|create\/review/u);
  assert.equal(
    (result as unknown as { managerTemplateUrl?: string }).managerTemplateUrl,
    "https://private.example/template?X-Amz-Signature=secret"
  );
});

test("already-current Policy apply is an idempotent no-op", async () => {
  const commands: unknown[] = [];
  let publishCalls = 0;
  const policyStackId =
    `arn:aws:cloudformation:${connection.region}:${connection.accountId}:stack/` +
    `${contract.policyStackName}/existing-id`;
  const gateway = createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send(command: unknown) {
        commands.push(command);
        if (command instanceof DescribeStacksCommand) {
          return { Stacks: [createPolicyStack(policyStackId)] };
        }
        if (command instanceof GetTemplateCommand) {
          return { TemplateBody: contract.policyTemplateBody };
        }
        throw new Error("unexpected mutation");
      }
    }),
    createIamClient: () => createPolicyApplyIamClient({
      isDrifted: () => false,
      driftKind: "trust",
      readPolicyDocument: createAwsImportReadPolicyDocument()
    }),
    assumeConnectionRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    publishTemplate: async () => {
      publishCalls += 1;
      throw new Error("must not publish");
    }
  });

  const result = await gateway.createOrUpdatePolicyStack({
    connection,
    contract,
    operationId: "33333333-3333-4333-8333-333333333333",
    expectedPolicy: {
      kind: "present",
      stackId: policyStackId,
      contractVersion: contract.policyContractVersion,
      templateSha256: contract.policyTemplateSha256,
      policyFingerprint: contract.policyFingerprint
    }
  } as never);

  assert.equal(result.status, "already_current");
  assert.equal(result.policyStackId, policyStackId);
  assert.equal(publishCalls, 0);
  assert.equal(commands.filter((command) => command instanceof UpdateStackCommand).length, 0);
  assert.equal((commands[0] as DescribeStacksCommand).input.StackName, policyStackId);
});

test("Policy apply consumes exact expected absence or identity before any publication", async () => {
  const policyStackId =
    `arn:aws:cloudformation:${connection.region}:${connection.accountId}:stack/` +
    `${contract.policyStackName}/expected-id`;
  for (const scenario of ["disappeared", "appeared"] as const) {
    let publishCalls = 0;
    const commands: unknown[] = [];
    const gateway = createAwsImportAccessGateway({
      createCloudFormationClient: () => ({
        async send(command: unknown) {
          commands.push(command);
          if (command instanceof DescribeStacksCommand) {
            if (scenario === "disappeared") {
              throw Object.assign(new Error("not found"), { name: "ValidationError" });
            }
            return { Stacks: [createPolicyStack(policyStackId)] };
          }
          if (command instanceof CreateStackCommand) return { StackId: policyStackId };
          return {};
        }
      }),
      assumeConnectionRole: async () => ({
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        sessionToken: "session-token"
      }),
      publishTemplate: async () => {
        publishCalls += 1;
        return { templateUrl: createPresignedUrl(contract.policyTemplateBaseUrl) } as never;
      }
    });
    const expectedPolicy = scenario === "disappeared"
      ? {
          kind: "present" as const,
          stackId: policyStackId,
          contractVersion: contract.policyContractVersion,
          templateSha256: contract.policyTemplateSha256,
          policyFingerprint: contract.policyFingerprint
        }
      : { kind: "absent" as const };

    await assert.rejects(
      gateway.createOrUpdatePolicyStack({
        connection,
        contract,
        operationId: "33333333-3333-4333-8333-333333333333",
        expectedPolicy
      } as never)
    );
    assert.equal(publishCalls, 0, scenario);
    assert.equal(
      (commands[0] as DescribeStacksCommand).input.StackName,
      scenario === "disappeared" ? policyStackId : contract.policyStackName
    );
  }
});

test("Policy apply rechecks approved current state after publication before mutation", async () => {
  const oldPolicy = createOlderPolicyTemplate();
  const policyStackId =
    `arn:aws:cloudformation:${connection.region}:${connection.accountId}:stack/` +
    `${contract.policyStackName}/expected-id`;

  for (const scenario of ["absent_appeared", "present_drifted"] as const) {
    let published = false;
    let mutationCalls = 0;
    const commands: unknown[] = [];
    const gateway = createAwsImportAccessGateway({
      createCloudFormationClient: () => ({
        async send(command: unknown) {
          commands.push(command);
          if (command instanceof DescribeStacksCommand) {
            if (scenario === "absent_appeared" && !published) {
              throw Object.assign(new Error("not found"), { name: "ValidationError" });
            }
            return {
              Stacks: [scenario === "absent_appeared"
                ? createPolicyStack(policyStackId)
                : createPolicyStackForState(
                    policyStackId,
                    oldPolicy.contractVersion,
                    oldPolicy.policyFingerprint
                  )]
            };
          }
          if (command instanceof GetTemplateCommand) {
            return {
              TemplateBody: published
                ? `${oldPolicy.templateBody} `
                : oldPolicy.templateBody
            };
          }
          if (command instanceof CreateStackCommand || command instanceof UpdateStackCommand) {
            mutationCalls += 1;
            return { StackId: policyStackId };
          }
          return {};
        }
      }),
      createIamClient: () => createPolicyApplyIamClient({
        isDrifted: () => false,
        driftKind: "trust",
        readPolicyDocument: oldPolicy.policyDocument
      }),
      issuedPolicyActionsByVersion: createIssuedRegistryFor(oldPolicy),
      assumeConnectionRole: async () => ({
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        sessionToken: "session-token"
      }),
      publishTemplate: async (input) => {
        published = true;
        return publishAwsImportCloudFormationTemplateToS3({
          ...input,
          s3Client: { async send() { return {}; } } as unknown as S3Client,
          signTemplateUrl: async ({ baseUrl }) => createPresignedUrl(baseUrl)
        });
      },
      now: () => new Date("2026-07-19T12:05:00.000Z")
    });
    const expectedPolicy = scenario === "absent_appeared"
      ? { kind: "absent" as const }
      : {
          kind: "present" as const,
          stackId: policyStackId,
          contractVersion: oldPolicy.contractVersion,
          templateSha256: oldPolicy.templateSha256,
          policyFingerprint: oldPolicy.policyFingerprint
        };

    await assert.rejects(gateway.createOrUpdatePolicyStack({
      connection,
      contract,
      operationId: "33333333-3333-4333-8333-333333333333",
      expectedPolicy
    }));

    assert.equal(mutationCalls, 0, scenario);
    assert.equal(
      commands.filter((command) => command instanceof DescribeStacksCommand).length,
      2,
      scenario
    );
    assert.equal(
      commands.filter((command) => command instanceof GetTemplateCommand).length,
      scenario === "present_drifted" ? 2 : 0,
      scenario
    );
  }
});

test("Policy publication rechecks the full exact IAM state before UpdateStack", async () => {
  const oldPolicy = createOlderPolicyTemplate();
  const policyStackId =
    `arn:aws:cloudformation:${connection.region}:${connection.accountId}:stack/` +
    `${contract.policyStackName}/expected-id`;
  const driftKinds: IamDriftKind[] = [
    "trust",
    "inline",
    "service_attachment",
    "control_policy",
    "cleanup_policy",
    "read_policy"
  ];

  for (const driftKind of driftKinds) {
    let published = false;
    let mutationCalls = 0;
    const gateway = createAwsImportAccessGateway({
      createCloudFormationClient: () => ({
        async send(command: unknown) {
          if (command instanceof DescribeStacksCommand) {
            return {
              Stacks: [createPolicyStackForState(
                policyStackId,
                oldPolicy.contractVersion,
                oldPolicy.policyFingerprint
              )]
            };
          }
          if (command instanceof GetTemplateCommand) {
            return { TemplateBody: oldPolicy.templateBody };
          }
          if (command instanceof UpdateStackCommand) {
            mutationCalls += 1;
            return { StackId: policyStackId };
          }
          return {};
        }
      }),
      createIamClient: () => createPolicyApplyIamClient({
        isDrifted: () => published,
        driftKind,
        readPolicyDocument: oldPolicy.policyDocument
      }),
      issuedPolicyActionsByVersion: createIssuedRegistryFor(oldPolicy),
      assumeConnectionRole: async () => ({
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        sessionToken: "session-token"
      }),
      publishTemplate: async (input) => {
        published = true;
        return publishAwsImportCloudFormationTemplateToS3({
          ...input,
          s3Client: { async send() { return {}; } } as unknown as S3Client,
          signTemplateUrl: async ({ baseUrl }) => createPresignedUrl(baseUrl)
        });
      },
      now: () => new Date("2026-07-19T12:05:00.000Z")
    });

    await assert.rejects(
      gateway.createOrUpdatePolicyStack({
        connection,
        contract,
        operationId: "33333333-3333-4333-8333-333333333333",
        expectedPolicy: {
          kind: "present",
          stackId: policyStackId,
          contractVersion: oldPolicy.contractVersion,
          templateSha256: oldPolicy.templateSha256,
          policyFingerprint: oldPolicy.policyFingerprint
        }
      }),
      driftKind
    );
    assert.equal(mutationCalls, 0, driftKind);
  }
});

test("already-current Policy no-op still requires full exact IAM state", async () => {
  const policyStackId =
    `arn:aws:cloudformation:${connection.region}:${connection.accountId}:stack/` +
    `${contract.policyStackName}/existing-id`;
  let publishCalls = 0;
  const gateway = createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send(command: unknown) {
        if (command instanceof DescribeStacksCommand) {
          return { Stacks: [createPolicyStack(policyStackId)] };
        }
        if (command instanceof GetTemplateCommand) {
          return { TemplateBody: contract.policyTemplateBody };
        }
        return {};
      }
    }),
    createIamClient: () => createPolicyApplyIamClient({
      isDrifted: () => true,
      driftKind: "service_attachment",
      readPolicyDocument: createAwsImportReadPolicyDocument()
    }),
    assumeConnectionRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    publishTemplate: async () => {
      publishCalls += 1;
      throw new Error("must not publish");
    }
  });

  await assert.rejects(gateway.createOrUpdatePolicyStack({
    connection,
    contract,
    operationId: "33333333-3333-4333-8333-333333333333",
    expectedPolicy: {
      kind: "present",
      stackId: policyStackId,
      contractVersion: contract.policyContractVersion,
      templateSha256: contract.policyTemplateSha256,
      policyFingerprint: contract.policyFingerprint
    }
  }));
  assert.equal(publishCalls, 0);
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
          if (command.input.RoleName === contract.serviceRoleName) {
            return { AttachedPolicies: [] };
          }
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

test("manager inspection accepts a previously verified owned older Policy contract", async () => {
  const oldPolicy = createOlderPolicyTemplate();
  const fixture = createInspectionGateway({
    policyContractVersion: oldPolicy.contractVersion,
    policyTemplateBody: oldPolicy.templateBody,
    policyFingerprint: oldPolicy.policyFingerprint,
    readPolicyDocument: oldPolicy.policyDocument,
    issuedPolicyActionsByVersion: createIssuedRegistryFor(oldPolicy)
  });

  const result = await fixture.gateway.inspectManager({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "manager-stack-id",
        contractVersion: contract.contractVersion,
        templateSha256: contract.templateSha256
      },
      policy: {
        kind: "present",
        stackId: "policy-stack-id",
        contractVersion: oldPolicy.contractVersion,
        templateSha256: oldPolicy.templateSha256,
        policyFingerprint: oldPolicy.policyFingerprint
      }
    }
  } as never);

  assert.equal(result.verified, true);
  assert.equal((result as never as { policyStatus: string }).policyStatus, "owned_older");
  assert.equal(
    (result as never as { policyContractVersion: string }).policyContractVersion,
    oldPolicy.contractVersion
  );
  assert.equal(
    (result as never as { policyTemplateSha256: string }).policyTemplateSha256,
    oldPolicy.templateSha256
  );
  assert.equal(
    (result as never as { policyFingerprint: string }).policyFingerprint,
    oldPolicy.policyFingerprint
  );

  const replacement = await fixture.gateway.inspectManager({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "manager-stack-id",
        contractVersion: contract.contractVersion,
        templateSha256: contract.templateSha256
      },
      policy: {
        kind: "present",
        stackId: "replacement-policy-stack-id",
        contractVersion: oldPolicy.contractVersion,
        templateSha256: oldPolicy.templateSha256,
        policyFingerprint: oldPolicy.policyFingerprint
      }
    }
  });
  assert.equal(replacement.verified, false);
  assert.equal(replacement.policyStatus, "invalid");
});

test("owned older Policy accepts an exact registered action set removed from the current catalog", async () => {
  const oldPolicy = createOlderPolicyTemplate("route53:GetHostedZone");
  const fixture = createInspectionGateway({
    policyContractVersion: oldPolicy.contractVersion,
    policyTemplateBody: oldPolicy.templateBody,
    policyFingerprint: oldPolicy.policyFingerprint,
    readPolicyDocument: oldPolicy.policyDocument,
    issuedPolicyActionsByVersion: createIssuedRegistryFor(oldPolicy)
  });

  const result = await fixture.gateway.inspectManager({
    connection,
    contract,
    expectedCurrent: createExpectedCurrentForOlderPolicy(oldPolicy)
  });

  assert.equal(result.verified, true);
  assert.equal(result.policyStatus, "owned_older");
});

test("owned older Policy rejects an unregistered version even when every action looks read-only", async () => {
  const oldPolicy = createOlderPolicyTemplate("route53:GetHostedZone");
  const fixture = createInspectionGateway({
    policyContractVersion: oldPolicy.contractVersion,
    policyTemplateBody: oldPolicy.templateBody,
    policyFingerprint: oldPolicy.policyFingerprint,
    readPolicyDocument: oldPolicy.policyDocument
  });

  const result = await fixture.gateway.inspectManager({
    connection,
    contract,
    expectedCurrent: createExpectedCurrentForOlderPolicy(oldPolicy)
  });

  assert.equal(result.verified, false);
  assert.equal(result.policyStatus, "invalid");
});

test("owned older Policy rejects an unregistered write action", async () => {
  const oldPolicy = createOlderPolicyTemplate("s3:PutObject");
  const fixture = createInspectionGateway({
    policyContractVersion: oldPolicy.contractVersion,
    policyTemplateBody: oldPolicy.templateBody,
    policyFingerprint: oldPolicy.policyFingerprint,
    readPolicyDocument: oldPolicy.policyDocument
  });

  const result = await fixture.gateway.inspectManager({
    connection,
    contract,
    expectedCurrent: createExpectedCurrentForOlderPolicy(oldPolicy)
  });

  assert.equal(result.verified, false);
  assert.equal(result.policyStatus, "invalid");
});

test("owned older Policy rejects deceptive Get-named write actions outside its registered set", async () => {
  const registeredPolicy = createOlderPolicyTemplate("route53:GetHostedZone");
  const deceptivePolicy = createOlderPolicyTemplate("sts:GetWebIdentityToken");
  const fixture = createInspectionGateway({
    policyContractVersion: deceptivePolicy.contractVersion,
    policyTemplateBody: deceptivePolicy.templateBody,
    policyFingerprint: deceptivePolicy.policyFingerprint,
    readPolicyDocument: deceptivePolicy.policyDocument,
    issuedPolicyActionsByVersion: createIssuedRegistryFor(registeredPolicy)
  });

  const result = await fixture.gateway.inspectManager({
    connection,
    contract,
    expectedCurrent: createExpectedCurrentForOlderPolicy(deceptivePolicy)
  });

  assert.equal(result.verified, false);
  assert.equal(result.policyStatus, "invalid");
});

test("manager inspection distinguishes a previously verified owned older Manager", async () => {
  const oldManager = createOlderManagerTemplate();
  const fixture = createInspectionGateway({
    managerContractVersion: oldManager.contractVersion,
    managerTemplateBody: oldManager.templateBody
  });

  const result = await fixture.gateway.inspectManager({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "manager-stack-id",
        contractVersion: oldManager.contractVersion,
        templateSha256: oldManager.templateSha256
      },
      policy: {
        kind: "present",
        stackId: "policy-stack-id",
        contractVersion: contract.policyContractVersion,
        templateSha256: contract.policyTemplateSha256,
        policyFingerprint: contract.policyFingerprint
      }
    }
  });

  assert.equal(result.verified, false);
  assert.equal(result.managerStatus, "owned_older");
  assert.equal(result.managerStackId, "manager-stack-id");
  assert.equal(result.managerContractVersion, oldManager.contractVersion);
  assert.equal(result.managerTemplateSha256, oldManager.templateSha256);
});

test("service Role rejects extra inline policies and any attached managed policy", async () => {
  for (const options of [
    { inlinePolicyNames: [contract.serviceRoleInlinePolicyName, "UnexpectedInline"] },
    { serviceAttachedPolicyArns: [contract.readManagedPolicyArn] }
  ]) {
    const fixture = createInspectionGateway(options);
    const result = await fixture.gateway.inspectManager({ connection, contract });
    assert.equal(result.verified, false);
    assert.equal(result.reason, "drifted");
  }
});

test("cleanup reports lingering read Policy artifacts after the Policy Stack is absent", async () => {
  const gateway = createCleanupGateway({
    managerStack: "present",
    policyStack: "absent",
    serviceRole: true,
    policies: [
      contract.controlPolicyArn,
      contract.cleanupVerificationPolicyArn,
      contract.readManagedPolicyArn
    ],
    targetAttachments: [
      contract.controlPolicyArn,
      contract.cleanupVerificationPolicyArn,
      contract.readManagedPolicyArn
    ]
  });

  const result = await gateway.inspectCleanup({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "manager-stack-id",
        contractVersion: contract.contractVersion,
        templateSha256: contract.templateSha256
      },
      policy: {
        kind: "present",
        stackId: "policy-stack-id",
        contractVersion: contract.policyContractVersion,
        templateSha256: contract.policyTemplateSha256,
        policyFingerprint: contract.policyFingerprint
      }
    }
  } as never);
  const exact = result as unknown as ExactCleanupResult;

  assert.equal(exact.verified, true);
  assert.equal(exact.policy.stack.status, "absent");
  assert.equal(exact.policy.readPolicy.status, "owned_present");
  assert.equal(exact.policy.targetAttachment.status, "owned_present");
  assert.equal(exact.manager.stack.status, "owned_present");
  assert.deepEqual(exact.verifiedManagerIdentity, {
    stackId: "manager-stack-id",
    contractVersion: contract.contractVersion,
    templateSha256: contract.templateSha256
  });
});

test("cleanup keeps checking exact Manager artifacts after its Stack is absent", async () => {
  const gateway = createCleanupGateway({
    managerStack: "absent",
    policyStack: "absent",
    serviceRole: true,
    policies: [contract.controlPolicyArn],
    targetAttachments: [contract.controlPolicyArn]
  });

  const exact = await gateway.inspectCleanup({ connection, contract }) as unknown as
    ExactCleanupResult;

  assert.equal(exact.verified, true);
  assert.equal(exact.manager.stack.status, "absent");
  assert.equal(exact.manager.serviceRole.status, "owned_present");
  assert.equal(exact.manager.controlPolicy.status, "owned_present");
  assert.equal(exact.manager.controlAttachment.status, "owned_present");
  assert.equal(exact.manager.cleanupPolicy.status, "absent");
});

test("cleanup rejects a replacement Stack that differs from the stored exact identity", async () => {
  const gateway = createCleanupGateway({
    managerStack: "present",
    policyStack: "absent",
    serviceRole: true,
    policies: [contract.controlPolicyArn, contract.cleanupVerificationPolicyArn],
    targetAttachments: [contract.controlPolicyArn, contract.cleanupVerificationPolicyArn]
  });

  const exact = await gateway.inspectCleanup({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "stored-manager-stack-id",
        contractVersion: contract.contractVersion,
        templateSha256: contract.templateSha256
      }
    }
  } as never) as unknown as ExactCleanupResult;

  assert.equal(exact.verified, false);
  assert.equal(exact.manager.stack.status, "drifted");
  assert.equal(exact.verifiedManagerIdentity, undefined);
});

test("cleanup keeps an unrelated later AccessDenied retryable despite the prior Manager marker", async () => {
  const denied = Object.assign(new Error("AccessDenied private-request-id"), {
    name: "AccessDenied"
  });
  const gateway = createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send(command: unknown) {
        if (command instanceof DescribeStacksCommand) {
          throw Object.assign(new Error("not found"), { name: "ValidationError" });
        }
        return {};
      }
    }),
    createIamClient: () => ({
      async send(command: unknown) {
        if (command instanceof GetPolicyCommand) {
          if (command.input.PolicyArn === contract.cleanupVerificationPolicyArn) {
            return { Policy: { Arn: contract.cleanupVerificationPolicyArn } };
          }
          throw noSuchEntity();
        }
        if (command instanceof GetRoleCommand) throw denied;
        return {};
      }
    }),
    assumeConnectionRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    })
  });

  const result = await gateway.inspectCleanup({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "manager-stack-id",
        contractVersion: contract.contractVersion,
        templateSha256: contract.templateSha256
      }
    },
    priorManagerCleanupVerified: true
  } as never) as unknown as ExactCleanupResult;

  assert.equal(result.verified, false);
  assert.equal(result.reason, "retry");
  assert.equal(result.manager.serviceRole.status, "unknown");
  assert.equal(result.completionEvidence, undefined);
  assert.equal(result.verifiedManagerIdentity, undefined);
  assert.doesNotMatch(JSON.stringify(result), /private-request-id|AccessDenied/iu);
});

test("cleanup accepts only the exact final Policy sentinel AccessDenied after the prior marker", async () => {
  const events: string[] = [];
  const denied = Object.assign(new Error("AccessDenied private-request-id"), {
    name: "AccessDenied"
  });
  const gateway = createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send() {
        events.push("unrelated-cloudformation-read");
        throw denied;
      }
    }),
    createIamClient: () => ({
      async send(command: unknown) {
        if (
          command instanceof GetPolicyCommand &&
          command.input.PolicyArn === contract.cleanupVerificationPolicyArn
        ) {
          events.push("exact-final-policy-sentinel");
          throw denied;
        }
        events.push("unrelated-iam-read");
        throw denied;
      }
    }),
    assumeConnectionRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    })
  });

  const result = await gateway.inspectCleanup({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "manager-stack-id",
        contractVersion: contract.contractVersion,
        templateSha256: contract.templateSha256
      }
    },
    priorManagerCleanupVerified: true
  } as never) as unknown as ExactCleanupResult;

  assert.deepEqual(events, ["exact-final-policy-sentinel"]);
  assert.equal(result.verified, true);
  assert.equal(result.manager.stack.status, "absent");
  assert.equal(result.completionEvidence, "prior_exact_marker_access_denied");
  assert.doesNotMatch(JSON.stringify(result), /private-request-id|AccessDenied/iu);
});

test("cleanup cannot accept the exact final Policy sentinel AccessDenied without a marker", async () => {
  const denied = Object.assign(new Error("AccessDenied private-request-id"), {
    name: "AccessDenied"
  });
  const gateway = createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send(command: unknown) {
        if (command instanceof DescribeStacksCommand) {
          throw Object.assign(new Error("not found"), { name: "ValidationError" });
        }
        return {};
      }
    }),
    createIamClient: () => ({
      async send(command: unknown) {
        if (command instanceof GetPolicyCommand) {
          if (command.input.PolicyArn === contract.cleanupVerificationPolicyArn) throw denied;
          throw noSuchEntity();
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

  const result = await gateway.inspectCleanup({
    connection,
    contract,
    expectedCurrent: {
      manager: {
        stackId: "manager-stack-id",
        contractVersion: contract.contractVersion,
        templateSha256: contract.templateSha256
      }
    }
  } as never) as unknown as ExactCleanupResult;

  assert.equal(result.verified, false);
  assert.equal(result.reason, "retry");
  assert.equal(result.completionEvidence, undefined);
  assert.doesNotMatch(JSON.stringify(result), /private-request-id|AccessDenied/iu);
});

test("manager inspection maps only explicit target Role errors to connection recovery", async () => {
  for (const scenario of [
    { name: "AccessDenied", message: "not authorized to assume target role", reason: "connection" },
    { name: "ValidationError", message: "invalid role arn", reason: "connection" },
    { name: "ExpiredToken", message: "provider credential expired", reason: "retry" },
    { name: "TimeoutError", message: "socket timeout", reason: "retry" }
  ] as const) {
    const gateway = createAwsImportAccessGateway({
      assumeConnectionRole: async () => {
        throw Object.assign(new Error(scenario.message), { name: scenario.name });
      }
    });

    const result = await gateway.inspectManager({ connection, contract });

    assert.equal(result.reason, scenario.reason, scenario.name);
  }
});

test("gateway exposes no DeleteStack operation", () => {
  const gateway = createAwsImportAccessGateway();
  assert.equal("deleteStack" in gateway, false);
  assert.equal("delete" in gateway, false);
  assert.equal(typeof UpdateStackCommand, "function");
});

type ExactCleanupStatus = "absent" | "owned_present" | "drifted" | "unknown";
type ExactCleanupResult = {
  verified: boolean;
  verifiedManagerIdentity?: {
    stackId: string;
    contractVersion: string;
    templateSha256: string;
  };
  completionEvidence?: "direct" | "prior_exact_marker_access_denied";
  reason?: "drifted" | "retry";
  policy: {
    stack: { status: ExactCleanupStatus };
    readPolicy: { status: ExactCleanupStatus };
    targetAttachment: { status: ExactCleanupStatus };
  };
  manager: {
    stack: { status: ExactCleanupStatus };
    serviceRole: { status: ExactCleanupStatus };
    controlPolicy: { status: ExactCleanupStatus };
    controlAttachment: { status: ExactCleanupStatus };
    cleanupPolicy: { status: ExactCleanupStatus };
    cleanupAttachment: { status: ExactCleanupStatus };
  };
};

function createCleanupGateway(input: {
  managerStack: "present" | "absent";
  policyStack: "present" | "absent";
  serviceRole: boolean;
  policies: readonly string[];
  targetAttachments: readonly string[];
}) {
  const policies = new Set(input.policies);
  return createAwsImportAccessGateway({
    createCloudFormationClient: () => ({
      async send(command: unknown) {
        if (command instanceof DescribeStacksCommand) {
          const isPolicy = command.input.StackName === contract.policyStackName ||
            command.input.StackName === "policy-stack-id";
          const present = isPolicy ? input.policyStack === "present" : input.managerStack === "present";
          if (!present) throw Object.assign(new Error("not found"), { name: "ValidationError" });
          return {
            Stacks: [isPolicy
              ? createPolicyStack("policy-stack-id")
              : createManagerStack("manager-stack-id")]
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
        if (command instanceof GetRoleCommand) {
          if (!input.serviceRole) throw noSuchEntity();
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
        if (command instanceof ListRolePoliciesCommand) {
          return { PolicyNames: [contract.serviceRoleInlinePolicyName] };
        }
        if (command instanceof GetRolePolicyCommand) {
          return {
            PolicyDocument: encodeURIComponent(JSON.stringify(contract.serviceRolePolicyDocument))
          };
        }
        if (command instanceof ListAttachedRolePoliciesCommand) {
          if (command.input.RoleName === contract.serviceRoleName) {
            if (!input.serviceRole) throw noSuchEntity();
            return { AttachedPolicies: [] };
          }
          return {
            AttachedPolicies: input.targetAttachments.map((PolicyArn) => ({ PolicyArn }))
          };
        }
        if (command instanceof GetPolicyCommand) {
          if (!command.input.PolicyArn || !policies.has(command.input.PolicyArn)) {
            throw noSuchEntity();
          }
          return { Policy: { Arn: command.input.PolicyArn, DefaultVersionId: "v1" } };
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
}

function createManagerStack(stackId: string) {
  return {
    StackId: stackId,
    StackName: contract.managerStackName,
    StackStatus: "UPDATE_COMPLETE",
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
  };
}

function noSuchEntity(): Error {
  return Object.assign(new Error("not found"), { name: "NoSuchEntity" });
}

function createPresignedUrl(baseUrl: string): string {
  return `${baseUrl}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA%2F20260719%2Fap-northeast-2%2Fs3%2Faws4_request&X-Amz-Date=20260719T120000Z&X-Amz-Expires=600&X-Amz-Signature=${"a".repeat(64)}&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject`;
}

function createPolicyStack(stackId: string) {
  return {
    StackId: stackId,
    StackName: contract.policyStackName,
    StackStatus: "UPDATE_COMPLETE",
    Tags: contract.ownershipTags,
    Outputs: Object.entries({
      SketchCatchConnectionId: contract.connectionId,
      TemplateContractVersion: contract.policyContractVersion,
      TargetRoleArn: contract.targetRoleArn,
      ReadManagedPolicyArn: contract.readManagedPolicyArn,
      PolicyFingerprint: contract.policyFingerprint
    }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
  };
}

function createPolicyStackForState(
  stackId: string,
  contractVersion: string,
  policyFingerprint: string
) {
  return {
    ...createPolicyStack(stackId),
    Tags: contract.ownershipTags.map((tag) =>
      tag.Key === "SketchCatchImportContractVersion"
        ? { ...tag, Value: contractVersion }
        : { ...tag }
    ),
    Outputs: Object.entries({
      SketchCatchConnectionId: contract.connectionId,
      TemplateContractVersion: contractVersion,
      TargetRoleArn: contract.targetRoleArn,
      ReadManagedPolicyArn: contract.readManagedPolicyArn,
      PolicyFingerprint: policyFingerprint
    }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
  };
}

type IamDriftKind =
  | "trust"
  | "inline"
  | "service_attachment"
  | "control_policy"
  | "cleanup_policy"
  | "read_policy";

function createPolicyApplyIamClient(input: {
  isDrifted: () => boolean;
  driftKind: IamDriftKind;
  readPolicyDocument: unknown;
}) {
  return {
    async send(command: unknown) {
      const drifted = input.isDrifted();
      if (command instanceof GetRoleCommand) {
        return {
          Role: {
            AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify({
              Version: "2012-10-17",
              Statement: [{
                Effect: "Allow",
                Principal: {
                  Service: drifted && input.driftKind === "trust"
                    ? "ec2.amazonaws.com"
                    : "cloudformation.amazonaws.com"
                },
                Action: "sts:AssumeRole"
              }]
            }))
          }
        };
      }
      if (command instanceof ListRolePoliciesCommand) {
        return {
          PolicyNames: drifted && input.driftKind === "inline"
            ? [contract.serviceRoleInlinePolicyName, "UnexpectedInline"]
            : [contract.serviceRoleInlinePolicyName]
        };
      }
      if (command instanceof GetRolePolicyCommand) {
        return {
          PolicyDocument: encodeURIComponent(JSON.stringify(contract.serviceRolePolicyDocument))
        };
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        if (command.input.RoleName === contract.serviceRoleName) {
          return {
            AttachedPolicies: drifted && input.driftKind === "service_attachment"
              ? [{ PolicyArn: contract.readManagedPolicyArn }]
              : []
          };
        }
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
        const driftKind = command.input.PolicyArn === contract.controlPolicyArn
          ? "control_policy"
          : command.input.PolicyArn === contract.cleanupVerificationPolicyArn
            ? "cleanup_policy"
            : "read_policy";
        const exactDocument = driftKind === "control_policy"
          ? contract.controlPolicyDocument
          : driftKind === "cleanup_policy"
            ? contract.cleanupVerificationPolicyDocument
            : input.readPolicyDocument;
        const document = drifted && input.driftKind === driftKind
          ? { Version: "2012-10-17", Statement: [] }
          : exactDocument;
        return { PolicyVersion: { Document: encodeURIComponent(JSON.stringify(document)) } };
      }
      return {};
    }
  };
}

function createInspectionGateway(options: {
  managerContractVersion?: string;
  managerTemplateBody?: string;
  policyContractVersion?: string;
  policyTemplateBody?: string;
  policyFingerprint?: string;
  readPolicyDocument?: unknown;
  inlinePolicyNames?: string[];
  serviceAttachedPolicyArns?: string[];
  issuedPolicyActionsByVersion?: Readonly<Record<string, readonly string[]>>;
} = {}) {
  const managerContractVersion = options.managerContractVersion ?? contract.contractVersion;
  const managerTemplateBody = options.managerTemplateBody ?? contract.templateBody;
  const policyContractVersion = options.policyContractVersion ?? contract.policyContractVersion;
  const policyTemplateBody = options.policyTemplateBody ?? contract.policyTemplateBody;
  const policyFingerprint = options.policyFingerprint ?? contract.policyFingerprint;
  const readPolicyDocument = options.readPolicyDocument ?? createAwsImportReadPolicyDocument();
  const policyTags = contract.ownershipTags.map((tag) =>
    tag.Key === "SketchCatchImportContractVersion"
      ? { ...tag, Value: policyContractVersion }
      : { ...tag }
  );
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
                StackStatus: "UPDATE_COMPLETE",
                Tags: policyTags,
                Outputs: Object.entries({
                  SketchCatchConnectionId: contract.connectionId,
                  TemplateContractVersion: policyContractVersion,
                  TargetRoleArn: contract.targetRoleArn,
                  ReadManagedPolicyArn: contract.readManagedPolicyArn,
                  PolicyFingerprint: policyFingerprint
                }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
              }]
            };
          }
          return {
            Stacks: [{
              StackId: "manager-stack-id",
              StackName: contract.managerStackName,
              StackStatus: "UPDATE_COMPLETE",
              Tags: contract.ownershipTags,
              Outputs: Object.entries({
                SketchCatchConnectionId: contract.connectionId,
                TemplateContractVersion: managerContractVersion,
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
              ? policyTemplateBody
              : managerTemplateBody
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
        if (command instanceof ListRolePoliciesCommand) {
          return {
            PolicyNames: options.inlinePolicyNames ?? [contract.serviceRoleInlinePolicyName]
          };
        }
        if (command instanceof GetRolePolicyCommand) {
          return {
            PolicyDocument: encodeURIComponent(JSON.stringify(contract.serviceRolePolicyDocument))
          };
        }
        if (command instanceof ListAttachedRolePoliciesCommand) {
          if (command.input.RoleName === contract.serviceRoleName) {
            return {
              AttachedPolicies: (options.serviceAttachedPolicyArns ?? []).map((PolicyArn) => ({
                PolicyArn
              }))
            };
          }
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
              : readPolicyDocument;
          return { PolicyVersion: { Document: encodeURIComponent(JSON.stringify(document)) } };
        }
        return {};
      }
    }),
    assumeConnectionRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    ...(options.issuedPolicyActionsByVersion !== undefined
      ? { issuedPolicyActionsByVersion: options.issuedPolicyActionsByVersion }
      : {})
  });
  return { gateway, commands };
}

function createOlderPolicyTemplate(extraAction?: string) {
  const template = JSON.parse(contract.policyTemplateBody) as {
    Resources: {
      ImportReadManagedPolicy: { Properties: { PolicyDocument: { Statement: [{ Action: string[] }] } } };
    };
    Outputs: {
      TemplateContractVersion: { Value: string };
      PolicyFingerprint: { Value: string };
    };
  };
  const policyDocument = template.Resources.ImportReadManagedPolicy.Properties.PolicyDocument;
  policyDocument.Statement[0]!.Action = policyDocument.Statement[0]!.Action.slice(0, -1);
  if (extraAction) policyDocument.Statement[0]!.Action.push(extraAction);
  const policyFingerprint = sha256(JSON.stringify(policyDocument));
  const contractVersion = "0";
  template.Outputs.TemplateContractVersion.Value = contractVersion;
  template.Outputs.PolicyFingerprint.Value = policyFingerprint;
  const templateBody = JSON.stringify(template);
  return {
    contractVersion,
    policyDocument,
    policyFingerprint,
    templateBody,
    templateSha256: sha256(templateBody)
  };
}

function createExpectedCurrentForOlderPolicy(
  oldPolicy: ReturnType<typeof createOlderPolicyTemplate>
) {
  return {
    manager: {
      stackId: "manager-stack-id",
      contractVersion: contract.contractVersion,
      templateSha256: contract.templateSha256
    },
    policy: {
      kind: "present" as const,
      stackId: "policy-stack-id",
      contractVersion: oldPolicy.contractVersion,
      templateSha256: oldPolicy.templateSha256,
      policyFingerprint: oldPolicy.policyFingerprint
    }
  };
}

function createIssuedRegistryFor(
  oldPolicy: ReturnType<typeof createOlderPolicyTemplate>
): Readonly<Record<string, readonly string[]>> {
  return {
    [oldPolicy.contractVersion]: [
      ...oldPolicy.policyDocument.Statement[0]!.Action
    ]
  };
}

function createOlderManagerTemplate() {
  const template = JSON.parse(contract.templateBody) as {
    Outputs: { TemplateContractVersion: { Value: string } };
  };
  const contractVersion = "0";
  template.Outputs.TemplateContractVersion.Value = contractVersion;
  const templateBody = JSON.stringify(template);
  return {
    contractVersion,
    templateBody,
    templateSha256: sha256(templateBody)
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
