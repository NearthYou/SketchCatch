import assert from "node:assert/strict";
import test from "node:test";
import type { JsonValue } from "@sketchcatch/types";
import type { DirectApplicationReleaseRecord } from "./direct-application-release-service.js";
import {
  recoverInterruptedDirectApplicationRelease,
  type DirectReleaseRecoveryDependencies,
  type InterruptedDirectApplicationReleaseData
} from "./direct-release-recovery.js";
import type {
  ProjectExecutionLeaseRecord,
  ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import type {
  TrustedReleaseGateway,
  TrustedReleaseRepository
} from "../releases/trusted-release-worker-service.js";

const now = new Date("2026-07-16T02:00:00.000Z");

test("direct restart recovery rolls ECS back to the persisted successful baseline", async () => {
  const calls: string[] = [];
  const data = createData([
    { step: "runtime_verification", status: "succeeded", evidence: { currentTaskDefinitionArn: "arn:task:old" } },
    { step: "ecs_activation", status: "succeeded", evidence: { taskDefinitionArn: "arn:task:new", previousTaskDefinitionArn: "arn:task:old" } }
  ]);
  const dependencies = createDependencies(calls);

  const result = await recoverInterruptedDirectApplicationRelease(data, dependencies, {
    now: () => now,
    generateRecoveryHolderId: () => "recovery:direct:1"
  });

  assert.equal(result, "rolled_back");
  assert.deepEqual(calls.filter((call) => call.startsWith("aws:")), [
    "aws:verify_runtime",
    "aws:rollback:arn:task:old"
  ]);
  assert.equal(calls.includes("release:rolled_back"), true);
  assert.equal(calls.includes("release:fence:recovery:direct:1:1"), true);
  assert.equal(calls.includes("deployment:failed:application_release"), true);
  assert.equal(calls.includes("deployment:fence:recovery:direct:1:1"), true);
});

test("direct restart recovery marks a release failed when AWS mutation never started", async () => {
  const calls: string[] = [];
  const dependencies = createDependencies(calls);

  const result = await recoverInterruptedDirectApplicationRelease(
    createData([{ step: "runtime_verification", status: "running", evidence: null }]),
    dependencies,
    { now: () => now, generateRecoveryHolderId: () => "recovery:direct:2" }
  );

  assert.equal(result, "failed_before_ecs");
  assert.equal(calls.some((call) => call.startsWith("aws:")), false);
  assert.equal(calls.includes("release:failed"), true);
  assert.equal(calls.includes("candidate:failed"), true);
});

test("direct restart recovery stays non-terminal until frontend activation evidence is reconciled", async () => {
  const calls: string[] = [];
  const dependencies = createDependencies(calls);
  const data = createData([
    { step: "ecs_activation", status: "succeeded", evidence: { taskDefinitionArn: "arn:task:new", previousTaskDefinitionArn: "arn:task:old" } },
    { step: "frontend_activation", status: "running", evidence: null }
  ]);

  await assert.rejects(
    recoverInterruptedDirectApplicationRelease(data, dependencies, {
      now: () => now,
      generateRecoveryHolderId: () => "recovery:direct:3"
    }),
    /S3\/CloudFront evidence reconciliation/
  );
  assert.equal(calls.some((call) => call.startsWith("aws:rollback")), false);
  assert.equal(calls.includes("release:partial-cancel:frontend_activation"), false);
});

test("direct restart recovery takes over a CodeBuild lease only after terminal verification", async () => {
  const calls: string[] = [];
  const dependencies = createDependencies(calls);
  dependencies.leaseRepository = createLeaseRepository({
    projectId: "project-1",
    holderId: "deployment-1",
    source: "direct",
    fencingVersion: 1,
    status: "active",
    activeCodeBuildId: "build-1",
    activeWorkerTaskArn: null,
    heartbeatAt: now,
    expiresAt: now,
    createdAt: now,
    updatedAt: now
  });
  dependencies.codeBuildTerminalConfirmed = true;

  const result = await recoverInterruptedDirectApplicationRelease(
    createData([{ step: "runtime_verification", status: "running", evidence: null }]),
    dependencies,
    { now: () => now, generateRecoveryHolderId: () => "recovery:direct:4" }
  );

  assert.equal(result, "failed_before_ecs");
  assert.equal(calls.includes("release:failed"), true);
});

test("direct restart recovery restores an interrupted frontend retry to partial failure", async () => {
  const calls: string[] = [];
  const dependencies = createDependencies(calls);
  const data = createData([
    { step: "frontend_activation", status: "succeeded", evidence: null },
    { step: "cloudfront_invalidation", status: "running", evidence: null }
  ]);
  data.release = {
    ...createRelease("retrying"),
    failureStage: "cloudfront_invalidation",
    outputUrl: "https://demo.cloudfront.net"
  };

  const result = await recoverInterruptedDirectApplicationRelease(data, dependencies, {
    now: () => now,
    generateRecoveryHolderId: () => "recovery:direct:retry"
  });

  assert.equal(result, "frontend_retry_failed");
  assert.equal(calls.includes("release:frontend-retry-failed:cloudfront_invalidation"), true);
  assert.equal(calls.some((call) => call.startsWith("aws:")), false);
});

function createDependencies(calls: string[]): DirectReleaseRecoveryDependencies {
  const trustedRepository: TrustedReleaseRepository = {
    async recordStep(input) {
      calls.push(`step:${input.step}:${input.status}`);
    },
    async markCandidateStatus(input) {
      calls.push(`candidate:${input.status}`);
    },
    async markPartialFailure() {},
    async markPartialCancellation(input) {
      calls.push(`release:partial-cancel:${input.failureStage}`);
    },
    async beginFrontendRetry() {},
    async completeFrontendRetry() {},
    async markFrontendRetryFailure(input) {
      calls.push(`release:frontend-retry-failed:${input.failureStage}`);
    }
  };
  const gateway: TrustedReleaseGateway = {
    async verifyCandidate() {},
    async verifyRuntime() {
      calls.push("aws:verify_runtime");
      return { currentTaskDefinitionArn: "arn:task:new" };
    },
    async publishApi() {
      throw new Error("recovery must not publish a new image");
    },
    async activateEcs() {
      throw new Error("recovery must not activate a new task definition");
    },
    async verifyEcsHealth({ taskDefinitionArn }) {
      calls.push(`aws:verify_health:${taskDefinitionArn}`);
      return { state: "healthy", taskDefinitionArn };
    },
    async rollbackEcs({ taskDefinitionArn, beforeMutation }) {
      await beforeMutation();
      calls.push(`aws:rollback:${taskDefinitionArn}`);
      return { state: "restored", taskDefinitionArn };
    },
    async uploadFrontend() {
      throw new Error("recovery must not upload frontend assets");
    },
    async activateFrontend() {
      throw new Error("recovery must not activate frontend assets");
    },
    async invalidateFrontend() {
      throw new Error("recovery must not invalidate CloudFront");
    },
    async verifyPublic() {
      return { state: "healthy" };
    }
  };
  return {
    leaseRepository: createLeaseRepository(),
    trustedRepository,
    gateway,
    releaseRepository: {
      async saveCompletedRelease(input) {
        calls.push(`release:${input.status}`);
        calls.push(
          `release:fence:${input.leaseFence?.holderId}:${input.leaseFence?.fencingVersion}`
        );
        return createRelease(input.status as DirectApplicationReleaseRecord["status"]);
      },
      async saveFailedRelease(input) {
        calls.push("release:failed");
        calls.push(
          `release:fence:${input.leaseFence?.holderId}:${input.leaseFence?.fencingVersion}`
        );
        return createRelease("failed");
      }
    },
    deploymentRepository: {
      async cancelDeployment() {
        calls.push("deployment:cancelled");
        return undefined;
      },
      async failDeployment(_deploymentId: string, input) {
        calls.push(`deployment:failed:${input.failureStage}`);
        calls.push(
          `deployment:fence:${input.leaseFence?.holderId}:${input.leaseFence?.fencingVersion}`
        );
        return undefined;
      }
    }
  };
}

function createData(
  steps: Array<{ step: string; status: string; evidence: JsonValue | null }>
): InterruptedDirectApplicationReleaseData {
  return {
    context: {
      sourceRepository: null,
      deployment: {
        id: "deployment-1",
        projectId: "project-1",
        scope: "full_stack",
        source: "direct",
        targetKind: "ecs_fargate"
      },
      target: {
        runtimeTargetKind: "ecs_fargate",
        confirmedBuildConfig: {
          sourceRoot: ".",
          evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
          dockerfilePath: "Dockerfile",
          installPreset: "none",
          buildPreset: "docker_build",
          artifactOutputPath: null,
          runtimeEntrypoint: null,
          healthCheckPath: "/health",
          packageManifestPath: null,
          samTemplatePath: null,
          appSpecPath: null,
          staticOutputPath: null,
          exactSemVerTag: null,
          manifestVersion: null,
          confirmedCommitSha: "a".repeat(40),
          confirmedAt: now.toISOString(),
          ecsWeb: {
            api: {
              sourceRoot: ".",
              dockerfilePath: "Dockerfile",
              containerPort: 8080,
              healthCheckPath: "/health"
            },
            frontend: {
              sourceRoot: "web",
              outputPath: "dist",
              packageManifestPath: "web/package.json",
              lockfilePath: "pnpm-lock.yaml",
              packageManager: "pnpm",
              packageManagerVersion: "10.13.1",
              installPreset: "pnpm_frozen_lockfile",
              buildPreset: "pnpm_build"
            }
          }
        },
        runtimeConfig: {
          runtimeTargetKind: "ecs_fargate",
          codeBuildProjectName: "demo-app-build",
          clusterName: "cluster",
          serviceName: "service",
          containerName: "app",
          containerPort: 8080,
          taskDefinitionFamily: "demo",
          taskDefinitionArn:
            "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:1",
          taskRoleArn: "arn:aws:iam::123456789012:role/demo-task",
          executionRoleArn: "arn:aws:iam::123456789012:role/demo-execution",
          targetGroupArn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/123",
          loadBalancerArn:
            "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/123",
          loadBalancerDnsName: "demo.ap-northeast-2.elb.amazonaws.com",
          ecrRepositoryName: "demo",
          ecrRepositoryArn: "arn:aws:ecr:ap-northeast-2:123456789012:repository/demo",
          frontendBucketName: "demo-web",
          cloudFrontDistributionId: "EDFDVBD6EXAMPLE",
          cloudFrontDomainName: "demo.cloudfront.net",
          outputUrl: "https://demo.cloudfront.net"
        }
      },
      connection: {
        accountId: "123456789012",
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
        externalId: "external-id",
        region: "ap-northeast-2"
      }
    },
    release: createRelease("pending"),
    candidate: {
      id: "candidate-1",
      commitSha: "a".repeat(40),
      compositeDigest: "b".repeat(64),
      configFingerprint: "c".repeat(64),
      apiOciDigest: "d".repeat(64),
      apiArchiveDigest: "e".repeat(64),
      apiArchiveByteSize: 100,
      frontendArchiveDigest: "f".repeat(64),
      frontendArchiveByteSize: 200,
      frontendManifestDigest: "1".repeat(64),
      frontendIndexDigest: "2".repeat(64),
      apiArchiveObjectKey: "deployments/deployment-1/release-candidates/candidate-1/api.tar",
      apiArchiveObjectVersionId: "api-v1",
      frontendArchiveObjectKey: "deployments/deployment-1/release-candidates/candidate-1/frontend.tar",
      frontendArchiveObjectVersionId: "frontend-v1",
      frontendManifestObjectKey: "deployments/deployment-1/release-candidates/candidate-1/frontend.json",
      frontendManifestObjectVersionId: "manifest-v1",
      manifestObjectKey: "deployments/deployment-1/release-candidates/candidate-1/candidate.json",
      manifestObjectVersionId: "candidate-v1",
      expiresAt: new Date("2026-07-17T00:00:00.000Z")
    },
    steps,
    baselineRelease: {
      id: "release-baseline",
      taskDefinitionArn: "arn:task:old",
      imageDigest: `sha256:${"9".repeat(64)}`
    }
  };
}

function createRelease(status: DirectApplicationReleaseRecord["status"]): DirectApplicationReleaseRecord {
  return {
    id: "release-1",
    projectId: "project-1",
    deploymentId: "deployment-1",
    pipelineRunId: null,
    source: "direct",
    runtimeTargetKind: "ecs_fargate",
    version: "1.0.0",
    commitSha: "a".repeat(40),
    artifactDigestAlgorithm: "sha256",
    artifactDigest: "b".repeat(64),
    releaseCandidateId: "candidate-1",
    compositeDigest: { algorithm: "sha256", value: "b".repeat(64), apiOciDigest: "d".repeat(64), frontendManifestDigest: "1".repeat(64) },
    providerRevision: null,
    frontendEvidence: null,
    failureStage: null,
    outputUrl: null,
    status,
    healthEvidence: null,
    rollbackEvidence: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function createLeaseRepository(
  initial?: ProjectExecutionLeaseRecord
): ProjectExecutionLeaseRepository {
  let record: ProjectExecutionLeaseRecord | undefined = initial;
  return {
    async acquire(input) {
      record = {
        projectId: input.projectId,
        holderId: input.holderId,
        source: input.source,
        fencingVersion: 1,
        status: "active",
        activeCodeBuildId: null,
        activeWorkerTaskArn: null,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now
      };
      return record;
    },
    async find() {
      return record;
    },
    async recoverVerifiedTerminal(input) {
      if (
        !record ||
        record.holderId !== input.expectedHolderId ||
        record.fencingVersion !== input.expectedFencingVersion ||
        record.activeCodeBuildId !== input.expectedActiveCodeBuildId ||
        record.activeWorkerTaskArn !== input.expectedActiveWorkerTaskArn
      ) {
        return undefined;
      }
      record = {
        ...record,
        holderId: input.holderId,
        source: input.source,
        fencingVersion: record.fencingVersion + 1,
        activeCodeBuildId: null,
        activeWorkerTaskArn: null,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      };
      return record;
    },
    async heartbeat(input) {
      if (!record || record.fencingVersion !== input.fencingVersion) return undefined;
      record = { ...record, heartbeatAt: input.now, expiresAt: input.expiresAt };
      return record;
    },
    async setExecutionCoordinates() {
      return record;
    },
    async release(input) {
      if (!record || record.fencingVersion !== input.fencingVersion) return false;
      record = undefined;
      return true;
    }
  };
}
