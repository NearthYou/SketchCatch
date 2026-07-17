import assert from "node:assert/strict";
import test from "node:test";

import { createAwsProjectBuildEnvironmentGateway } from "./aws-project-build-environment-gateway.js";
import type { DesiredProjectBuildEnvironment } from "./project-build-environment-service.js";

test("failed CodeBuild creation compensates only the role created by this request", async () => {
  const calls: string[] = [];
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () => createIamClient(calls),
    createCodeBuildClient: () => createCodeBuildClient(calls)
  });

  await assert.rejects(gateway.reconcile(desired), /CreateProject failed/);
  assert.deepEqual(calls, [
    "iam:GetRoleCommand",
    "iam:CreateRoleCommand",
    "iam:PutRolePolicyCommand",
    "codebuild:BatchGetProjectsCommand",
    "codebuild:CreateProjectCommand",
    "iam:GetRoleCommand",
    "iam:ListRoleTagsCommand",
    "iam:DeleteRolePolicyCommand",
    "iam:DeleteRolePermissionsBoundaryCommand",
    "iam:DeleteRoleCommand",
    "iam:destroy",
    "codebuild:destroy"
  ]);
});

test("new build role tolerates a transient IAM propagation delay", async () => {
  const calls: string[] = [];
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () => createIamClient(calls, { putRolePolicyMissingAttempts: 1 }),
    createCodeBuildClient: () => createCodeBuildClient(calls)
  });

  await assert.rejects(gateway.reconcile(desired), /CreateProject failed/);
  assert.equal(
    calls.filter((call) => call === "iam:PutRolePolicyCommand").length,
    2
  );
});

test("new build environment tolerates a transient IAM read delay during verification", async () => {
  const calls: string[] = [];
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () =>
      createIamClient(calls, {
        listRoleTagsMissingAttempts: 1,
        completeVerification: true
      }),
    createCodeBuildClient: () =>
      createCodeBuildClient(calls, { creationSucceeds: true })
  });

  assert.deepEqual(await gateway.reconcile(desired), {
    verified: true,
    statusReason: null
  });
  assert.equal(
    calls.filter((call) => call === "iam:ListRoleTagsCommand").length,
    2
  );
});

test("new build environment tolerates a transient CodeBuild service-role delay", async () => {
  const calls: string[] = [];
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () =>
      createIamClient(calls, { completeVerification: true }),
    createCodeBuildClient: () =>
      createCodeBuildClient(calls, {
        creationSucceeds: true,
        createProjectRolePropagationAttempts: 1
      })
  });

  assert.deepEqual(await gateway.reconcile(desired), {
    verified: true,
    statusReason: null
  });
  assert.equal(
    calls.filter((call) => call === "codebuild:CreateProjectCommand").length,
    2
  );
});

test("existing unmanaged build role is never modified", async () => {
  const calls: string[] = [];
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () => ({
      async send(command: unknown): Promise<Record<string, unknown>> {
        const name = (command as { constructor: { name: string } }).constructor.name;
        calls.push(`iam:${name}`);
        if (name === "GetRoleCommand") {
          return {
            Role: {
              Arn: desired.codeBuildServiceRoleArn,
              PermissionsBoundary: {
                PermissionsBoundaryArn: desired.permissionsBoundaryArn
              }
            }
          };
        }
        if (name === "ListRoleTagsCommand") {
          return { Tags: [{ Key: "ManagedBy", Value: "someone-else" }] };
        }
        return {};
      },
      destroy() {
        calls.push("iam:destroy");
      }
    }),
    createCodeBuildClient: () => ({
      async send(): Promise<Record<string, unknown>> {
        throw new Error("CodeBuild must not be called");
      },
      destroy() {
        calls.push("codebuild:destroy");
      }
    })
  });

  await assert.rejects(
    gateway.reconcile(desired),
    /Refusing to update an unmanaged CodeBuild service role/
  );
  assert.deepEqual(calls, [
    "iam:GetRoleCommand",
    "iam:ListRoleTagsCommand",
    "iam:destroy",
    "codebuild:destroy"
  ]);
});

test("existing unmanaged CodeBuild project is never modified", async () => {
  const calls: string[] = [];
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () => ({
      async send(command: unknown): Promise<Record<string, unknown>> {
        const name = (command as { constructor: { name: string } }).constructor.name;
        calls.push(`iam:${name}`);
        if (name === "GetRoleCommand") {
          return {
            Role: {
              Arn: desired.codeBuildServiceRoleArn,
              PermissionsBoundary: {
                PermissionsBoundaryArn: desired.permissionsBoundaryArn
              }
            }
          };
        }
        if (name === "ListRoleTagsCommand") {
          return {
            Tags: [
              { Key: "ManagedBy", Value: "SketchCatch" },
              { Key: "SketchCatchProject", Value: desired.projectId }
            ]
          };
        }
        return {};
      },
      destroy() {
        calls.push("iam:destroy");
      }
    }),
    createCodeBuildClient: () => ({
      async send(command: unknown): Promise<Record<string, unknown>> {
        const name = (command as { constructor: { name: string } }).constructor.name;
        calls.push(`codebuild:${name}`);
        if (name === "BatchGetProjectsCommand") {
          return {
            projects: [
              {
                name: desired.codeBuildProjectName,
                tags: [{ key: "ManagedBy", value: "someone-else" }]
              }
            ]
          };
        }
        return {};
      },
      destroy() {
        calls.push("codebuild:destroy");
      }
    })
  });

  await assert.rejects(
    gateway.reconcile(desired),
    /Refusing to update an unmanaged CodeBuild project/
  );
  assert.equal(calls.includes("codebuild:UpdateProjectCommand"), false);
});

test("verification rejects attached managed policies on the build role", async () => {
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () => createVerifiedIamClient({
      attachedPolicyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"]
    }),
    createCodeBuildClient: () => createVerifiedCodeBuildClient()
  });

  assert.deepEqual(await gateway.verify(desired), {
    verified: false,
    statusReason: "CodeBuild service role contains an attached managed policy"
  });
});

test("verification rejects a wildcard build role policy even when action names look valid", async () => {
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () => createVerifiedIamClient({ wildcardBuildPolicy: true }),
    createCodeBuildClient: () => createVerifiedCodeBuildClient()
  });

  assert.deepEqual(await gateway.verify(desired), {
    verified: false,
    statusReason: "CodeBuild service role policy does not match the build-only contract"
  });
});

test("verification rejects a build role missing the CodeBuild-compatible connection permission", async () => {
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () =>
      createVerifiedIamClient({
        omitLegacyConnectionUse: true,
        includeConnectionTokenAccess: true
      }),
    createCodeBuildClient: () => createVerifiedCodeBuildClient()
  });

  assert.deepEqual(await gateway.verify(desired), {
    verified: false,
    statusReason: "CodeBuild service role policy does not match the build-only contract"
  });
});

test("verification rejects a build role missing GitHub connection token access", async () => {
  const gateway = createAwsProjectBuildEnvironmentGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: () => createVerifiedIamClient(),
    createCodeBuildClient: () => createVerifiedCodeBuildClient()
  });

  assert.deepEqual(await gateway.verify(desired), {
    verified: false,
    statusReason: "CodeBuild service role policy does not match the build-only contract"
  });
});

const desired: DesiredProjectBuildEnvironment = {
  projectId: "12345678-1234-1234-1234-1234567890ab",
  awsConnection: {
    id: "connection-1",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "external-id",
    region: "ap-northeast-2"
  },
  awsCodeConnectionId: "codeconnection-1",
  codeConnectionArn:
    "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/connection-1",
  codeBuildProjectName: "sketchcatch-12345678-build",
  codeBuildServiceRoleName: "SketchCatchCodeBuild-12345678",
  codeBuildServiceRoleArn:
    "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-12345678",
  permissionsBoundaryArn:
    "arn:aws:iam::123456789012:policy/SketchCatchCodeBuildBoundary",
  sourceRepositoryUrl: "https://github.com/jh-9999/audience-live-check.git",
  image: "aws/codebuild/standard:7.0",
  computeType: "BUILD_GENERAL1_SMALL",
  runtimeFingerprint: "a".repeat(64)
};

function createIamClient(
  calls: string[],
  options: {
    putRolePolicyMissingAttempts?: number;
    listRoleTagsMissingAttempts?: number;
    completeVerification?: boolean;
  } = {}
) {
  let roleCreated = false;
  let remainingPutRolePolicyMissingAttempts = options.putRolePolicyMissingAttempts ?? 0;
  let remainingListRoleTagsMissingAttempts = options.listRoleTagsMissingAttempts ?? 0;
  return {
    async send(command: unknown): Promise<Record<string, unknown>> {
      const name = (command as { constructor: { name: string } }).constructor.name;
      calls.push(`iam:${name}`);
      if (name === "GetRoleCommand") {
        if (!roleCreated) throw { name: "NoSuchEntityException" };
        return {
          Role: {
            Arn: desired.codeBuildServiceRoleArn,
            PermissionsBoundary: {
              PermissionsBoundaryArn: desired.permissionsBoundaryArn
            }
          }
        };
      }
      if (name === "CreateRoleCommand") roleCreated = true;
      if (name === "PutRolePolicyCommand" && remainingPutRolePolicyMissingAttempts > 0) {
        remainingPutRolePolicyMissingAttempts -= 1;
        throw Object.assign(
          new Error(`The role with name ${desired.codeBuildServiceRoleName} cannot be found.`),
          { name: "NoSuchEntityException" }
        );
      }
      if (name === "ListRoleTagsCommand") {
        if (remainingListRoleTagsMissingAttempts > 0) {
          remainingListRoleTagsMissingAttempts -= 1;
          throw Object.assign(
            new Error(`The role with name ${desired.codeBuildServiceRoleName} cannot be found.`),
            { name: "NoSuchEntityException" }
          );
        }
        return {
          Tags: [
            { Key: "ManagedBy", Value: "SketchCatch" },
            { Key: "SketchCatchProject", Value: desired.projectId }
          ]
        };
      }
      if (options.completeVerification && name === "ListRolePoliciesCommand") {
        return { PolicyNames: ["SketchCatchRepositoryBuildOnly"] };
      }
      if (options.completeVerification && name === "ListAttachedRolePoliciesCommand") {
        return { AttachedPolicies: [] };
      }
      if (
        options.completeVerification &&
        (name === "GetRolePolicyCommand" ||
          name === "GetPolicyCommand" ||
          name === "GetPolicyVersionCommand")
      ) {
        return createVerifiedIamClient({ includeConnectionTokenAccess: true }).send(command);
      }
      return {};
    },
    destroy() {
      calls.push("iam:destroy");
    }
  };
}

function createCodeBuildClient(
  calls: string[],
  options: {
    creationSucceeds?: boolean;
    createProjectRolePropagationAttempts?: number;
  } = {}
) {
  let projectCreated = false;
  let remainingRolePropagationAttempts = options.createProjectRolePropagationAttempts ?? 0;
  return {
    async send(command: unknown): Promise<Record<string, unknown>> {
      const name = (command as { constructor: { name: string } }).constructor.name;
      calls.push(`codebuild:${name}`);
      if (name === "BatchGetProjectsCommand") {
        if (projectCreated) return createVerifiedCodeBuildClient().send(command);
        return { projects: [] };
      }
      if (name === "CreateProjectCommand") {
        if (!options.creationSucceeds) throw new Error("CreateProject failed");
        if (remainingRolePropagationAttempts > 0) {
          remainingRolePropagationAttempts -= 1;
          throw Object.assign(
            new Error(
              "CodeBuild is not authorized to perform: sts:AssumeRole on service role."
            ),
            { name: "InvalidInputException" }
          );
        }
        projectCreated = true;
      }
      return {};
    },
    destroy() {
      calls.push("codebuild:destroy");
    }
  };
}

function createVerifiedIamClient(input: {
  attachedPolicyArns?: string[];
  wildcardBuildPolicy?: boolean;
  omitLegacyConnectionUse?: boolean;
  includeConnectionTokenAccess?: boolean;
} = {}) {
  return {
    async send(command: unknown): Promise<Record<string, unknown>> {
      const name = (command as { constructor: { name: string } }).constructor.name;
      if (name === "GetRoleCommand") {
        return {
          Role: {
            Arn: desired.codeBuildServiceRoleArn,
            PermissionsBoundary: {
              PermissionsBoundaryArn: desired.permissionsBoundaryArn
            }
          }
        };
      }
      if (name === "ListRoleTagsCommand") {
        return {
          Tags: [
            { Key: "ManagedBy", Value: "SketchCatch" },
            { Key: "SketchCatchProject", Value: desired.projectId }
          ]
        };
      }
      if (name === "ListRolePoliciesCommand") {
        return { PolicyNames: ["SketchCatchRepositoryBuildOnly"] };
      }
      if (name === "ListAttachedRolePoliciesCommand") {
        return {
          AttachedPolicies: (input.attachedPolicyArns ?? []).map((PolicyArn) => ({ PolicyArn }))
        };
      }
      if (name === "GetRolePolicyCommand") {
        return {
          PolicyDocument: encodeURIComponent(
            JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                  ],
                  Resource: input.wildcardBuildPolicy
                    ? "*"
                    : [
                        `arn:aws:logs:${desired.awsConnection.region}:${desired.awsConnection.accountId}:log-group:/aws/codebuild/${desired.codeBuildProjectName}`,
                        `arn:aws:logs:${desired.awsConnection.region}:${desired.awsConnection.accountId}:log-group:/aws/codebuild/${desired.codeBuildProjectName}:*`
                      ]
                },
                {
                  Effect: "Allow",
                  Action: [
                    "codeconnections:UseConnection",
                    ...(input.omitLegacyConnectionUse
                      ? []
                      : ["codestar-connections:UseConnection"]),
                    ...(input.includeConnectionTokenAccess
                      ? [
                          "codeconnections:GetConnection",
                          "codeconnections:GetConnectionToken"
                        ]
                      : [])
                  ],
                  Resource: input.wildcardBuildPolicy ? "*" : desired.codeConnectionArn
                }
              ]
            })
          )
        };
      }
      if (name === "GetPolicyCommand") {
        return { Policy: { DefaultVersionId: "v1" } };
      }
      if (name === "GetPolicyVersionCommand") {
        const logsPrefix = `arn:aws:logs:${desired.awsConnection.region}:${desired.awsConnection.accountId}:log-group:/aws/codebuild/*`;
        return {
          PolicyVersion: {
            Document: encodeURIComponent(
              JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: [
                      "logs:CreateLogGroup",
                      "logs:CreateLogStream",
                      "logs:PutLogEvents"
                    ],
                    Resource: [logsPrefix, `${logsPrefix}:*`]
                  },
                  {
                    Effect: "Allow",
                    Action: [
                      ...(input.includeConnectionTokenAccess
                        ? [
                            "codeconnections:GetConnection",
                            "codeconnections:GetConnectionToken"
                          ]
                        : []),
                      "codeconnections:UseConnection",
                      "codestar-connections:UseConnection"
                    ],
                    Resource: [
                      `arn:aws:codeconnections:${desired.awsConnection.region}:${desired.awsConnection.accountId}:connection/*`,
                      `arn:aws:codestar-connections:${desired.awsConnection.region}:${desired.awsConnection.accountId}:connection/*`
                    ]
                  }
                ]
              })
            )
          }
        };
      }
      return {};
    },
    destroy() {}
  };
}

function createVerifiedCodeBuildClient() {
  return {
    async send(command: unknown): Promise<Record<string, unknown>> {
      const name = (command as { constructor: { name: string } }).constructor.name;
      if (name !== "BatchGetProjectsCommand") return {};
      return {
        projects: [
          {
            name: desired.codeBuildProjectName,
            serviceRole: desired.codeBuildServiceRoleArn,
            source: {
              type: "GITHUB",
              location: desired.sourceRepositoryUrl,
              buildspec: `version: 0.2
phases:
  build:
    commands:
      - echo "SketchCatch server-generated buildspecOverride is required"
`,
              auth: { type: "CODECONNECTIONS", resource: desired.codeConnectionArn },
              reportBuildStatus: false,
              gitCloneDepth: 1
            },
            environment: {
              type: "LINUX_CONTAINER",
              computeType: desired.computeType,
              image: desired.image,
              privilegedMode: true,
              environmentVariables: []
            },
            artifacts: { type: "NO_ARTIFACTS" },
            cache: { type: "NO_CACHE" },
            timeoutInMinutes: 30,
            queuedTimeoutInMinutes: 15,
            concurrentBuildLimit: 1,
            badge: { badgeEnabled: false },
            tags: [
              { key: "ManagedBy", value: "SketchCatch" },
              { key: "SketchCatchProject", value: desired.projectId }
            ]
          }
        ]
      };
    },
    destroy() {}
  };
}
