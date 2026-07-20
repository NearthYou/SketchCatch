import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitCicdAwsRoleDiff,
  GitCicdRepositorySettingsPreview
} from "@sketchcatch/types";
import {
  buildRepositorySettingsReview,
  canApplyReviewedChange,
  getAwsRoleDiffPreviewRevision,
  getRepositorySettingsPreviewRevision
} from "./cicd-change-review";

test("builds a deterministic Repository review from variable values and secret names only", () => {
  const preview = {
    environmentName: "production",
    variables: { Z_REGION: "ap-northeast-2", A_PROJECT: "demo" },
    secrets: ["RELEASE_TOKEN", "AWS_CREDENTIALS"],
    workflowFiles: ["release.yml", "deploy.yml"],
    secretValue: "must-not-leak",
    credential: "must-not-leak",
    token: "must-not-leak"
  } as GitCicdRepositorySettingsPreview & Record<string, unknown>;

  const review = buildRepositorySettingsReview(preview);
  const serialized = JSON.stringify(review);

  assert.deepEqual(review.variables, [
    { name: "A_PROJECT", value: "demo" },
    { name: "Z_REGION", value: "ap-northeast-2" }
  ]);
  assert.deepEqual(review.secrets, ["AWS_CREDENTIALS", "RELEASE_TOKEN"]);
  assert.deepEqual(review.workflowFiles, ["deploy.yml", "release.yml"]);
  assert.doesNotMatch(serialized, /must-not-leak|secretValue|"credential"|"token"/u);
});

test("creates the same Repository revision regardless of object and list order", () => {
  const first = repositoryPreview({
    variables: { B: "2", A: "1" },
    secrets: ["Z", "A"],
    workflowFiles: ["z.yml", "a.yml"]
  });
  const second = repositoryPreview({
    variables: { A: "1", B: "2" },
    secrets: ["A", "Z"],
    workflowFiles: ["a.yml", "z.yml"]
  });

  assert.equal(
    getRepositorySettingsPreviewRevision(first),
    getRepositorySettingsPreviewRevision(second)
  );
});

test("invalidates confirmation when the Repository preview revision changes", () => {
  const confirmedRevision = getRepositorySettingsPreviewRevision(repositoryPreview());
  const changedRevision = getRepositorySettingsPreviewRevision(
    repositoryPreview({ variables: { A: "changed" } })
  );

  assert.equal(canApplyReviewedChange({ confirmedRevision, previewRevision: confirmedRevision }), true);
  assert.equal(canApplyReviewedChange({ confirmedRevision, previewRevision: changedRevision }), false);
  assert.equal(canApplyReviewedChange({ confirmedRevision: null, previewRevision: changedRevision }), false);
});

test("creates a deterministic AWS Role revision from the server diff", () => {
  const first = awsRoleDiff({ requiredTrustConditions: { sub: "repo", aud: "sts" } });
  const second = awsRoleDiff({ requiredTrustConditions: { aud: "sts", sub: "repo" } });

  assert.equal(getAwsRoleDiffPreviewRevision(first), getAwsRoleDiffPreviewRevision(second));
  assert.notEqual(
    getAwsRoleDiffPreviewRevision(first),
    getAwsRoleDiffPreviewRevision(awsRoleDiff({ targetBranch: "release" }))
  );
});

function repositoryPreview(
  overrides: Partial<GitCicdRepositorySettingsPreview> = {}
): GitCicdRepositorySettingsPreview {
  return {
    environmentName: "production",
    variables: { A: "1" },
    secrets: ["DEPLOY_SECRET"],
    workflowFiles: ["deploy.yml"],
    ...overrides
  };
}

function awsRoleDiff(overrides: Partial<GitCicdAwsRoleDiff> = {}): GitCicdAwsRoleDiff {
  return {
    roleArn: "arn:aws:iam::123456789012:role/deploy",
    repository: "owner/repository",
    targetBranch: "main",
    environmentName: "production",
    requiredTrustConditions: { aud: "sts", sub: "repo" },
    approved: false,
    approvedByUserId: null,
    approvedAt: null,
    ...overrides
  };
}
