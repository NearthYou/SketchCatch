import assert from "node:assert/strict";
import test from "node:test";

import {
  createPreflightBuildCacheEnvironmentOverrides,
  createPreflightCodeBuildSessionPolicy,
  deregisterRolledBackEcsTaskDefinition
} from "./aws-codebuild-direct-application-release-gateway.js";
import {
  DeregisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand
} from "@aws-sdk/client-ecs";

test("preflight cache environment is derived from the selected project and AWS connection", () => {
  assert.deepEqual(
    createPreflightBuildCacheEnvironmentOverrides({
      projectId: "5ac411f8-10cf-4092-8440-790836a6471b",
      accountId: "131404649047",
      region: "ap-northeast-2"
    }),
    [
      {
        name: "SKETCHCATCH_BUILD_CACHE_REFERENCE",
        value:
          "131404649047.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-5ac411f8-build-cache:buildcache-v1-linux-amd64",
        type: "PLAINTEXT"
      },
      {
        name: "SKETCHCATCH_BUILD_CACHE_REGISTRY",
        value: "131404649047.dkr.ecr.ap-northeast-2.amazonaws.com",
        type: "PLAINTEXT"
      }
    ]
  );
});

test("preflight CodeBuild session policy is limited to the selected project and its builds", () => {
  const projectName = "sketchcatch-12345678-build";
  const policy = JSON.parse(
    createPreflightCodeBuildSessionPolicy({
      accountId: "123456789012",
      region: "ap-northeast-2",
      projectName
    })
  ) as {
    Statement: Array<{ Action: string[]; Resource: string }>;
  };

  assert.deepEqual(policy.Statement, [
    {
      Effect: "Allow",
      Action: ["codebuild:BatchGetProjects", "codebuild:StartBuild"],
      Resource: `arn:aws:codebuild:ap-northeast-2:123456789012:project/${projectName}`
    },
    {
      Effect: "Allow",
      Action: ["codebuild:BatchGetBuilds", "codebuild:StopBuild"],
      Resource: `arn:aws:codebuild:ap-northeast-2:123456789012:project/${projectName}`
    }
  ]);
  assert.equal(JSON.stringify(policy).includes("unmanaged-build"), false);
  assert.equal(JSON.stringify(policy).includes('"Resource":"*"'), false);
});

test("rolled-back ECS cleanup deregisters only the exact released revision", async () => {
  const taskDefinitionArn =
    "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/audience-live-check-api:9";
  const commands: unknown[] = [];
  let clientDestroyed = false;
  let sessionPolicy = "";
  let roleSessionName = "";

  await deregisterRolledBackEcsTaskDefinition({
    taskDefinitionArn,
    accountId: "123456789012",
    region: "ap-northeast-2",
    roleArn: "arn:aws:iam::123456789012:role/sketchcatch-deployment",
    externalId: "external-id",
    assumeRole: async (input) => {
      sessionPolicy = input.policy ?? "";
      roleSessionName = input.roleSessionName;
      return {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        sessionToken: "test-session-token"
      };
    },
    createEcsClient: () =>
      ({
        async send(command: unknown) {
          commands.push(command);
          if (command instanceof DescribeTaskDefinitionCommand) {
            return { taskDefinition: { taskDefinitionArn, status: "ACTIVE" } };
          }
          if (command instanceof DeregisterTaskDefinitionCommand) {
            return { taskDefinition: { taskDefinitionArn, status: "INACTIVE" } };
          }
          throw new Error("Unexpected ECS command");
        },
        destroy() {
          clientDestroyed = true;
        }
      }) as never
  });

  assert.equal(commands.length, 2);
  assert.ok(commands[0] instanceof DescribeTaskDefinitionCommand);
  assert.ok(commands[1] instanceof DeregisterTaskDefinitionCommand);
  assert.equal(
    (commands[1] as DeregisterTaskDefinitionCommand).input.taskDefinition,
    taskDefinitionArn
  );
  assert.match(roleSessionName, /^[A-Za-z0-9+=,.@-]+$/u);
  assert.equal(roleSessionName.includes(":"), false);
  assert.equal(clientDestroyed, true);
  assert.deepEqual(JSON.parse(sessionPolicy), {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["ecs:DescribeTaskDefinition", "ecs:DeregisterTaskDefinition"],
        Resource: taskDefinitionArn
      }
    ]
  });
});
