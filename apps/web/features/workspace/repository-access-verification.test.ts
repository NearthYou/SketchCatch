import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectBuildEnvironment } from "@sketchcatch/types";
import { ApiClientError } from "../../lib/api-client";
import { verifyRepositoryAccessForPlan } from "./repository-access-verification";

test("stale ready build environments are prepared once before repository verification retries", async () => {
  const calls: string[] = [];
  const updates: ProjectBuildEnvironment[] = [];
  let verificationAttempts = 0;

  const result = await verifyRepositoryAccessForPlan({
    currentBuildEnvironment: createBuildEnvironment({
      repositoryVerificationStatus: "not_checked",
      runtimeFingerprint: "a".repeat(64),
      status: "ready"
    }),
    onBuildEnvironmentChange(environment) {
      updates.push(environment);
    },
    async prepare() {
      calls.push("prepare");
      return createBuildEnvironment({
        repositoryVerificationStatus: "not_checked",
        runtimeFingerprint: "b".repeat(64),
        status: "ready"
      });
    },
    async verify() {
      calls.push("verify");
      verificationAttempts += 1;
      if (verificationAttempts === 1) {
        throw new ApiClientError(409, {
          error: "REPOSITORY_ACCESS_VERIFICATION_REQUIRED",
          message: "The project build environment changed and must be prepared again"
        });
      }
      return createBuildEnvironment({
        repositoryVerificationStatus: "verified",
        repositoryVerifiedAt: "2026-07-18T01:00:00.000Z",
        runtimeFingerprint: "b".repeat(64),
        status: "ready"
      });
    }
  });

  assert.deepEqual(calls, ["verify", "prepare", "verify"]);
  assert.equal(updates.at(-1)?.repositoryVerificationStatus, "verified");
  assert.equal(result.repositoryVerificationStatus, "verified");
});

test("unrelated verification conflicts are not retried", async () => {
  const calls: string[] = [];

  await assert.rejects(
    verifyRepositoryAccessForPlan({
      currentBuildEnvironment: createBuildEnvironment(),
      onBuildEnvironmentChange() {},
      async prepare() {
        calls.push("prepare");
        return createBuildEnvironment();
      },
      async verify() {
        calls.push("verify");
        throw new ApiClientError(409, {
          error: "conflict",
          message: "Another deployment conflict"
        });
      }
    }),
    (error) => error instanceof ApiClientError && error.code === "conflict"
  );

  assert.deepEqual(calls, ["verify"]);
});

test("stale verification retries at most once", async () => {
  const calls: string[] = [];

  await assert.rejects(
    verifyRepositoryAccessForPlan({
      currentBuildEnvironment: createBuildEnvironment(),
      onBuildEnvironmentChange() {},
      async prepare() {
        calls.push("prepare");
        return createBuildEnvironment({ runtimeFingerprint: "b".repeat(64) });
      },
      async verify() {
        calls.push("verify");
        throw new ApiClientError(409, {
          error: "REPOSITORY_ACCESS_VERIFICATION_REQUIRED",
          message: "The project build environment changed and must be prepared again"
        });
      }
    }),
    (error) =>
      error instanceof ApiClientError && error.code === "REPOSITORY_ACCESS_VERIFICATION_REQUIRED"
  );

  assert.deepEqual(calls, ["verify", "prepare", "verify"]);
});

function createBuildEnvironment(
  overrides: Partial<ProjectBuildEnvironment> = {}
): ProjectBuildEnvironment {
  return {
    id: "build-environment-1",
    projectId: "fdac763f-0fc9-4526-9e85-6d46a7c7036c",
    awsConnectionId: "aws-connection-1",
    awsCodeConnectionId: "code-connection-1",
    codeBuildProjectName: "sketchcatch-fdac763f-build",
    codeBuildServiceRoleArn: "arn:aws:iam::131404649047:role/SketchCatchCodeBuild-fdac763f",
    permissionsBoundaryArn:
      "arn:aws:iam::131404649047:policy/SketchCatchCodeBuildBoundary-connection",
    sourceRepositoryUrl: "https://github.com/jh-9999/audience-live-check.git",
    runtimeFingerprint: "a".repeat(64),
    status: "ready",
    lastVerifiedAt: "2026-07-18T00:00:00.000Z",
    repositoryVerificationStatus: "not_checked",
    repositoryVerificationRequestedCommitSha: null,
    repositoryVerificationResolvedCommitSha: null,
    repositoryVerificationBuildArn: null,
    repositoryVerificationStatusReason: null,
    repositoryVerifiedAt: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides
  };
}
