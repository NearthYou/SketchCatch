import assert from "node:assert/strict";
import { test } from "node:test";
import type { PutProjectDeploymentTargetRequest } from "@sketchcatch/types";
import { parseProjectDeploymentTargetRequest } from "./project-release-ledger.js";

test("accepts safe inferred ECS runtime secret names", () => {
  const base = createEcsDeploymentTargetRequest();
  const request = parseProjectDeploymentTargetRequest({
    ...base,
    confirmedBuildConfig: {
      ...base.confirmedBuildConfig,
      ecsWeb: {
        ...base.confirmedBuildConfig.ecsWeb!,
        api: {
          ...base.confirmedBuildConfig.ecsWeb!.api,
          requiredRuntimeSecrets: ["DATABASE_URL", "JWT_SECRET"]
        }
      }
    }
  });

  assert.deepEqual(request.confirmedBuildConfig.ecsWeb?.api.requiredRuntimeSecrets, [
    "DATABASE_URL",
    "JWT_SECRET"
  ]);
});

test("rejects unsafe ECS runtime secret names", () => {
  const base = createEcsDeploymentTargetRequest();
  assert.throws(() =>
    parseProjectDeploymentTargetRequest({
      ...base,
      confirmedBuildConfig: {
        ...base.confirmedBuildConfig,
        ecsWeb: {
          ...base.confirmedBuildConfig.ecsWeb!,
          api: {
            ...base.confirmedBuildConfig.ecsWeb!.api,
            requiredRuntimeSecrets: ["DATABASE_URL=$(whoami)"]
          }
        }
      }
    })
  );
});

function createEcsDeploymentTargetRequest(): PutProjectDeploymentTargetRequest {
  return {
    provider: "aws",
    connectionId: "33333333-3333-4333-8333-333333333333",
    region: "ap-northeast-2",
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
      confirmedAt: "2026-07-21T00:00:00.000Z",
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
          packageManagerVersion: "11.8.0",
          installPreset: "pnpm_frozen_lockfile",
          buildPreset: "pnpm_build",
          outputPath: "apps/web/dist"
        }
      }
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "test-build",
      ecrRepositoryName: "test",
      clusterName: "test-cluster",
      serviceName: "test-service",
      containerName: "api",
      outputUrl: null
    },
    rolloutStrategy: "all_at_once"
  };
}