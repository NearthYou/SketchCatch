import assert from "node:assert/strict";
import test from "node:test";
import {
  executeTrustedEcsRollback,
  executeTrustedFrontendRetry,
  executeTrustedRelease,
  type TrustedReleaseContext,
  type TrustedReleaseGateway,
  type TrustedReleaseRepository
} from "./trusted-release-worker-service.js";
import type {
  ProjectExecutionLeaseRecord,
  ProjectExecutionLeaseRepository
} from "./project-execution-lease-service.js";

const now = new Date("2026-07-15T12:00:00.000Z");

test("trusted release activates healthy ECS before frontend and public verification", async () => {
  const calls: string[] = [];
  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    createGateway(calls),
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(calls.filter((value) => !value.startsWith("step:")), [
    "candidate:activating",
    "verify_candidate",
    "publish_api",
    "activate_ecs",
    "verify_ecs",
    "upload_frontend",
    "activate_frontend",
    "invalidate_frontend",
    "verify_public",
    "candidate:succeeded",
    "cleanup:success"
  ]);
});

test("the top-level orchestrator can retain the lease until terminal state is stored", async () => {
  const calls: string[] = [];
  const leaseRepository = createLeaseRepository();
  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    createGateway(calls),
    leaseRepository,
    { now: () => now, releaseLeaseOnCompletion: false }
  );

  assert.equal(result.status, "succeeded");
  assert.equal((await leaseRepository.find("project-1"))?.status, "active");
});

test("trusted release passes a live lease guard to every runtime mutation stage", async () => {
  const calls: string[] = [];
  const guarded = async (value: unknown, name: string) => {
    const guard = readMutationGuard(value);
    await guard();
    calls.push(`guard:${name}`);
  };
  const gateway = createGateway(calls, {
    async publishApi(_context, control?: unknown) {
      await guarded(control, "publish_api");
      calls.push("publish_api");
      return { imageDigest: `sha256:${"e".repeat(64)}`, imageUri: "ecr/image@sha256:digest" };
    },
    async activateEcs(input) {
      await guarded(input, "activate_ecs");
      calls.push("activate_ecs");
      return {
        taskDefinitionArn: "arn:task:new",
        previousTaskDefinitionArn: "arn:task:old"
      };
    },
    async uploadFrontend(input) {
      await guarded(input, "upload_frontend");
      calls.push("upload_frontend");
      return { manifestObjectKey: "manifest.json", manifestVersionId: "v1" };
    },
    async activateFrontend(input) {
      await guarded(input, "activate_frontend");
      calls.push("activate_frontend");
      return {
        manifestObjectKey: "manifest.json",
        manifestVersionId: "v1",
        indexObjectKey: "index.html",
        indexVersionId: "v2",
        commitMarker: "a".repeat(40)
      };
    },
    async invalidateFrontend(input) {
      await guarded(input, "invalidate_frontend");
      calls.push("invalidate_frontend");
      return { ...input.activation, invalidationId: "I123" };
    }
  });

  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(calls.filter((value) => value.startsWith("guard:")), [
    "guard:publish_api",
    "guard:activate_ecs",
    "guard:upload_frontend",
    "guard:activate_frontend",
    "guard:invalidate_frontend"
  ]);
});

test("trusted release keeps the lease alive while a long-running stage is active", async () => {
  const calls: string[] = [];
  let heartbeatCount = 0;
  const leaseRepository = createLeaseRepository();
  const originalHeartbeat = leaseRepository.heartbeat;
  leaseRepository.heartbeat = async (input) => {
    heartbeatCount += 1;
    return originalHeartbeat(input);
  };
  const gateway = createGateway(calls, {
    async verifyCandidate() {
      calls.push("verify_candidate");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });

  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    gateway,
    leaseRepository,
    { now: () => now, heartbeatIntervalMs: 5 }
  );

  assert.equal(result.status, "succeeded");
  assert.equal(heartbeatCount > 8, true);
});

test("trusted release rolls ECS back when the new revision is unhealthy", async () => {
  const calls: string[] = [];
  const gateway = createGateway(calls, {
    async verifyEcsHealth() {
      calls.push("verify_ecs");
      throw new Error("new task is unhealthy");
    }
  });
  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.status, "rolled_back");
  assert.equal(calls.includes("rollback_ecs"), true);
  assert.equal(calls.includes("activate_frontend"), false);
});

test("trusted release preserves healthy ECS when frontend activation fails", async () => {
  const calls: string[] = [];
  const gateway = createGateway(calls, {
    async activateFrontend() {
      calls.push("activate_frontend");
      throw new Error("S3 upload failed");
    }
  });
  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.status, "partially_failed");
  assert.equal(calls.includes("rollback_ecs"), false);
  assert.equal(calls.includes("partial:frontend_activation"), true);
  assert.equal(calls.includes("cleanup:retain_frontend"), true);
});

test("trusted release records CloudFront invalidation separately from frontend activation", async () => {
  const calls: string[] = [];
  const gateway = createGateway(calls, {
    async invalidateFrontend() {
      calls.push("invalidate_frontend");
      throw new Error("CloudFront invalidation failed");
    }
  });
  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.status, "partially_failed");
  assert.equal(result.failureStage, "cloudfront_invalidation");
  assert.equal(calls.includes("partial:cloudfront_invalidation"), true);
});

test("trusted release rolls ECS back before completing cancellation", async () => {
  const calls: string[] = [];
  const abortController = new AbortController();
  const gateway = createGateway(calls, {
    async activateEcs() {
      calls.push("activate_ecs");
      abortController.abort();
      return {
        taskDefinitionArn: "arn:task:new",
        previousTaskDefinitionArn: "arn:task:old"
      };
    }
  });
  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now, abortSignal: abortController.signal }
  );

  assert.equal(result.status, "cancelled");
  assert.equal(calls.includes("rollback_ecs"), true);
  assert.equal(calls.includes("activate_frontend"), false);
  assert.equal(calls.includes("candidate:cancelled"), true);
});

test("trusted release records partial cancellation after index activation", async () => {
  const calls: string[] = [];
  const abortController = new AbortController();
  const gateway = createGateway(calls, {
    async activateFrontend() {
      calls.push("activate_frontend");
      abortController.abort();
      return {
        manifestObjectKey: "manifest.json",
        manifestVersionId: "v1",
        indexObjectKey: "index.html",
        indexVersionId: "v2",
        commitMarker: "a".repeat(40)
      };
    }
  });
  const result = await executeTrustedRelease(
    createContext(),
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now, abortSignal: abortController.signal }
  );

  assert.equal(result.status, "partially_cancelled");
  assert.equal(calls.includes("rollback_ecs"), false);
  assert.equal(calls.includes("partial-cancel:frontend_activation"), true);
});

test("frontend retry reuses the candidate without publishing or activating ECS again", async () => {
  const calls: string[] = [];
  const result = await executeTrustedFrontendRetry(
    createContext(),
    "arn:task:new",
    createRepository(calls),
    createGateway(calls),
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(calls.filter((value) => !value.startsWith("step:")), [
    "frontend-retry:begin",
    "verify_candidate",
    "verify_ecs",
    "upload_frontend",
    "activate_frontend",
    "invalidate_frontend",
    "verify_public",
    "frontend-retry:succeeded",
    "cleanup:success"
  ]);
  assert.equal(calls.includes("publish_api"), false);
  assert.equal(calls.includes("activate_ecs"), false);
});

test("frontend retry keeps the partial state when CloudFront invalidation fails", async () => {
  const calls: string[] = [];
  const gateway = createGateway(calls, {
    async invalidateFrontend() {
      calls.push("invalidate_frontend");
      throw new Error("CloudFront invalidation failed");
    }
  });
  const result = await executeTrustedFrontendRetry(
    createContext(),
    "arn:task:new",
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.status, "partially_failed");
  assert.equal(result.failureStage, "cloudfront_invalidation");
  assert.equal(calls.includes("frontend-retry:failed:cloudfront_invalidation"), true);
  assert.equal(calls.includes("cleanup:retain_frontend"), true);
  assert.equal(calls.includes("publish_api"), false);
  assert.equal(calls.includes("activate_ecs"), false);
});

test("trusted ECS rollback verifies the persisted baseline before changing the service", async () => {
  const calls: string[] = [];
  const context = createContext();
  context.baseline = {
    releaseId: "release-0",
    taskDefinitionArn: "arn:task:old",
    imageDigest: `sha256:${"f".repeat(64)}`
  };
  const gateway = createGateway(calls, {
    async verifyRuntime() {
      calls.push("verify_runtime");
      return { currentTaskDefinitionArn: "arn:task:new" };
    }
  });

  const result = await executeTrustedEcsRollback(
    context as TrustedReleaseContext & {
      baseline: NonNullable<TrustedReleaseContext["baseline"]>;
    },
    createRepository(calls),
    gateway,
    createLeaseRepository(),
    { now: () => now }
  );

  assert.equal(result.taskDefinitionArn, "arn:task:old");
  assert.deepEqual(calls.filter((value) => !value.startsWith("step:")), [
    "verify_runtime",
    "rollback_ecs"
  ]);
});

function createContext(): TrustedReleaseContext {
  return {
    projectId: "12345678-1234-1234-1234-1234567890ab",
    deploymentId: "87654321-1234-1234-1234-1234567890ab",
    releaseId: "release-1",
    source: "direct",
    fencingHolderId: "release-1",
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
      externalId: "external-id",
      region: "ap-northeast-2"
    },
    candidate: {
      id: "candidate-1",
      commitSha: "a".repeat(40),
      compositeDigest: "b".repeat(64),
      configFingerprint: "1".repeat(64),
      apiOciDigest: "c".repeat(64),
      apiArchiveDigest: "2".repeat(64),
      apiArchiveByteSize: 100,
      frontendArchiveDigest: "3".repeat(64),
      frontendArchiveByteSize: 200,
      frontendManifestDigest: "d".repeat(64),
      frontendIndexDigest: "4".repeat(64),
      apiArchiveObjectKey: "deployments/deployment/release-candidates/candidate/api-image.oci.tar",
      apiArchiveObjectVersionId: "api-v1",
      frontendArchiveObjectKey: "deployments/deployment/release-candidates/candidate/frontend.tar.zst",
      frontendArchiveObjectVersionId: "frontend-v1",
      frontendManifestObjectKey:
        "deployments/deployment/release-candidates/candidate/frontend-manifest.json",
      frontendManifestObjectVersionId: "manifest-v1",
      manifestObjectKey:
        "deployments/deployment/release-candidates/candidate/candidate-manifest.json",
      manifestObjectVersionId: "candidate-v1",
      expiresAt: "2026-07-16T12:00:00.000Z"
    },
    baseline: null,
    runtime: {
      clusterName: "demo-cluster",
      serviceName: "demo-service",
      containerName: "api",
      containerPort: 3000,
      taskDefinitionFamily: "demo-task",
      taskDefinitionArn: "arn:aws:ecs:region:account:task-definition/demo-task:1",
      taskRoleArn: "arn:aws:iam::account:role/demo-task",
      executionRoleArn: "arn:aws:iam::account:role/demo-execution",
      targetGroupArn: "arn:aws:elasticloadbalancing:region:account:targetgroup/demo/1",
      loadBalancerArn: "arn:aws:elasticloadbalancing:region:account:loadbalancer/app/demo/1",
      loadBalancerDnsName: "demo.elb.amazonaws.com",
      ecrRepositoryName: "demo",
      ecrRepositoryArn: "arn:aws:ecr:region:account:repository/demo",
      frontendBucketName: "demo-web",
      cloudFrontDistributionId: "E123456",
      cloudFrontDomainName: "example.cloudfront.net",
      outputUrl: "https://example.cloudfront.net",
      healthCheckPath: "/health",
      apiProbePath: "/api/check-ins",
      runtimeEntrypoint: null
    }
  };
}

function createRepository(calls: string[]): TrustedReleaseRepository {
  return {
    async recordStep(input) {
      calls.push(`step:${input.step}:${input.status}`);
    },
    async markCandidateStatus(input) {
      calls.push(`candidate:${input.status}`);
    },
    async markPartialFailure(input) {
      calls.push(`partial:${input.failureStage}`);
    },
    async markPartialCancellation(input) {
      calls.push(`partial-cancel:${input.failureStage}`);
    },
    async beginFrontendRetry() {
      calls.push("frontend-retry:begin");
    },
    async completeFrontendRetry() {
      calls.push("frontend-retry:succeeded");
    },
    async markFrontendRetryFailure(input) {
      calls.push(`frontend-retry:failed:${input.failureStage}`);
    }
  };
}

function createGateway(
  calls: string[],
  overrides: Partial<TrustedReleaseGateway> = {}
): TrustedReleaseGateway {
  return {
    async verifyCandidate() {
      calls.push("verify_candidate");
    },
    async publishApi() {
      calls.push("publish_api");
      return { imageDigest: `sha256:${"e".repeat(64)}`, imageUri: "ecr/image@sha256:digest" };
    },
    async activateEcs() {
      calls.push("activate_ecs");
      return {
        taskDefinitionArn: "arn:task:new",
        previousTaskDefinitionArn: "arn:task:old"
      };
    },
    async verifyEcsHealth() {
      calls.push("verify_ecs");
      return { state: "healthy", taskArns: ["arn:task/1"] };
    },
    async rollbackEcs() {
      calls.push("rollback_ecs");
      return { state: "restored", taskDefinitionArn: "arn:task:old" };
    },
    async uploadFrontend() {
      calls.push("upload_frontend");
      return { manifestObjectKey: "manifest.json", manifestVersionId: "v1" };
    },
    async activateFrontend() {
      calls.push("activate_frontend");
      return {
        manifestObjectKey: "manifest.json",
        manifestVersionId: "v1",
        indexObjectKey: "index.html",
        indexVersionId: "v2",
        commitMarker: "a".repeat(40)
      };
    },
    async invalidateFrontend(input) {
      calls.push("invalidate_frontend");
      return { ...input.activation, invalidationId: "I123" };
    },
    async verifyPublic() {
      calls.push("verify_public");
      return { state: "healthy" };
    },
    async cleanupCandidateArtifacts(_context, mode) {
      calls.push(`cleanup:${mode}`);
    },
    ...overrides
  };
}

function createLeaseRepository(): ProjectExecutionLeaseRepository {
  let record: ProjectExecutionLeaseRecord | undefined;
  return {
    async acquire(input) {
      record = {
        projectId: input.projectId,
        holderId: input.holderId,
        source: input.source,
        fencingVersion: (record?.fencingVersion ?? 0) + 1,
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

function readMutationGuard(value: unknown): () => Promise<void> {
  if (!value || typeof value !== "object") {
    throw new Error("mutation guard is missing");
  }
  const guard = (value as { beforeMutation?: unknown }).beforeMutation;
  if (typeof guard !== "function") throw new Error("mutation guard is missing");
  return guard as () => Promise<void>;
}
