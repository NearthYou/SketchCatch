import assert from "node:assert/strict";
import { test } from "node:test";
import type { EcsGitOpsReleaseEvidence } from "@sketchcatch/types";
import {
  createEcsGitOpsReleaseReconciler,
  EcsGitOpsReleaseVerificationError,
  type EcsGitOpsCloudGateway,
  type EcsGitOpsReleaseRepository
} from "./ecs-gitops-release-reconciler.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const pipelineRunId = "22222222-2222-4222-8222-222222222222";
const commitSha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const taskDefinitionArn =
  "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/sketchcatch-api:42";
const previousTaskDefinitionArn =
  "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/sketchcatch-api:41";

test("successful ECS evidence is re-queried and upserted into the project release ledger", async () => {
  const repository = createRepository();
  const gateway = createGateway();
  const reconciler = createEcsGitOpsReleaseReconciler({
    repository,
    gateway,
    createId: () => "33333333-3333-4333-8333-333333333333",
    now: () => new Date("2026-07-14T02:00:00.000Z")
  });

  const release = await reconciler.reconcile({
    projectId,
    pipelineRunId,
    commitSha,
    pipelineStatus: "succeeded",
    startedAt: new Date("2026-07-14T01:00:00.000Z"),
    finishedAt: new Date("2026-07-14T01:03:00.000Z"),
    evidence: createEvidence()
  });

  assert.equal(gateway.calls.length, 1);
  assert.equal(gateway.calls[0]?.serviceName, "sketchcatch-api");
  assert.equal(release?.status, "succeeded");
  assert.equal(release?.version, `sha-${commitSha.slice(0, 12)}`);
  assert.equal(release?.artifactDigest, "b".repeat(64));
  assert.equal(release?.providerRevision?.revisionId, taskDefinitionArn);
  assert.equal(release?.outputUrl, "https://api.example.com");
  assert.equal(repository.saved.length, 1);
});

test("a completed circuit-breaker rollback records the restored ECS revision", async () => {
  const repository = createRepository();
  const gateway = createGateway({ taskDefinitionArn: previousTaskDefinitionArn });
  const reconciler = createEcsGitOpsReleaseReconciler({ repository, gateway });

  const release = await reconciler.reconcile({
    projectId,
    pipelineRunId,
    commitSha,
    pipelineStatus: "failed",
    startedAt: null,
    finishedAt: new Date("2026-07-14T01:03:00.000Z"),
    evidence: createEvidence({
      outcome: "rolled_back",
      restoredTaskDefinitionArn: previousTaskDefinitionArn
    })
  });

  assert.equal(release?.status, "rolled_back");
  assert.equal(release?.providerRevision?.revisionId, previousTaskDefinitionArn);
  assert.deepEqual(release?.rollbackEvidence, {
    attemptedTaskDefinitionArn: taskDefinitionArn,
    restoredTaskDefinitionArn: previousTaskDefinitionArn
  });
});

test("ECS drift rejects release persistence", async () => {
  const repository = createRepository();
  const gateway = createGateway({
    imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch/api@sha256:${"c".repeat(64)}`
  });
  const reconciler = createEcsGitOpsReleaseReconciler({ repository, gateway });

  await assert.rejects(
    reconciler.reconcile({
      projectId,
      pipelineRunId,
      commitSha,
      pipelineStatus: "succeeded",
      startedAt: null,
      finishedAt: new Date("2026-07-14T01:03:00.000Z"),
      evidence: createEvidence()
    }),
    EcsGitOpsReleaseVerificationError
  );
  assert.equal(repository.saved.length, 0);
});

function createEvidence(
  overrides: Partial<EcsGitOpsReleaseEvidence> = {}
): EcsGitOpsReleaseEvidence {
  return {
    schemaVersion: 1,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha,
    imageDigest: digest,
    imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch/api@${digest}`,
    clusterName: "sketchcatch-api",
    serviceName: "sketchcatch-api",
    containerName: "api",
    taskDefinitionArn,
    previousTaskDefinitionArn,
    outputUrl: "https://api.example.com",
    ...overrides
  };
}

function createRepository(): EcsGitOpsReleaseRepository & { saved: Array<Record<string, unknown>> } {
  const saved: Array<Record<string, unknown>> = [];
  return {
    saved,
    async findVerificationTarget() {
      return {
        projectId,
        connection: {
          roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
          externalId: "external-id",
          region: "ap-northeast-2"
        },
        runtimeConfig: {
          runtimeTargetKind: "ecs_fargate",
          codeBuildProjectName: "sketchcatch-api-build",
          ecrRepositoryName: "sketchcatch/api",
          clusterName: "sketchcatch-api",
          serviceName: "sketchcatch-api",
          containerName: "api",
          outputUrl: "https://api.example.com"
        }
      };
    },
    async upsertRelease(input) {
      saved.push(input);
      return input;
    }
  };
}

function createGateway(
  overrides: Partial<Awaited<ReturnType<EcsGitOpsCloudGateway["inspect"]>>> = {}
): EcsGitOpsCloudGateway & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    async inspect(input) {
      calls.push(input);
      return {
        taskDefinitionArn,
        desiredCount: 2,
        runningCount: 2,
        minimumHealthyPercent: 0,
        maximumPercent: 100,
        circuitBreakerEnabled: true,
        circuitBreakerRollback: true,
        containerName: "api",
        imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch/api@${digest}`,
        ...overrides
      };
    }
  };
}
