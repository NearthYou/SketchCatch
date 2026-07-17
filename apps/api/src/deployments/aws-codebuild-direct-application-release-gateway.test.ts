import assert from "node:assert/strict";
import test from "node:test";

import { createPreflightCodeBuildSessionPolicy } from "./aws-codebuild-direct-application-release-gateway.js";

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
