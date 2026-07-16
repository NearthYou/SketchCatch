import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  PutProjectDeploymentTargetRequest,
  RuntimeDeploymentTarget
} from "@sketchcatch/types";
import {
  ReleaseLedgerValidationError,
  putProjectDeploymentTarget,
  type ProjectReleaseLedgerRepository,
  type SaveProjectDeploymentTargetInput
} from "./project-release-ledger-service.js";

test("legacy target PUT persists a canonical target fingerprint scoped to the verified account", async () => {
  const savedInputs: SaveProjectDeploymentTargetInput[] = [];
  const repository = createRepository({
    accountId: "123456789012",
    save(input) {
      savedInputs.push(input);
    }
  });

  await putProjectDeploymentTarget(
    {
      projectId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      target: createLegacyRequest()
    },
    repository,
    () => new Date("2026-07-16T00:00:00.000Z")
  );

  const saved = savedInputs[0];
  assert.ok(saved?.runtimeTarget);
  assert.equal(saved.runtimeTarget.adapterKind, "ecs_service_fargate");
  assert.match(saved.deploymentTargetFingerprint ?? "", /^[a-f0-9]{64}$/u);
});

test("deployment target fingerprint changes across verified AWS accounts", async () => {
  const fingerprints: string[] = [];

  for (const accountId of ["123456789012", "210987654321"]) {
    await putProjectDeploymentTarget(
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
        target: createLegacyRequest()
      },
      createRepository({
        accountId,
        save(input) {
          if (!input.deploymentTargetFingerprint) {
            throw new Error("expected canonical deployment target fingerprint");
          }
          fingerprints.push(input.deploymentTargetFingerprint);
        }
      })
    );
  }

  assert.equal(fingerprints.length, 2);
  assert.notEqual(fingerprints[0], fingerprints[1]);
});

test("canonical target must agree with the legacy API discriminator", async () => {
  const request = {
    ...createLegacyRequest(),
    runtimeTarget: createLambdaTarget()
  } satisfies PutProjectDeploymentTargetRequest;

  await assert.rejects(
    () =>
      putProjectDeploymentTarget(
        {
          projectId: "11111111-1111-4111-8111-111111111111",
          userId: "22222222-2222-4222-8222-222222222222",
          target: request
        },
        createRepository({ accountId: "123456789012" })
      ),
    ReleaseLedgerValidationError
  );
});

test("canonical and legacy targets cannot name different provider resources", async () => {
  const request = createLegacyRequest();
  const canonical = normalizeEcsTarget(request);
  const conflicting = {
    ...canonical,
    orchestrator: { ...canonical.orchestrator, serviceName: "other-service" }
  } satisfies RuntimeDeploymentTarget;

  await assert.rejects(
    () => putProjectDeploymentTarget(
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
        target: { ...request, runtimeTarget: conflicting }
      },
      createRepository({ accountId: "123456789012" })
    ),
    ReleaseLedgerValidationError
  );
});

function createRepository(options: {
  readonly accountId: string;
  readonly save?: ((input: SaveProjectDeploymentTargetInput) => void) | undefined;
}): ProjectReleaseLedgerRepository {
  return {
    async findAccessibleProject() {
      return { id: "11111111-1111-4111-8111-111111111111" };
    },
    async findVerifiedConnection() {
      return {
        id: "33333333-3333-4333-8333-333333333333",
        accountId: options.accountId,
        region: "ap-northeast-2"
      };
    },
    async findProjectDeploymentTarget() {
      return undefined;
    },
    async saveProjectDeploymentTarget(input) {
      options.save?.(input);
      return {
        ...input,
        createdAt: input.updatedAt
      };
    },
    async findDeploymentInProject() {
      return undefined;
    },
    async findPipelineRunInProject() {
      return undefined;
    },
    async createApplicationRelease() {
      throw new Error("not used");
    },
    async findAvailableApplicationArtifact() {
      return undefined;
    },
    async listProjectApplicationArtifacts() {
      return [];
    },
    async listProjectApplicationReleases() {
      return [];
    },
    async findProjectApplicationRelease() {
      return undefined;
    }
  };
}

function createLegacyRequest(): PutProjectDeploymentTargetRequest {
  return {
    provider: "aws",
    connectionId: "33333333-3333-4333-8333-333333333333",
    region: "ap-northeast-2",
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
      confirmedCommitSha: "a".repeat(40),
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
    rolloutStrategy: "all_at_once"
  };
}

function createLambdaTarget(): RuntimeDeploymentTarget {
  return {
    adapterKind: "lambda_alias",
    orchestrator: { kind: "lambda_alias", functionName: "app", aliasName: "live" },
    compute: { kind: "lambda_version", architecture: "x86_64" },
    capacity: { kind: "provider_managed" },
    rollout: {
      kind: "lambda_all_at_once",
      applicationName: "app",
      deploymentGroupName: "live"
    },
    health: { kind: "https", outputUrl: "https://app.example.com", path: "/health" }
  };
}

function normalizeEcsTarget(
  request: ReturnType<typeof createLegacyRequest>
): Extract<RuntimeDeploymentTarget, { adapterKind: "ecs_service_fargate" }> {
  const runtime = request.runtimeConfig;
  if (!runtime || runtime.runtimeTargetKind !== "ecs_fargate") {
    throw new Error("expected ECS runtime config");
  }
  return {
    adapterKind: "ecs_service_fargate",
    orchestrator: {
      kind: "ecs_service",
      clusterName: runtime.clusterName,
      serviceName: runtime.serviceName
    },
    compute: { kind: "container", containerName: runtime.containerName },
    capacity: { kind: "fargate", platformVersion: null },
    rollout: {
      kind: "ecs_rolling",
      minimumHealthyPercent: 0,
      maximumPercent: 100,
      circuitBreakerRollback: true
    },
    health: { kind: "https", outputUrl: runtime.outputUrl ?? "", path: "/health" }
  };
}
