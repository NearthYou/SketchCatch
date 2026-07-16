import assert from "node:assert/strict";
import test from "node:test";

import {
  rollbackDirectApplicationRelease,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRecord,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";

test("manual Direct rollback persists the trusted baseline result", async () => {
  const context = createContext();
  const release = createRelease();
  let savedStatus: string | undefined;
  const repository = {
    async findContext() {
      return context;
    },
    async findRelease() {
      return release;
    },
    async saveCompletedRelease(input: { status: string }) {
      savedStatus = input.status;
      return {
        ...release,
        status: input.status,
        providerRevision: {
          ...release.providerRevision!,
          revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:3"
        }
      } as DirectApplicationReleaseRecord;
    }
  } as unknown as DirectApplicationReleaseRepository;
  let rollbackCalls = 0;
  const gateway = {
    async rollbackArtifact() {
      rollbackCalls += 1;
      return {
        providerRevision: {
          provider: "aws" as const,
          resourceType: "ecs_task_definition" as const,
          revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:3",
          artifactReference: release.providerRevision!.artifactReference,
          metadata: {
            taskDefinitionArn:
              "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:3",
            imageDigest: `sha256:${"c".repeat(64)}`
          }
        },
        outputUrl: "https://demo.cloudfront.net",
        healthEvidence: { state: "restored" },
        rollbackEvidence: { state: "restored" },
        status: "rolled_back" as const
      };
    }
  } as unknown as DirectApplicationReleaseGateway;

  const result = await rollbackDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    repository,
    gateway,
    () => new Date("2026-07-16T01:00:00.000Z")
  );

  assert.equal(rollbackCalls, 1);
  assert.equal(savedStatus, "rolled_back");
  assert.equal(result?.status, "rolled_back");
});

function createContext(): DirectApplicationReleaseContext {
  return {
    sourceRepository: {
      provider: "github",
      installationId: "installation-1",
      owner: "jh-9999",
      name: "audience-live-check"
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
        evidence: [{ kind: "dockerfile", path: "apps/api/Dockerfile" }],
        installPreset: "none",
        buildPreset: "docker_build",
        artifactOutputPath: null,
        runtimeEntrypoint: null,
        healthCheckPath: "/health",
        dockerfilePath: "apps/api/Dockerfile",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: "a".repeat(40),
        confirmedAt: "2026-07-16T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "audience-live-check-build",
        ecrRepositoryName: "audience-live-check-api",
        clusterName: "audience-live-check-cluster",
        serviceName: "audience-live-check-service",
        containerName: "api",
        outputUrl: "https://demo.cloudfront.net"
      }
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  };
}

function createRelease(): DirectApplicationReleaseRecord {
  return {
    id: "release-1",
    projectId: "project-1",
    deploymentId: "deployment-1",
    pipelineRunId: null,
    source: "direct",
    runtimeTargetKind: "ecs_fargate",
    version: "sha-a",
    commitSha: "a".repeat(40),
    artifactDigestAlgorithm: "sha256",
    artifactDigest: "b".repeat(64),
    releaseCandidateId: "candidate-1",
    baselineReleaseId: "release-0",
    compositeDigest: null,
    providerRevision: {
      provider: "aws",
      resourceType: "ecs_task_definition",
      revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:4",
      artifactReference: "deployments/deployment-1/release-candidates/candidate-1/manifest.json",
      metadata: {
        preparedBuildRevisionId: "build-1",
        previousTaskDefinitionArn:
          "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:3"
      }
    },
    frontendEvidence: null,
    failureStage: null,
    outputUrl: "https://demo.cloudfront.net",
    status: "succeeded",
    healthEvidence: { state: "healthy" },
    rollbackEvidence: null,
    startedAt: new Date("2026-07-16T00:00:00.000Z"),
    completedAt: new Date("2026-07-16T00:10:00.000Z"),
    createdAt: new Date("2026-07-16T00:00:00.000Z"),
    updatedAt: new Date("2026-07-16T00:10:00.000Z")
  };
}
