import assert from "node:assert/strict";
import test from "node:test";
import { deriveSettingsConnectionFlowState } from "./settings-connection-flow-state";

test("AWS connection stays available when GitHub App setup is incomplete", () => {
  const flow = deriveSettingsConnectionFlowState({
    codeBuildStatus: undefined,
    githubReady: false,
    hasVerifiedAwsConnection: false
  });

  assert.equal(flow.githubStepState, "current");
  assert.equal(flow.awsStepState, "current");
  assert.equal(flow.codeBuildStepState, "locked");
  assert.equal(flow.recommendedConnectionStep, "aws");
});

test("CodeBuild remains locked until both GitHub and AWS are ready", () => {
  const githubOnly = deriveSettingsConnectionFlowState({
    codeBuildStatus: undefined,
    githubReady: true,
    hasVerifiedAwsConnection: false
  });
  const awsOnly = deriveSettingsConnectionFlowState({
    codeBuildStatus: undefined,
    githubReady: false,
    hasVerifiedAwsConnection: true
  });
  const ready = deriveSettingsConnectionFlowState({
    codeBuildStatus: "AVAILABLE",
    githubReady: true,
    hasVerifiedAwsConnection: true
  });

  assert.equal(githubOnly.codeBuildStepState, "locked");
  assert.equal(awsOnly.codeBuildStepState, "locked");
  assert.equal(ready.codeBuildStepState, "complete");
  assert.equal(ready.recommendedConnectionStep, null);
});
