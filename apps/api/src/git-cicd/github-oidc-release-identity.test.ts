import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubReleaseIdentityVerifier } from "./github-oidc-release-identity.js";

test("GitHub release OIDC verifier requires the workflow identity claims", async () => {
  const verify = createGitHubReleaseIdentityVerifier({
    verifyToken: async () => ({
      sub: "repo:jh-9999/audience-live-check:environment:sketchcatch-production",
      repository: "jh-9999/audience-live-check",
      repository_id: "123456789",
      sha: "A".repeat(40),
      ref: "refs/heads/main",
      job_workflow_ref:
        "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml@refs/heads/main",
      run_id: "987654321",
      run_attempt: "2",
      environment: "sketchcatch-production"
    })
  });

  const identity = await verify("signed-token");
  assert.equal(identity.commitSha, "a".repeat(40));
  assert.equal(identity.workflowRunAttempt, 2);
  assert.equal(identity.repositoryId, "123456789");
});

test("GitHub release OIDC verifier rejects incomplete claims", async () => {
  const verify = createGitHubReleaseIdentityVerifier({
    verifyToken: async () => ({ sub: "repo:owner/name:ref:refs/heads/main" })
  });

  await assert.rejects(() => verify("signed-token"), /identity could not be verified/i);
});

test("GitHub release OIDC verifier accepts workflow_ref for a non-reusable workflow", async () => {
  const workflowRef =
    "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml@refs/heads/main";
  const verify = createGitHubReleaseIdentityVerifier({
    verifyToken: async () => ({
      sub: "repo:jh-9999/audience-live-check:environment:sketchcatch-production",
      repository: "jh-9999/audience-live-check",
      repository_id: "123456789",
      sha: "a".repeat(40),
      ref: "refs/heads/main",
      workflow_ref: workflowRef,
      run_id: "987654321",
      run_attempt: "1",
      environment: "sketchcatch-production"
    })
  });

  assert.equal((await verify("signed-token")).workflowRef, workflowRef);
});
