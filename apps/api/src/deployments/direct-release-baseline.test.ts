import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationReleaseProviderRevision } from "@sketchcatch/types";

import {
  assertTrustedRollbackCanBeRecorded,
  resolvePersistedEcsReleaseBaseline
} from "./aws-codebuild-direct-application-release-gateway.js";

const providerRevision: ApplicationReleaseProviderRevision = {
  provider: "aws",
  resourceType: "ecs_task_definition",
  revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:4",
  artifactReference: "deployments/deployment-1/release-candidates/candidate-1/candidate.json",
  metadata: {
    taskDefinitionArn: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:4",
    imageDigest: `sha256:${"a".repeat(64)}`
  }
};

test("trusted Direct release uses only the baseline ID persisted at preparation", () => {
  assert.deepEqual(
    resolvePersistedEcsReleaseBaseline({
      baselineReleaseId: "release-baseline",
      baseline: {
        id: "release-baseline",
        projectId: "project-1",
        runtimeTargetKind: "ecs_fargate",
        deploymentTargetFingerprint: "a".repeat(64),
        status: "succeeded",
        providerRevision
      },
      projectId: "project-1",
      deploymentTargetFingerprint: "a".repeat(64)
    }),
    {
      releaseId: "release-baseline",
      taskDefinitionArn: providerRevision.revisionId,
      imageDigest: `sha256:${"a".repeat(64)}`
    }
  );
});

test("trusted Direct release has no rollback baseline when preparation persisted none", () => {
  assert.equal(
    resolvePersistedEcsReleaseBaseline({
      baselineReleaseId: null,
      baseline: undefined,
      projectId: "project-1",
      deploymentTargetFingerprint: "a".repeat(64)
    }),
    null
  );
});

test("trusted Direct release rejects a baseline that differs from the persisted snapshot", () => {
  assert.throws(
    () =>
      resolvePersistedEcsReleaseBaseline({
        baselineReleaseId: "release-baseline",
        baseline: {
          id: "release-latest-but-not-approved",
          projectId: "project-1",
          runtimeTargetKind: "ecs_fargate",
          deploymentTargetFingerprint: "a".repeat(64),
          status: "succeeded",
          providerRevision
        },
        projectId: "project-1",
        deploymentTargetFingerprint: "a".repeat(64)
      }),
    /persisted rollback baseline/i
  );
});

test("trusted Direct release rejects a rollback baseline from a replaced deployment target", () => {
  assert.throws(
    () =>
      resolvePersistedEcsReleaseBaseline({
        baselineReleaseId: "release-baseline",
        baseline: {
          id: "release-baseline",
          projectId: "project-1",
          runtimeTargetKind: "ecs_fargate",
          deploymentTargetFingerprint: "a".repeat(64),
          status: "succeeded",
          providerRevision
        },
        projectId: "project-1",
        deploymentTargetFingerprint: "b".repeat(64)
      }),
    /deployment target/i
  );
});

test("first ECS release cannot record a bootstrap restore as a successful rollback", () => {
  assert.throws(
    () => assertTrustedRollbackCanBeRecorded("rolled_back", null),
    /bootstrap task definition/i
  );
  assert.doesNotThrow(() =>
    assertTrustedRollbackCanBeRecorded("rolled_back", {
      releaseId: "release-baseline",
      taskDefinitionArn: providerRevision.revisionId,
      imageDigest: `sha256:${"a".repeat(64)}`
    })
  );
});
