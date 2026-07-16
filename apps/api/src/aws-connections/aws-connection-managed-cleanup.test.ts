import assert from "node:assert/strict";
import test from "node:test";
import { createAwsConnectionManagedCleanup } from "./aws-connection-managed-cleanup.js";

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
    createCodeConnectionsClient: () => createClient("codeconnections", calls)
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
    "codeconnections:ListTagsForResourceCommand",
    "codeconnections:DeleteConnectionCommand",
    "codebuild:destroy",
    "codeconnections:destroy",
    "logs:destroy",
    "iam:destroy"
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
    createCodeConnectionsClient: () => createClient("codeconnections", calls)
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
      return {};
    },
    destroy() {
      calls.push(`${kind}:destroy`);
    }
  };
}
