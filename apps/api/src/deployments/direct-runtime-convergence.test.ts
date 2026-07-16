import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationArtifactClaim } from "../artifacts/application-artifact-registry.js";
import type { RuntimeProviderCurrentState } from "../runtime-convergence/runtime-convergence-service.js";
import { createDeploymentTargetIdentity } from "../runtime-convergence/deployment-target-identity.js";
import {
  executeDirectApplicationRelease,
  prepareDirectApplicationRelease,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRecord,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const commitSha = "a".repeat(40);
const digest = "b".repeat(64);
const reference = `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/app@sha256:${digest}`;
const artifactFingerprint = "c".repeat(64);

test("Direct release skips deployArtifact only for provider-verified healthy exact state", async () => {
  const harness = createHarness();

  const release = await executeDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    harness.repository,
    harness.gateway,
    () => new Date("2026-07-16T00:00:00.000Z")
  );

  assert.equal(harness.inspectCalls, 1);
  assert.equal(harness.deployCalls, 0);
  assert.equal(release?.convergenceOutcome, "already_active");
  assert.equal(release?.runtimeAdapterKind, "ecs_service_fargate");
  assert.match(release?.deploymentTargetFingerprint ?? "", /^[a-f0-9]{64}$/u);
});

test("Direct release uses the existing rollout when provider inspection is unavailable", async () => {
  const harness = createHarness({ inspectError: new Error("provider unavailable") });

  const release = await executeDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    harness.repository,
    harness.gateway,
    () => new Date("2026-07-16T00:00:00.000Z")
  );

  assert.equal(harness.deployCalls, 1);
  assert.equal(release?.convergenceOutcome, "rolled_out");
  assert.equal(
    (release?.healthEvidence as { convergence?: { fallbackReason?: string } } | null)
      ?.convergence?.fallbackReason,
    "current_state_unavailable"
  );
});

test("Direct release rolls out when the observed runtime is unhealthy", async () => {
  const harness = createHarness({
    currentState: createCurrentState({
      health: { status: "unhealthy", verifiedAt: "2026-07-16T00:00:00.000Z" }
    })
  });

  const release = await executeDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    harness.repository,
    harness.gateway
  );

  assert.equal(harness.deployCalls, 1);
  assert.equal(release?.convergenceOutcome, "rolled_out");
});

test("Direct release rejects a stale persisted target fingerprint before provider access", async () => {
  const harness = createHarness({ persistedTargetFingerprint: "e".repeat(64) });

  await assert.rejects(
    () => executeDirectApplicationRelease(
      { deploymentId: "deployment-1", userId: "user-1" },
      harness.repository,
      harness.gateway
    ),
    /fingerprint/u
  );
  assert.equal(harness.inspectCalls, 0);
  assert.equal(harness.deployCalls, 0);
});

test("Direct preparation rejects a stale target fingerprint before artifact provider access", async () => {
  const context = createContext();
  context.target.deploymentTargetFingerprint = "e".repeat(64);
  let registryCalls = 0;
  let gatewayCalls = 0;
  const repository = {
    artifactRegistry: {
      async acquire() {
        registryCalls += 1;
        throw new Error("artifact registry must not be reached");
      },
      async invalidate() {},
      async renew(input: { claim: ApplicationArtifactClaim }) { return input.claim; },
      async complete() { throw new Error("not used"); },
      async fail() {},
      async recordVerified() { throw new Error("not used"); }
    },
    async findContext() { return context; },
    async findRelease() { return undefined; },
    async savePreparedRelease() { throw new Error("not used"); },
    async saveCompletedRelease() { throw new Error("not used"); },
    async saveFailedRelease() { throw new Error("not used"); },
    async savePartialRelease() { throw new Error("not used"); },
    async resetReleaseForRetry() { throw new Error("not used"); }
  } satisfies DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      gatewayCalls += 1;
      throw new Error("not used");
    },
    async verifyArtifact() {
      gatewayCalls += 1;
      throw new Error("not used");
    },
    async deployArtifact() { throw new Error("not used"); },
    async rollbackArtifact() { throw new Error("not used"); }
  } satisfies DirectApplicationReleaseGateway;

  await assert.rejects(
    () => prepareDirectApplicationRelease(
      { deploymentId: "deployment-1", userId: "user-1" },
      repository,
      gateway,
      () => "release-1"
    ),
    /fingerprint/u
  );
  assert.equal(registryCalls, 0);
  assert.equal(gatewayCalls, 0);
});

function createHarness(options: {
  readonly inspectError?: Error | undefined;
  readonly currentState?: RuntimeProviderCurrentState | undefined;
  readonly persistedTargetFingerprint?: string | undefined;
} = {}) {
  const context = createContext();
  context.target.deploymentTargetFingerprint = options.persistedTargetFingerprint ?? null;
  let inspectCalls = 0;
  let deployCalls = 0;
  let release = createPreparedRelease();
  const repository = {
    artifactRegistry: {
      async acquire() { throw new Error("not used"); },
      async invalidate() {},
      async renew(input: { claim: ApplicationArtifactClaim }) { return input.claim; },
      async complete() { throw new Error("not used"); },
      async fail() { throw new Error("not used"); },
      async recordVerified() { throw new Error("not used"); }
    },
    async findContext() { return context; },
    async findRelease() { return release; },
    async savePreparedRelease() { throw new Error("not used"); },
    async saveCompletedRelease(input) {
      release = {
        ...release,
        runtimeAdapterKind: input.runtimeAdapterKind,
        deploymentTargetFingerprint: input.deploymentTargetFingerprint,
        convergenceOutcome: input.convergenceOutcome,
        providerRevision: input.providerRevision,
        outputUrl: input.outputUrl,
        healthEvidence: input.healthEvidence,
        rollbackEvidence: input.rollbackEvidence,
        status: input.status,
        completedAt: input.completedAt,
        updatedAt: input.updatedAt
      };
      return release;
    },
    async saveFailedRelease() { throw new Error("unexpected failure"); },
    async savePartialRelease() { throw new Error("unexpected partial release"); },
    async resetReleaseForRetry() { throw new Error("not used"); }
  } satisfies DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() { throw new Error("not used"); },
    async verifyArtifact() { throw new Error("not used"); },
    async inspectCurrentRuntime() {
      inspectCalls += 1;
      if (options.inspectError) throw options.inspectError;
      return options.currentState ?? createCurrentState();
    },
    async deployArtifact() {
      deployCalls += 1;
      return {
        providerRevision: { ...createCurrentState().providerRevision, provider: "aws" as const },
        outputUrl: "https://app.example.com",
        healthEvidence: { state: "healthy", verifiedAt: "2026-07-16T00:00:00.000Z" },
        rollbackEvidence: { previousRevisionId: "task-definition:41" },
        status: "succeeded" as const
      };
    },
    async rollbackArtifact() { throw new Error("not used"); }
  } satisfies DirectApplicationReleaseGateway;

  return {
    repository,
    gateway,
    get inspectCalls() { return inspectCalls; },
    get deployCalls() { return deployCalls; }
  };
}

function createContext(): DirectApplicationReleaseContext {
  return {
    sourceRepository: {
      id: "repository-1",
      provider: "github",
      installationId: "installation-1",
      owner: "NearthYou",
      name: "SketchCatch"
    },
    deployment: {
      id: "deployment-1",
      projectId,
      scope: "application",
      source: "direct",
      targetKind: "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: {
        sourceRoot: ".",
        evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
        installPreset: "none",
        buildPreset: "docker_build",
        artifactOutputPath: null,
        runtimeEntrypoint: null,
        healthCheckPath: "/health",
        dockerfilePath: "Dockerfile",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: commitSha,
        confirmedAt: "2026-07-16T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "app-build",
        ecrRepositoryName: "app",
        clusterName: "cluster",
        serviceName: "service",
        containerName: "app",
        outputUrl: "https://app.example.com"
      },
      runtimeTarget: null,
      deploymentTargetFingerprint: null
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  };
}

function createPreparedRelease(): DirectApplicationReleaseRecord {
  const timestamp = new Date("2026-07-16T00:00:00.000Z");
  return {
    id: "release-1",
    projectId,
    artifactId: "artifact-1",
    deploymentId: "deployment-1",
    pipelineRunId: null,
    source: "direct",
    runtimeTargetKind: "ecs_fargate",
    runtimeAdapterKind: "ecs_service_fargate",
    deploymentTargetFingerprint: null,
    convergenceOutcome: null,
    version: commitSha.slice(0, 12),
    commitSha,
    artifactDigestAlgorithm: "sha256",
    artifactDigest: digest,
    releaseCandidateId: null,
    compositeDigest: null,
    providerRevision: {
      provider: "aws",
      resourceType: "application_artifact",
      revisionId: "artifact-1",
      artifactReference: reference,
      metadata: { artifactFingerprint }
    },
    frontendEvidence: null,
    failureStage: null,
    outputUrl: null,
    status: "pending",
    healthEvidence: null,
    rollbackEvidence: null,
    startedAt: timestamp,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createCurrentState(
  overrides: Partial<RuntimeProviderCurrentState> = {}
): RuntimeProviderCurrentState {
  const context = createContext();
  const runtimeTarget = {
    adapterKind: "ecs_service_fargate" as const,
    orchestrator: { kind: "ecs_service" as const, clusterName: "cluster", serviceName: "service" },
    compute: { kind: "container" as const, containerName: "app" },
    capacity: { kind: "fargate" as const, platformVersion: null },
    rollout: {
      kind: "ecs_rolling" as const,
      minimumHealthyPercent: 0,
      maximumPercent: 100,
      circuitBreakerRollback: true
    },
    health: { kind: "https" as const, outputUrl: "https://app.example.com", path: "/health" }
  };
  return {
    adapterKind: "ecs_service_fargate",
    deploymentTargetFingerprint: createDeploymentTargetIdentity({
      contractVersion: "runtime-convergence/v1",
      scope: {
        projectId,
        provider: "aws",
        accountId: context.connection.accountId,
        region: context.connection.region
      },
      target: runtimeTarget
    }).deploymentTargetFingerprint,
    scope: {
      projectId,
      provider: "aws",
      accountId: context.connection.accountId,
      region: context.connection.region
    },
    target: runtimeTarget,
    artifact: {
      artifactFingerprint: artifactFingerprint,
      digestAlgorithm: "sha256",
      digest,
      reference
    },
    providerRevision: {
      provider: "aws",
      resourceType: "ecs_service",
      revisionId: "task-definition:42",
      artifactReference: reference,
      metadata: { desiredCount: 1, runningCount: 1 }
    },
    health: { status: "healthy", verifiedAt: "2026-07-16T00:00:00.000Z" },
    healthEvidence: { state: "healthy", desiredCount: 1, runningCount: 1 },
    rollbackEvidence: { previousRevisionId: "task-definition:41" },
    ...overrides
  };
}
