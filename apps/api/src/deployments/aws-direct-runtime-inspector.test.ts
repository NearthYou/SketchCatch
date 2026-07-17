import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  type ECSClient
} from "@aws-sdk/client-ecs";
import { createDeploymentTargetIdentity } from "../runtime-convergence/deployment-target-identity.js";
import {
  addRuntimeConvergenceTaskDefinitionTag,
  finalizeAlreadyActiveReleaseCandidate,
  inspectEcsDirectRuntime
} from "./aws-codebuild-direct-application-release-gateway.js";
import {
  executeDirectApplicationRelease,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRecord,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";

const artifactFingerprint = "a".repeat(64);
const digest = "b".repeat(64);

test("Direct ECS inspector derives no-op state only from read-only provider evidence", async () => {
  const target = {
    adapterKind: "ecs_service_fargate" as const,
    orchestrator: { kind: "ecs_service" as const, clusterName: "cluster", serviceName: "service" },
    compute: { kind: "container" as const, containerName: "web" },
    capacity: { kind: "fargate" as const, platformVersion: null },
    rollout: {
      kind: "ecs_rolling" as const,
      minimumHealthyPercent: 0,
      maximumPercent: 100,
      circuitBreakerRollback: true
    },
    health: { kind: "https" as const, outputUrl: "https://app.example.com", path: "/health" }
  };
  const context = createContext(target);
  const targetFingerprint = createDeploymentTargetIdentity({
    contractVersion: "runtime-convergence/v1",
    scope: {
      projectId: context.deployment.projectId,
      provider: "aws",
      accountId: context.connection.accountId,
      region: context.connection.region
    },
    target
  }).deploymentTargetFingerprint;
  const preparedArtifact = {
    artifactFingerprint,
    commitSha: context.target.confirmedBuildConfig.confirmedCommitSha,
    digest: "d".repeat(64),
    reference: "release-candidates/candidate-1/manifest.json",
    buildRevisionId: "build-1",
    metadata: {
      releaseCandidateId: "candidate-1",
      apiOciDigest: digest
    }
  };
  const registration = addRuntimeConvergenceTaskDefinitionTag(
    { family: "app", containerDefinitions: [{ name: "web", image: "bootstrap" }] },
    context,
    preparedArtifact
  );
  const convergenceMarker = registration.tags?.find(
    (tag) => tag.key === "sketchcatch:runtime-convergence"
  )?.value;
  assert.match(convergenceMarker ?? "", /^[A-Za-z0-9_./=+\-:@]+$/u);
  assert.equal(
    convergenceMarker,
    `sketchcatch:artifact=${artifactFingerprint}:target=${targetFingerprint}`
  );
  let calls = 0;
  let serviceStatus = "ACTIVE";
  let deploymentConfiguration:
    | {
        minimumHealthyPercent: number;
        maximumPercent: number;
        deploymentCircuitBreaker: { enable: boolean; rollback: boolean };
      }
    | undefined = {
    minimumHealthyPercent: 0,
    maximumPercent: 100,
    deploymentCircuitBreaker: { enable: true, rollback: true }
  };
  const client = {
    async send(command: unknown) {
      calls += 1;
      if (command instanceof DescribeServicesCommand) {
        return {
          services: [
            {
              status: serviceStatus,
              taskDefinition: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/app:2",
              desiredCount: 1,
              runningCount: 1,
              pendingCount: 0,
              launchType: "FARGATE",
              deployments: [{ platformVersion: "1.4.0" }],
              deploymentConfiguration
            }
          ],
          failures: []
        };
      }
      if (command instanceof DescribeTaskDefinitionCommand) {
        return {
          taskDefinition: {
            containerDefinitions: [
              {
                name: "web",
                image: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/app@sha256:${digest}`
              }
            ]
          },
          tags: registration.tags
        };
      }
      throw new Error("unexpected command");
    },
    destroy() {}
  };

  const state = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });

  assert.equal(calls, 2);
  assert.equal(state.deploymentTargetFingerprint, targetFingerprint);
  assert.equal(state.artifact.artifactFingerprint, artifactFingerprint);
  assert.equal(state.artifact.digest, digest);
  assert.equal(state.health.status, "healthy");

  let deployCalls = 0;
  const terminalEvents: string[] = [];
  let release = createPreparedCandidateRelease(context, preparedArtifact);
  const repository = {
    artifactRegistry: Object.create(null),
    async findContext() {
      return context;
    },
    async findRelease() {
      return release;
    },
    async saveCompletedRelease(
      input: Parameters<DirectApplicationReleaseRepository["saveCompletedRelease"]>[0]
    ) {
      terminalEvents.push("release_saved");
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
    async saveFailedRelease() {
      throw new Error("exact provider state must not fail");
    }
  } as unknown as DirectApplicationReleaseRepository;
  const releaseGateway = {
    async inspectCurrentRuntime() {
      return state;
    },
    async deployArtifact() {
      deployCalls += 1;
      throw new Error("exact provider state must not roll out again");
    },
    async finalizeAlreadyActiveArtifact() {
      terminalEvents.push("candidate_succeeded");
    },
    async cleanupArtifact() {
      terminalEvents.push("archives_cleaned");
    }
  } as unknown as DirectApplicationReleaseGateway;
  const converged = await executeDirectApplicationRelease(
    {
      deploymentId: context.deployment.id,
      userId: "user-1",
      leaseFence: {
        projectId: context.deployment.projectId,
        holderId: context.deployment.id,
        fencingVersion: 7
      }
    },
    repository,
    releaseGateway,
    () => new Date("2026-07-16T00:00:00.000Z")
  );
  assert.equal(deployCalls, 0);
  assert.equal(converged?.convergenceOutcome, "already_active");
  assert.deepEqual(terminalEvents, ["candidate_succeeded", "release_saved", "archives_cleaned"]);

  const failedTerminalEvents: string[] = [];
  const failedRelease = createPreparedCandidateRelease(context, preparedArtifact);
  const failedRepository = {
    artifactRegistry: Object.create(null),
    async findContext() {
      return context;
    },
    async findRelease() {
      return failedRelease;
    },
    async saveCompletedRelease() {
      failedTerminalEvents.push("release_save_failed");
      throw new Error("release persistence failed");
    },
    async saveFailedRelease() {
      throw new Error("exact provider state must not fail");
    }
  } as unknown as DirectApplicationReleaseRepository;
  const failedGateway = {
    async inspectCurrentRuntime() {
      return state;
    },
    async deployArtifact() {
      throw new Error("exact provider state must not roll out again");
    },
    async finalizeAlreadyActiveArtifact() {
      failedTerminalEvents.push("candidate_succeeded");
    },
    async cleanupArtifact() {
      failedTerminalEvents.push("archives_cleaned");
    }
  } as unknown as DirectApplicationReleaseGateway;
  await assert.rejects(
    executeDirectApplicationRelease(
      {
        deploymentId: context.deployment.id,
        userId: "user-1",
        leaseFence: {
          projectId: context.deployment.projectId,
          holderId: context.deployment.id,
          fencingVersion: 7
        }
      },
      failedRepository,
      failedGateway,
      () => new Date("2026-07-16T00:00:00.000Z")
    ),
    /release persistence failed/u
  );
  assert.deepEqual(failedTerminalEvents, ["candidate_succeeded", "release_save_failed"]);

  deploymentConfiguration = {
    minimumHealthyPercent: 0,
    maximumPercent: 101,
    deploymentCircuitBreaker: { enable: true, rollback: true }
  };
  const drifted = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });
  assert.equal(drifted.health.status, "unhealthy");

  deploymentConfiguration = {
    minimumHealthyPercent: 0,
    maximumPercent: 100,
    deploymentCircuitBreaker: { enable: true, rollback: true }
  };
  serviceStatus = "DRAINING";
  const draining = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });
  assert.equal(draining.health.status, "unhealthy");

  serviceStatus = "ACTIVE";
  deploymentConfiguration = undefined;
  const missingDeploymentConfiguration = await inspectEcsDirectRuntime({
    context,
    target,
    async assumeRole() {
      return Object.create(null) as never;
    },
    createEcsClient: () => client as unknown as ECSClient,
    probeHealth: async () => true
  });
  assert.equal(missingDeploymentConfiguration.health.status, "unhealthy");
});

test("already-active candidate finalization is fenced, terminal, and idempotent", async () => {
  const context = createContext();
  const now = new Date("2026-07-16T00:00:00.000Z");
  const artifact = {
    artifactFingerprint,
    commitSha: context.target.confirmedBuildConfig.confirmedCommitSha,
    digest: "d".repeat(64),
    reference: "release-candidates/candidate-1/manifest.json",
    buildRevisionId: "build-1",
    metadata: { releaseCandidateId: "candidate-1", apiOciDigest: digest }
  };
  const candidate = {
    id: "candidate-1",
    projectId: context.deployment.projectId,
    deploymentId: context.deployment.id,
    pipelineRunId: null,
    commitSha: artifact.commitSha,
    compositeDigest: artifact.digest,
    manifestObjectKey: artifact.reference,
    configFingerprint: "config-1",
    status: "pending",
    expiresAt: new Date("2026-07-17T00:00:00.000Z")
  };
  let activeFencingVersion = 7;
  let candidateReads = 0;
  const transitions: string[] = [];
  const dependencies = {
    candidateRepository: {
      async findById() {
        candidateReads += 1;
        return candidate as never;
      }
    },
    trustedRepository: {
      async markCandidateStatus(input: { status: "activating" | "succeeded" }) {
        transitions.push(input.status);
        candidate.status = input.status;
      }
    },
    leaseRepository: {
      async find() {
        return {
          projectId: context.deployment.projectId,
          holderId: context.deployment.id,
          fencingVersion: activeFencingVersion,
          source: "direct",
          status: "active",
          acquiredAt: now,
          heartbeatAt: now,
          expiresAt: new Date("2026-07-16T01:00:00.000Z"),
          releasedAt: null,
          activeCodeBuildId: null,
          activeWorkerTaskArn: null,
          createdAt: now,
          updatedAt: now
        } as never;
      }
    }
  } as never;
  const finalize = () =>
    finalizeAlreadyActiveReleaseCandidate(
      {
        context,
        artifact,
        leaseFence: {
          projectId: context.deployment.projectId,
          holderId: context.deployment.id,
          fencingVersion: 7
        },
        now
      },
      dependencies
    );

  await finalize();
  assert.deepEqual(transitions, ["activating", "succeeded"]);

  await finalize();
  assert.deepEqual(transitions, ["activating", "succeeded"]);

  candidate.status = "pending";
  activeFencingVersion = 8;
  await assert.rejects(finalize, /no longer owns the project release lease/u);
  assert.equal(candidateReads, 2);
  assert.deepEqual(transitions, ["activating", "succeeded"]);
});

function createPreparedCandidateRelease(
  context: DirectApplicationReleaseContext,
  artifact: {
    artifactFingerprint: string;
    commitSha: string;
    digest: string;
    reference: string;
    buildRevisionId: string;
    metadata: { releaseCandidateId: string; apiOciDigest: string };
  }
): DirectApplicationReleaseRecord {
  const timestamp = new Date("2026-07-16T00:00:00.000Z");
  return {
    id: "release-1",
    projectId: context.deployment.projectId,
    artifactId: null,
    deploymentId: context.deployment.id,
    pipelineRunId: null,
    source: "direct",
    runtimeTargetKind: "ecs_fargate",
    runtimeAdapterKind: "ecs_service_fargate",
    deploymentTargetFingerprint: null,
    convergenceOutcome: null,
    version: artifact.commitSha.slice(0, 12),
    commitSha: artifact.commitSha,
    artifactDigestAlgorithm: "sha256",
    artifactDigest: artifact.digest,
    releaseCandidateId: artifact.metadata.releaseCandidateId,
    baselineReleaseId: null,
    compositeDigest: {
      algorithm: "sha256",
      value: artifact.digest,
      apiOciDigest: artifact.metadata.apiOciDigest,
      frontendManifestDigest: "e".repeat(64)
    },
    providerRevision: {
      provider: "aws",
      resourceType: "codebuild_artifact",
      revisionId: artifact.buildRevisionId,
      artifactReference: artifact.reference,
      metadata: {
        ...artifact.metadata,
        artifactFingerprint: artifact.artifactFingerprint,
        preparedArtifactReference: artifact.reference,
        preparedBuildRevisionId: artifact.buildRevisionId
      }
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

function createContext(
  runtimeTarget?: DirectApplicationReleaseContext["target"]["runtimeTarget"]
): DirectApplicationReleaseContext {
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
      projectId: "project-1",
      scope: "application",
      source: "direct",
      targetKind: "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: {
        sourceRoot: ".",
        evidence: [],
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
        confirmedCommitSha: "c".repeat(40),
        confirmedAt: "2026-07-16T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "app-build",
        ecrRepositoryName: "app",
        clusterName: "cluster",
        serviceName: "service",
        containerName: "web",
        outputUrl: "https://app.example.com"
      },
      runtimeTarget: runtimeTarget ?? null,
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
