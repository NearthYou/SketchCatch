import assert from "node:assert/strict";
import test from "node:test";
import {
  createGitHubReleaseIdentityVerifier,
  githubInfrastructureOidcAudience,
  githubReleaseOidcAudience,
  isExactGitHubWorkflowRef
} from "./github-oidc-release-identity.js";

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

test("GitHub OIDC verifier keeps the App audience by default and accepts the explicit Infra audience", async () => {
  const audiences: string[] = [];
  const claims = {
    sub: "repo:jh-9999/audience-live-check:environment:sketchcatch-production",
    repository: "jh-9999/audience-live-check",
    repository_id: "123456789",
    sha: "a".repeat(40),
    ref: "refs/heads/main",
    workflow_ref:
      "jh-9999/audience-live-check/.github/workflows/sketchcatch-infra.yml@refs/heads/main",
    run_id: "987654321",
    run_attempt: "1",
    environment: "sketchcatch-production"
  };
  const verifyToken = async (_token: string, audience: string) => {
    audiences.push(audience);
    return claims;
  };

  await createGitHubReleaseIdentityVerifier({ verifyToken })("app-token");
  await createGitHubReleaseIdentityVerifier({
    audience: githubInfrastructureOidcAudience,
    verifyToken
  })("infra-token");

  assert.deepEqual(audiences, [
    githubReleaseOidcAudience,
    githubInfrastructureOidcAudience
  ]);
});

test("workflow_ref matches repository case-insensitively but requires the exact workflow path and ref", () => {
  const base = {
    repository: "jh-9999/audience-live-check",
    workflowPath: ".github/workflows/sketchcatch-app.yml" as const,
    ref: "refs/heads/main"
  };

  assert.equal(
    isExactGitHubWorkflowRef({
      ...base,
      workflowRef:
        "JH-9999/AUDIENCE-LIVE-CHECK/.github/workflows/sketchcatch-app.yml@refs/heads/main"
    }),
    true
  );
  assert.equal(
    isExactGitHubWorkflowRef({
      ...base,
      workflowRef:
        "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml.backup@refs/heads/main"
    }),
    false
  );
  assert.equal(
    isExactGitHubWorkflowRef({
      ...base,
      workflowRef:
        "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml@refs/heads/release"
    }),
    false
  );
  assert.equal(
    isExactGitHubWorkflowRef({
      ...base,
      workflowRef:
        "jh-9999/audience-live-check/.github/workflows/SketchCatch-App.yml@refs/heads/main"
    }),
    false
  );
  assert.equal(
    isExactGitHubWorkflowRef({
      repository: base.repository,
      workflowPath: ".github/workflows/sketchcatch-infra.yml",
      ref: base.ref,
      workflowRef:
        "jh-9999/audience-live-check/.github/workflows/sketchcatch-infra.yml@refs/heads/main"
    }),
    true
  );
});
