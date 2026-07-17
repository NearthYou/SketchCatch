import assert from "node:assert/strict";
import test from "node:test";

import {
  createAwsProjectBuildEnvironmentGateway as createGatewayImplementation
} from "./aws-project-build-environment-gateway.js";
import type { DesiredProjectBuildEnvironment } from "./project-build-environment-service.js";

function createAwsProjectBuildEnvironmentGateway(
  options: Parameters<typeof createGatewayImplementation>[0]
) {
  return createGatewayImplementation({
    createEcrClient: () => createVerifiedEcrClient(),
    ...options
  });
}

test("repository access verification starts CodeBuild at the confirmed commit and records the resolved commit", async () => {
  const commitSha = "b".repeat(40);
  const commands: Array<{ name: string; input: Record<string, unknown> }> = [];
  const emptyClient = () => ({
    async send(): Promise<Record<string, unknown>> {
      return {};
    },
    destroy() {}
  });
  const gateway = createGatewayImplementation({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createIamClient: emptyClient,
    createEcrClient: emptyClient,
    createCloudWatchLogsClient: emptyClient,
    createCodeBuildClient: () => ({
      async send(command: unknown): Promise<Record<string, unknown>> {
        const value = command as {
          constructor: { name: string };
          input: Record<string, unknown>;
        };
        commands.push({ name: value.constructor.name, input: value.input });
        if (value.constructor.name === "StartBuildCommand") {
          return {
            build: {
              id: "sketchcatch-12345678-build:verify-1",
              arn: "arn:aws:codebuild:ap-northeast-2:123456789012:build/sketchcatch-12345678-build:verify-1"
            }
          };
        }
        return {
          builds: [
            {
              id: "sketchcatch-12345678-build:verify-1",
              arn: "arn:aws:codebuild:ap-northeast-2:123456789012:build/sketchcatch-12345678-build:verify-1",
              buildStatus: "SUCCEEDED",
              resolvedSourceVersion: commitSha
            }
          ]
        };
      },
      destroy() {}
    })
  });

  const result = await gateway.verifyRepositoryAccess(desired, commitSha);

  assert.deepEqual(result, {
    verified: true,
    requestedCommitSha: commitSha,
    resolvedCommitSha: commitSha,
    buildArn:
      "arn:aws:codebuild:ap-northeast-2:123456789012:build/sketchcatch-12345678-build:verify-1",
    statusReason: null
  });
  assert.equal(commands[0]?.name, "StartBuildCommand");
  assert.equal(commands[0]?.input["sourceVersion"], commitSha);
  assert.match(String(commands[0]?.input["buildspecOverride"]), /repository access verified/);
});

test("new build environment creates and verifies its project cache repository", async () => {
  const calls: string[] = [];
  const gateway = createGatewayImplementation({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createEcrClient: () => createEcrClient(calls),
    createIamClient: () => createIamClient(calls, { completeVerification: true }),
    createCodeBuildClient: () => createCodeBuildClient(calls, { creationSucceeds: true })
  });

  assert.deepEqual(await gateway.reconcile(desired), {
    verified: true,
    statusReason: null
  });
  assert.equal(calls.includes("ecr:CreateRepositoryCommand"), true);
  assert.equal(calls.includes("ecr:PutLifecyclePolicyCommand"), true);
  assert.equal(calls.includes("ecr:ListTagsForResourceCommand"), true);
  assert.equal(calls.includes("ecr:GetLifecyclePolicyCommand"), true);
});

test("failed build role creation removes only the cache repository created by this request", async () => {
  const calls: string[] = [];
  const gateway = createGatewayImplementation({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createEcrClient: () => createEcrClient(calls),
    createIamClient: () => ({
      async send(): Promise<Record<string, unknown>> {
        throw new Error("CreateRole failed");
      },
      destroy() {}
    }),
    createCodeBuildClient: () => createVerifiedCodeBuildClient()
  });

  await assert.rejects(gateway.reconcile(desired), /CreateRole failed/);
  assert.equal(calls.includes("ecr:DeleteRepositoryCommand"), true);
});

test("failed cache lifecycle setup removes the repository created by this request", async () => {
  const calls: string[] = [];
  const gateway = createGatewayImplementation({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createEcrClient: () => createEcrClient(calls, { lifecycleSetupFails: true }),
    createIamClient: () => createVerifiedIamClient({ includeConnectionTokenAccess: true }),
    createCodeBuildClient: () => createVerifiedCodeBuildClient()
  });

  await assert.rejects(gateway.reconcile(desired), /PutLifecyclePolicy failed/);
  assert.equal(calls.includes("ecr:DeleteRepositoryCommand"), true);
});

test("build environment removal deletes the owned project cache repository", async () => {
  const calls: string[] = [];
  const gateway = createGatewayImplementation({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createEcrClient: () => createEcrClient(calls, { repositoryExists: true }),
    createIamClient: () => createVerifiedIamClient({ includeConnectionTokenAccess: true }),
    createCodeBuildClient: () => createVerifiedCodeBuildClient(),
    createCloudWatchLogsClient: () => ({
      async send(): Promise<Record<string, unknown>> {
        return {};
      },
      destroy() {}
    })
  });

  await gateway.remove?.({
    projectId: desired.projectId,
    awsConnection: desired.awsConnection,
    codeBuildProjectName: desired.codeBuildProjectName,
    codeBuildServiceRoleName: desired.codeBuildServiceRoleName,
    codeBuildServiceRoleArn: desired.codeBuildServiceRoleArn,
    permissionsBoundaryArn: desired.permissionsBoundaryArn
  });

  assert.equal(calls.includes("ecr:DeleteRepositoryCommand"), true);
});

test("verification rejects a cache repository without project ownership tags", async () => {
  const gateway = createGatewayImplementation({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createEcrClient: () => ({
      async send(command: unknown): Promise<Record<string, unknown>> {
        const name = (command as { constructor: { name: string } }).constructor.name;
        if (name === "DescribeRepositoriesCommand") {
          return { repositories: [verifiedEcrRepository()] };
        }
        if (name === "ListTagsForResourceCommand") {
          return { tags: [{ Key: "ManagedBy", Value: "someone-else" }] };
        }
        return {};
      },
      destroy() {}
    }),
    createIamClient: () => createVerifiedIamClient({ includeConnectionTokenAccess: true }),
    createCodeBuildClient: () => createVerifiedCodeBuildClient()
  });

  assert.deepEqual(await gateway.verify(desired), {
    verified: false,
    statusReason: "ECR build cache repository ownership tags are missing or changed"
  });
});

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
  confirmedCommitSha: "b".repeat(40),
  buildCache: {
    repositoryName: "sketchcatch-12345678-build-cache",
    repositoryArn:
      "arn:aws:ecr:ap-northeast-2:123456789012:repository/sketchcatch-12345678-build-cache",
    repositoryUri:
      "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-12345678-build-cache",
    cacheTag: "buildcache-v1-linux-amd64",
    cacheReference:
      "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-12345678-build-cache:buildcache-v1-linux-amd64"
  },
  runtimeFingerprint: "a".repeat(64)
};

function createEcrClient(
  calls: string[],
  options: { repositoryExists?: boolean; lifecycleSetupFails?: boolean } = {}
) {
  let repositoryExists = options.repositoryExists ?? false;
  return {
    async send(command: unknown): Promise<Record<string, unknown>> {
      const name = (command as { constructor: { name: string } }).constructor.name;
      calls.push(`ecr:${name}`);
      if (name === "DescribeRepositoriesCommand") {
        if (!repositoryExists) throw { name: "RepositoryNotFoundException" };
        return { repositories: [verifiedEcrRepository()] };
      }
      if (name === "CreateRepositoryCommand") {
        repositoryExists = true;
        return { repository: verifiedEcrRepository() };
      }
      if (name === "ListTagsForResourceCommand") {
        return { tags: verifiedEcrTags() };
      }
      if (name === "GetLifecyclePolicyCommand") {
        return { lifecyclePolicyText: verifiedEcrLifecyclePolicy() };
      }
      if (name === "PutLifecyclePolicyCommand" && options.lifecycleSetupFails) {
        throw new Error("PutLifecyclePolicy failed");
      }
      if (name === "DeleteRepositoryCommand") repositoryExists = false;
      return {};
    },
    destroy() {}
  };
}

function createVerifiedEcrClient() {
  return {
    async send(command: unknown): Promise<Record<string, unknown>> {
      const name = (command as { constructor: { name: string } }).constructor.name;
      if (name === "DescribeRepositoriesCommand") {
        return { repositories: [verifiedEcrRepository()] };
      }
      if (name === "ListTagsForResourceCommand") return { tags: verifiedEcrTags() };
      if (name === "GetLifecyclePolicyCommand") {
        return { lifecyclePolicyText: verifiedEcrLifecyclePolicy() };
      }
      return {};
    },
    destroy() {}
  };
}

function verifiedEcrRepository() {
  return {
    repositoryName: desired.buildCache.repositoryName,
    repositoryArn: desired.buildCache.repositoryArn,
    repositoryUri: desired.buildCache.repositoryUri,
    imageTagMutability: "MUTABLE",
    imageScanningConfiguration: { scanOnPush: false },
    encryptionConfiguration: { encryptionType: "AES256" }
  };
}

function verifiedEcrTags() {
  return [
    { Key: "ManagedBy", Value: "SketchCatch" },
    { Key: "SketchCatchProject", Value: desired.projectId },
    { Key: "SketchCatchPurpose", Value: "BuildCache" }
  ];
}

function verifiedEcrLifecyclePolicy() {
  return JSON.stringify({
    rules: [
      {
        rulePriority: 1,
        description: "Keep the three most recent SketchCatch build cache images",
        selection: {
          tagStatus: "any",
          countType: "imageCountMoreThan",
          countNumber: 3
        },
        action: { type: "expire" }
      }
    ]
  });
}

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
                },
                {
                  Effect: "Allow",
                  Action: "ecr:GetAuthorizationToken",
                  Resource: "*"
                },
                {
                  Effect: "Allow",
                  Action: [
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "ecr:InitiateLayerUpload",
                    "ecr:UploadLayerPart",
                    "ecr:CompleteLayerUpload",
                    "ecr:PutImage"
                  ],
                  Resource: input.wildcardBuildPolicy
                    ? "*"
                    : desired.buildCache.repositoryArn
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
                  },
                  {
                    Effect: "Allow",
                    Action: "ecr:GetAuthorizationToken",
                    Resource: "*"
                  },
                  {
                    Effect: "Allow",
                    Action: [
                      "ecr:BatchCheckLayerAvailability",
                      "ecr:GetDownloadUrlForLayer",
                      "ecr:BatchGetImage",
                      "ecr:InitiateLayerUpload",
                      "ecr:UploadLayerPart",
                      "ecr:CompleteLayerUpload",
                      "ecr:PutImage"
                    ],
                    Resource:
                      `arn:aws:ecr:${desired.awsConnection.region}:${desired.awsConnection.accountId}:repository/sketchcatch-*-build-cache`
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
