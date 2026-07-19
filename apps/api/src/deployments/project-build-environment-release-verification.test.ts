import assert from "node:assert/strict";
import test from "node:test";

import type { ConfirmedBuildConfig } from "@sketchcatch/types";

import {
  createDesiredProjectBuildEnvironment,
  type ProjectBuildEnvironmentGateway
} from "../build-environments/project-build-environment-service.js";
import { verifyCurrentProjectBuildEnvironment } from "./aws-codebuild-direct-application-release-gateway.js";
import type { DirectApplicationReleaseContext } from "./direct-application-release-service.js";

test("release verification accepts a new commit when the stored CodeBuild contract is unchanged", async () => {
  const projectId = "88870e40-fbb8-4c86-b5de-ab4b8cd6310e";
  const confirmedBuildConfig = createConfirmedBuildConfig("b".repeat(40));
  const desired = createDesiredProjectBuildEnvironment({
    projectId,
    sourceRepository: {
      id: "repository-1",
      owner: "jh-9999",
      name: "audience-live-check"
    },
    awsConnection: {
      id: "connection-1",
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    },
    codeConnection: {
      id: "code-connection-1",
      connectionArn:
        "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/code-connection-1",
      status: "AVAILABLE"
    },
    confirmedBuildConfig
  });
  const context: DirectApplicationReleaseContext = {
    sourceRepository: {
      id: "repository-1",
      provider: "github",
      installationId: "installation-1",
      owner: "jh-9999",
      name: "audience-live-check"
    },
    buildEnvironment: {
      id: "build-environment-1",
      awsConnectionId: "connection-1",
      awsCodeConnectionId: "code-connection-1",
      codeConnectionArn: desired.codeConnectionArn,
      codeBuildProjectName: desired.codeBuildProjectName,
      codeBuildServiceRoleArn: desired.codeBuildServiceRoleArn,
      permissionsBoundaryArn: desired.permissionsBoundaryArn,
      sourceRepositoryUrl: desired.sourceRepositoryUrl,
      runtimeFingerprint: "legacy-commit-scoped-fingerprint",
      status: "ready"
    },
    deployment: {
      id: "release-run-1",
      projectId,
      scope: "application",
      source: "gitops",
      targetKind: "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig,
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: desired.codeBuildProjectName,
        ecrRepositoryName: "audience-live-check-api",
        clusterName: "audience-live-check-cluster",
        serviceName: "audience-live-check-service",
        containerName: "api",
        outputUrl: "https://example.cloudfront.net"
      }
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  };
  let verifyCalls = 0;
  const gateway: ProjectBuildEnvironmentGateway = {
    async reconcile() {
      throw new Error("Unexpected reconcile");
    },
    async verify() {
      verifyCalls += 1;
      return { verified: true, statusReason: null };
    },
    async verifyRepositoryAccess() {
      throw new Error("Unexpected repository verification");
    }
  };

  await verifyCurrentProjectBuildEnvironment(context, gateway);

  assert.equal(verifyCalls, 1);
});

function createConfirmedBuildConfig(
  confirmedCommitSha: string
): ConfirmedBuildConfig & { ecsWeb: NonNullable<ConfirmedBuildConfig["ecsWeb"]> } {
  return {
    sourceRoot: ".",
    evidence: [],
    installPreset: "pnpm_frozen_lockfile",
    buildPreset: "docker_build",
    artifactOutputPath: "apps/web/dist",
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: "apps/api/Dockerfile",
    packageManifestPath: "apps/web/package.json",
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha,
    confirmedAt: "2026-07-19T00:00:00.000Z",
    ecsWeb: {
      api: {
        sourceRoot: ".",
        dockerfilePath: "apps/api/Dockerfile",
        containerPort: 8080,
        healthCheckPath: "/health"
      },
      frontend: {
        sourceRoot: "apps/web",
        packageManifestPath: "apps/web/package.json",
        lockfilePath: "pnpm-lock.yaml",
        packageManager: "pnpm",
        packageManagerVersion: "10.11.1",
        installPreset: "pnpm_frozen_lockfile",
        buildPreset: "pnpm_build",
        outputPath: "apps/web/dist"
      }
    }
  };
}
