import assert from "node:assert/strict";
import test from "node:test";

import {
  DirectApplicationReleaseError,
  prepareDirectApplicationRelease,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";

test("Direct application preparation fails before CodeBuild without an output URL", async () => {
  let prepareCalls = 0;
  const context = {
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
        evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
        installPreset: "none",
        buildPreset: "docker_build",
        artifactOutputPath: null,
        runtimeEntrypoint: null,
        healthCheckPath: "/",
        dockerfilePath: "Dockerfile",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: "a".repeat(40),
        confirmedAt: "2026-07-15T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "audience-live-check-app-build",
        ecrRepositoryName: "audience-live-check-app",
        clusterName: "audience-live-check-cluster",
        serviceName: "audience-live-check-service",
        containerName: "web",
        outputUrl: null
      }
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  } satisfies DirectApplicationReleaseContext;
  const repository = {
    async findContext() {
      return context;
    }
  } as unknown as DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      prepareCalls += 1;
      throw new Error("should not run");
    }
  } as unknown as DirectApplicationReleaseGateway;

  await assert.rejects(
    prepareDirectApplicationRelease(
      { deploymentId: "deployment-1", userId: "user-1" },
      repository,
      gateway,
      () => "release-1"
    ),
    (error: unknown) =>
      error instanceof DirectApplicationReleaseError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_REQUIRED"
  );
  assert.equal(prepareCalls, 0);
});

test("Direct application preparation rejects a null runtime config without a TypeError", async () => {
  let prepareCalls = 0;
  const context = {
    sourceRepository: {
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
      confirmedBuildConfig: {},
      runtimeConfig: null
    },
    connection: {
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  } as unknown as DirectApplicationReleaseContext;
  const repository = {
    async findContext() {
      return context;
    }
  } as unknown as DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      prepareCalls += 1;
      throw new Error("should not run");
    }
  } as unknown as DirectApplicationReleaseGateway;

  await assert.rejects(
    prepareDirectApplicationRelease(
      { deploymentId: "deployment-1", userId: "user-1" },
      repository,
      gateway,
      () => "release-1"
    ),
    (error: unknown) =>
      error instanceof DirectApplicationReleaseError &&
      error.message === "Direct deployment runtime does not match the confirmed project target"
  );
  assert.equal(prepareCalls, 0);
});
