import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ApplicationReleaseProviderRevision,
  ConfirmedBuildConfig,
  DeploymentScope,
  JsonValue,
  ProjectDeploymentRuntimeConfig,
  RuntimeTargetKind
} from "@sketchcatch/types";
import {
  executeDirectApplicationRelease,
  prepareDirectApplicationRelease,
  rollbackDirectApplicationRelease,
  type DirectApplicationArtifact,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRecord,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";

const deploymentId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const releaseId = "44444444-4444-4444-8444-444444444444";
const commitSha = "a".repeat(40);
const artifactDigest = "b".repeat(64);
const now = new Date("2026-07-14T12:00:00.000Z");

test("infrastructure scope does not create an application artifact", async () => {
  const repository = new InMemoryRepository({
    ...createContext("infrastructure"),
    sourceRepository: null
  });
  const gateway = new FakeGateway();

  const release = await prepareDirectApplicationRelease(
    { deploymentId, userId },
    repository,
    gateway,
    () => releaseId,
    () => now
  );

  assert.equal(release, null);
  assert.equal(gateway.prepareCalls.length, 0);
  assert.equal(repository.release, null);
});

test("application scope prepares one immutable artifact before runtime release", async () => {
  const repository = new InMemoryRepository(createContext("application"));
  const gateway = new FakeGateway();

  const release = await prepareDirectApplicationRelease(
    { deploymentId, userId },
    repository,
    gateway,
    () => releaseId,
    () => now
  );

  assert.equal(gateway.prepareCalls.length, 1);
  assert.equal(
    gateway.prepareCalls[0]?.target.confirmedBuildConfig.confirmedCommitSha,
    commitSha
  );
  assert.equal(release?.deploymentId, deploymentId);
  assert.equal(release?.source, "direct");
  assert.equal(release?.status, "pending");
  assert.equal(release?.artifactDigest, artifactDigest);
  assert.equal(release?.providerRevision?.resourceType, "codebuild_artifact");
  assert.equal(repository.linkedReleaseId, releaseId);
});

test("full_stack execution publishes the prepared artifact and persists verified AWS evidence", async () => {
  const repository = new InMemoryRepository(createContext("full_stack"));
  const gateway = new FakeGateway();
  await prepareDirectApplicationRelease(
    { deploymentId, userId },
    repository,
    gateway,
    () => releaseId,
    () => now
  );

  const release = await executeDirectApplicationRelease(
    { deploymentId, userId },
    repository,
    gateway,
    () => new Date("2026-07-14T12:01:00.000Z")
  );

  assert.equal(gateway.deployCalls.length, 1);
  assert.equal(gateway.deployCalls[0]?.artifact.digest, artifactDigest);
  assert.equal(release?.status, "succeeded");
  assert.equal(release?.providerRevision?.resourceType, "ecs_service");
  assert.equal(release?.providerRevision?.revisionId, "task-definition/api:42");
  assert.deepEqual(release?.healthEvidence, { state: "healthy", runningCount: 1 });
  assert.equal(release?.completedAt?.toISOString(), "2026-07-14T12:01:00.000Z");
});

test("runtime release is blocked when no prepared artifact is linked", async () => {
  const repository = new InMemoryRepository(createContext("application"));
  const gateway = new FakeGateway();

  await assert.rejects(
    executeDirectApplicationRelease({ deploymentId, userId }, repository, gateway, () => now),
    /prepared application artifact/i
  );
  assert.equal(gateway.deployCalls.length, 0);
});

test("runtime failure leaves a terminal failed release instead of a pending success claim", async () => {
  const repository = new InMemoryRepository(createContext("application"));
  const gateway = new FakeGateway();
  await prepareDirectApplicationRelease(
    { deploymentId, userId },
    repository,
    gateway,
    () => releaseId,
    () => now
  );
  gateway.deployError = new Error("runtime failed");

  await assert.rejects(
    executeDirectApplicationRelease({ deploymentId, userId }, repository, gateway, () => now),
    /runtime failed/
  );
  assert.equal(repository.release?.status, "failed");
  assert.deepEqual(repository.release?.healthEvidence, { state: "failed" });
});

test("verified rollback is persisted as rolled_back and never reported as success", async () => {
  const repository = new InMemoryRepository(createContext("application"));
  const gateway = new FakeGateway();
  gateway.outcome = "rolled_back";
  await prepareDirectApplicationRelease(
    { deploymentId, userId },
    repository,
    gateway,
    () => releaseId,
    () => now
  );

  const release = await executeDirectApplicationRelease(
    { deploymentId, userId },
    repository,
    gateway,
    () => now
  );

  assert.equal(release?.status, "rolled_back");
  assert.deepEqual(release?.healthEvidence, { state: "restored", runningCount: 1 });
  assert.deepEqual(release?.rollbackEvidence, { restoredRevision: "task-definition/api:41" });
});

test("replan resets a failed release from retained immutable build evidence", async () => {
  const repository = new InMemoryRepository(createContext("application"));
  const gateway = new FakeGateway();
  await prepareDirectApplicationRelease(
    { deploymentId, userId }, repository, gateway, () => releaseId, () => now
  );
  gateway.deployError = new Error("runtime failed");
  await assert.rejects(
    executeDirectApplicationRelease({ deploymentId, userId }, repository, gateway, () => now)
  );

  const retried = await prepareDirectApplicationRelease(
    { deploymentId, userId }, repository, gateway, () => "unused", () => now
  );

  assert.equal(retried?.id, releaseId);
  assert.equal(retried?.status, "pending");
  assert.equal(retried?.providerRevision?.resourceType, "codebuild_artifact");
  assert.equal(gateway.prepareCalls.length, 1);
});

test("application cleanup restores the verified previous runtime revision", async () => {
  const repository = new InMemoryRepository(createContext("application"));
  const gateway = new FakeGateway();
  await prepareDirectApplicationRelease(
    { deploymentId, userId }, repository, gateway, () => releaseId, () => now
  );
  await executeDirectApplicationRelease({ deploymentId, userId }, repository, gateway, () => now);

  const release = await rollbackDirectApplicationRelease(
    { deploymentId, userId }, repository, gateway, () => now
  );

  assert.equal(gateway.rollbackCalls.length, 1);
  assert.equal(release?.status, "rolled_back");
  assert.equal(release?.providerRevision?.revisionId, "task-definition/api:41");
  assert.deepEqual(release?.healthEvidence, { state: "restored", runningCount: 1 });
});

class FakeGateway implements DirectApplicationReleaseGateway {
  readonly prepareCalls: DirectApplicationReleaseContext[] = [];
  readonly deployCalls: Array<{
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
  }> = [];
  readonly rollbackCalls: Array<{
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    release: DirectApplicationReleaseRecord;
  }> = [];
  deployError: Error | null = null;
  outcome: "succeeded" | "rolled_back" = "succeeded";

  async prepareArtifact(context: DirectApplicationReleaseContext): Promise<DirectApplicationArtifact> {
    this.prepareCalls.push(context);
    return {
      commitSha,
      digest: artifactDigest,
      reference: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:" + artifactDigest,
      buildRevisionId: "build/api:42",
      metadata: { buildProjectName: "sketchcatch-api-build" }
    };
  }

  async deployArtifact(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
  }) {
    this.deployCalls.push(input);
    if (this.deployError) throw this.deployError;
    return {
      providerRevision: {
        provider: "aws" as const,
        resourceType: "ecs_service",
        revisionId: "task-definition/api:42",
        artifactReference: input.artifact.reference,
        metadata: { clusterName: "sketchcatch", serviceName: "api" }
      },
      outputUrl: "https://api.example.com",
      healthEvidence: {
        state: this.outcome === "succeeded" ? "healthy" : "restored",
        runningCount: 1
      },
      rollbackEvidence:
        this.outcome === "rolled_back"
          ? { restoredRevision: "task-definition/api:41" }
          : null,
      status: this.outcome
    };
  }

  async rollbackArtifact(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    release: DirectApplicationReleaseRecord;
  }) {
    this.rollbackCalls.push(input);
    return {
      providerRevision: {
        provider: "aws" as const,
        resourceType: "ecs_service" as const,
        revisionId: "task-definition/api:41",
        artifactReference: input.artifact.reference,
        metadata: { previousTaskDefinitionArn: "task-definition/api:41" }
      },
      outputUrl: input.context.target.runtimeConfig.outputUrl,
      healthEvidence: { state: "restored", runningCount: 1 },
      rollbackEvidence: { restoredRevision: "task-definition/api:41" },
      status: "rolled_back" as const
    };
  }
}

class InMemoryRepository implements DirectApplicationReleaseRepository {
  release: DirectApplicationReleaseRecord | null = null;
  linkedReleaseId: string | null = null;

  constructor(readonly context: DirectApplicationReleaseContext) {}

  async findContext(candidateDeploymentId: string, candidateUserId: string) {
    return candidateDeploymentId === deploymentId && candidateUserId === userId
      ? this.context
      : undefined;
  }

  async findRelease(candidateDeploymentId: string) {
    return this.release?.deploymentId === candidateDeploymentId ? this.release : undefined;
  }

  async savePreparedRelease(input: DirectApplicationReleaseRecord) {
    this.release = input;
    this.linkedReleaseId = input.id;
    return input;
  }

  async saveCompletedRelease(input: {
    releaseId: string;
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    rollbackEvidence: JsonValue | null;
    status: "succeeded" | "rolled_back";
    completedAt: Date;
    updatedAt: Date;
  }) {
    assert(this.release);
    this.release = {
      ...this.release,
      providerRevision: input.providerRevision,
      outputUrl: input.outputUrl,
      healthEvidence: input.healthEvidence,
      rollbackEvidence: input.rollbackEvidence,
      status: input.status,
      completedAt: input.completedAt,
      updatedAt: input.updatedAt
    };
    return this.release;
  }

  async saveFailedRelease(input: {
    releaseId: string;
    completedAt: Date;
    updatedAt: Date;
  }) {
    assert(this.release);
    assert.equal(input.releaseId, this.release.id);
    this.release = {
      ...this.release,
      status: "failed",
      healthEvidence: { state: "failed" },
      completedAt: input.completedAt,
      updatedAt: input.updatedAt
    };
    return this.release;
  }

  async resetReleaseForRetry(input: {
    releaseId: string;
    providerRevision: ApplicationReleaseProviderRevision;
    updatedAt: Date;
  }) {
    assert(this.release);
    assert.equal(input.releaseId, this.release.id);
    this.release = {
      ...this.release,
      providerRevision: input.providerRevision,
      status: "pending",
      healthEvidence: null,
      rollbackEvidence: null,
      completedAt: null,
      updatedAt: input.updatedAt
    };
    return this.release;
  }
}

function createContext(scope: DeploymentScope): DirectApplicationReleaseContext {
  const runtimeConfig: ProjectDeploymentRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: "sketchcatch-api-build",
    ecrRepositoryName: "sketchcatch/api",
    clusterName: "sketchcatch",
    serviceName: "api",
    containerName: "api",
    outputUrl: "https://api.example.com"
  };
  return {
    sourceRepository: {
      provider: "github",
      installationId: "123456",
      owner: "NearthYou",
      name: "sketchcatch-deployment-sandbox"
    },
    deployment: {
      id: deploymentId,
      projectId,
      scope,
      source: "direct",
      targetKind: scope === "infrastructure" ? null : "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate" as RuntimeTargetKind,
      confirmedBuildConfig: createBuildConfig(),
      runtimeConfig
    },
    connection: {
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchExecutionRole",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  };
}

function createBuildConfig(): ConfirmedBuildConfig {
  return {
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
    manifestVersion: "1.0.0",
    confirmedCommitSha: commitSha,
    confirmedAt: "2026-07-14T11:00:00.000Z"
  };
}
