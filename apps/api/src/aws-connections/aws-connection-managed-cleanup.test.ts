import assert from "node:assert/strict";
import test from "node:test";
import { createAwsConnectionManagedCleanup } from "./aws-connection-managed-cleanup.js";

test("managed AWS cleanup succeeds without AWS access when no managed resources remain", async () => {
  const cleanup = createAwsConnectionManagedCleanup({
    assumeRole: async () => {
      throw new Error("AssumeRole must not be called");
    },
    createCodeBuildClient: () => {
      throw new Error("CodeBuild client must not be created");
    },
    createCloudWatchLogsClient: () => {
      throw new Error("CloudWatch Logs client must not be created");
    },
    createIamClient: () => {
      throw new Error("IAM client must not be created");
    },
    createCodeConnectionsClient: () => {
      throw new Error("CodeConnections client must not be created");
    },
    createEcrClient: () => {
      throw new Error("ECR client must not be created");
    }
  });

  await cleanup({
    connection: createConnection(),
    resources: {
      codeBuildProjects: [],
      codeConnectionArn: null
    }
  });
});

test("managed AWS cleanup deletes CodeBuild, its role, then CodeConnection", async () => {
  const calls: string[] = [];
  const cleanup = createAwsConnectionManagedCleanup({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createCodeBuildClient: () => createClient("codebuild", calls),
    createCloudWatchLogsClient: () => createClient("logs", calls),
    createIamClient: () => createClient("iam", calls),
    createCodeConnectionsClient: () => createClient("codeconnections", calls),
    createEcrClient: () => createClient("ecr", calls)
  });

  await cleanup({
    connection: {
      id: "connection-1",
      userId: "user-1",
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
      externalId: "external-id",
      region: "ap-northeast-2",
      status: "verified",
      lastVerifiedAt: new Date("2026-07-15T00:00:00.000Z"),
      deletionStartedAt: null,
      deletionErrorSummary: null,
      createdAt: new Date("2026-07-15T00:00:00.000Z"),
      updatedAt: new Date("2026-07-15T00:00:00.000Z")
    },
    resources: {
      codeBuildProjects: [
        {
          projectId: "12345678-1234-1234-1234-1234567890ab",
          projectName: "sketchcatch-12345678-build",
          serviceRoleArn: "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-12345678"
        }
      ],
      codeConnectionArn:
        "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/connection-id"
    }
  });

  assert.deepEqual(calls, [
    "codebuild:BatchGetProjectsCommand",
    "iam:ListRoleTagsCommand",
    "logs:DeleteLogGroupCommand",
    "codebuild:DeleteProjectCommand",
    "iam:DeleteRolePolicyCommand",
    "iam:DeleteRolePermissionsBoundaryCommand",
    "iam:DeleteRoleCommand",
    "ecr:DescribeRepositoriesCommand",
    "ecr:ListTagsForResourceCommand",
    "ecr:DeleteRepositoryCommand",
    "codeconnections:ListTagsForResourceCommand",
    "codeconnections:DeleteConnectionCommand",
    "codebuild:destroy",
    "codeconnections:destroy",
    "logs:destroy",
    "iam:destroy",
    "ecr:destroy"
  ]);
});

test("managed AWS cleanup refuses to delete resources without matching ownership tags", async () => {
  const calls: string[] = [];
  const cleanup = createAwsConnectionManagedCleanup({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createCodeBuildClient: () => createClient("codebuild", calls, { owned: false }),
    createCloudWatchLogsClient: () => createClient("logs", calls),
    createIamClient: () => createClient("iam", calls),
    createCodeConnectionsClient: () => createClient("codeconnections", calls),
    createEcrClient: () => createClient("ecr", calls)
  });

  await assert.rejects(
    cleanup({
      connection: createConnection(),
      resources: {
        codeBuildProjects: [
          {
            projectId: "12345678-1234-1234-1234-1234567890ab",
            projectName: "sketchcatch-12345678-build",
            serviceRoleArn:
              "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-12345678"
          }
        ],
        codeConnectionArn: null
      }
    }),
    /소유권 태그/
  );
  assert.equal(calls.includes("codebuild:DeleteProjectCommand"), false);
});

test("managed AWS cleanup refuses to delete a cache repository without matching ownership tags", async () => {
  const calls: string[] = [];
  const cleanup = createAwsConnectionManagedCleanup({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createCodeBuildClient: () => createClient("codebuild", calls),
    createCloudWatchLogsClient: () => createClient("logs", calls),
    createIamClient: () => createClient("iam", calls),
    createCodeConnectionsClient: () => createClient("codeconnections", calls),
    createEcrClient: () => createClient("ecr", calls, { owned: false })
  });

  await assert.rejects(
    cleanup({
      connection: createConnection(),
      resources: {
        codeBuildProjects: [
          {
            projectId: "12345678-1234-1234-1234-1234567890ab",
            projectName: "sketchcatch-12345678-build",
            serviceRoleArn:
              "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-12345678"
          }
        ],
        codeConnectionArn: null
      }
    }),
    /빌드 캐시 ECR Repository 소유권/
  );
  assert.equal(calls.includes("ecr:DeleteRepositoryCommand"), false);
});

function createConnection() {
  return {
    id: "connection-1",
    userId: "user-1",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "verified" as const,
    lastVerifiedAt: new Date("2026-07-15T00:00:00.000Z"),
    deletionStartedAt: null,
    deletionErrorSummary: null,
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
    updatedAt: new Date("2026-07-15T00:00:00.000Z")
  };
}

function createClient(
  kind: string,
  calls: string[],
  options: { owned?: boolean } = {}
) {
  return {
    async send(command: object) {
      const name = command.constructor.name;
      calls.push(`${kind}:${name}`);
      if (kind === "codebuild" && name === "BatchGetProjectsCommand") {
        return {
          projects: [
            {
              name: "sketchcatch-12345678-build",
              serviceRole:
                "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-12345678",
              tags:
                options.owned === false
                  ? []
                  : [
                      { key: "ManagedBy", value: "SketchCatch" },
                      {
                        key: "SketchCatchProject",
                        value: "12345678-1234-1234-1234-1234567890ab"
                      }
                    ]
            }
          ]
        };
      }
      if (kind === "iam" && name === "ListRoleTagsCommand") {
        return {
          Tags: [
            { Key: "ManagedBy", Value: "SketchCatch" },
            {
              Key: "SketchCatchProject",
              Value: "12345678-1234-1234-1234-1234567890ab"
            }
          ]
        };
      }
      if (kind === "codeconnections" && name === "ListTagsForResourceCommand") {
        return {
          Tags: [
            { Key: "ManagedBy", Value: "SketchCatch" },
            { Key: "SketchCatchAwsConnection", Value: "connection-1" }
          ]
        };
      }
      if (kind === "ecr" && name === "DescribeRepositoriesCommand") {
        return {
          repositories: [
            {
              repositoryName: "sketchcatch-12345678-build-cache",
              repositoryArn:
                "arn:aws:ecr:ap-northeast-2:123456789012:repository/sketchcatch-12345678-build-cache"
            }
          ]
        };
      }
      if (kind === "ecr" && name === "ListTagsForResourceCommand") {
        return {
          tags:
            options.owned === false
              ? []
              : [
                  { Key: "ManagedBy", Value: "SketchCatch" },
                  {
                    Key: "SketchCatchProject",
                    Value: "12345678-1234-1234-1234-1234567890ab"
                  },
                  { Key: "SketchCatchPurpose", Value: "BuildCache" }
                ]
        };
      }
      return {};
    },
    destroy() {
      calls.push(`${kind}:destroy`);
    }
  };
}
