import assert from "node:assert/strict";
import test from "node:test";

import {
  createPreflightBuildCacheEnvironmentOverrides,
  createPreflightCodeBuildSessionPolicy
} from "./aws-codebuild-direct-application-release-gateway.js";

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
