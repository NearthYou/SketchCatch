import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, EcsFargateRuntimeConfig } from "@sketchcatch/types";
import {
  ProjectBuildEnvironmentError,
  createPostgresProjectBuildEnvironmentRepository,
  createDesiredProjectBuildEnvironment,
  deleteProjectBuildEnvironment,
  prepareProjectBuildEnvironment,
  synchronizeEcsFargateRuntimeConfigWithArchitecture,
  verifyProjectRepositoryAccess,
  type ProjectBuildEnvironmentGateway,
  type ProjectBuildEnvironmentPreparationContext,
  type ProjectBuildEnvironmentRecord,
  type ProjectBuildEnvironmentRepository
} from "./project-build-environment-service.js";
import {
  resolveAwsDeploymentTargetIdentity
} from "../runtime-convergence/deployment-target-identity.js";

const now = new Date("2026-07-15T12:00:00.000Z");

test("approved Architecture replaces stale ECS target coordinates before Plan", () => {
  const current: EcsFargateRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: "demo-app-build",
    ecrRepositoryName: "demo-app",
    ecrRepositoryArn: "arn:aws:ecr:ap-northeast-2:131404649047:repository/demo-app",
    clusterName: "demo-cluster",
    serviceName: "demo-service",
    containerName: "api",
    taskDefinitionArn:
      "arn:aws:ecs:ap-northeast-2:131404649047:task-definition/demo-app:1",
    outputUrl: "https://old.example.com"
  };
  const architectureJson: ArchitectureJson = {
    nodes: [
      architectureNode("ECR_REPOSITORY", { name: "audience-live-check-api" }),
      architectureNode("ECS_CLUSTER", { name: "audience-live-check-cluster" }),
      architectureNode("ECS_SERVICE", {
        name: "audience-live-check-service",
        loadBalancer: [{ containerName: "api", containerPort: 8080 }]
      })
    ],
    edges: []
  };

  const result = synchronizeEcsFargateRuntimeConfigWithArchitecture(
    current,
    architectureJson,
    "sketchcatch-5ac411f8-build"
  );

  assert.deepEqual(result, {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: "sketchcatch-5ac411f8-build",
    ecrRepositoryName: "audience-live-check-api",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "api",
    containerPort: 8080,
    outputUrl: null
  });
});

test("approved Architecture replaces a stale ECS container port before Plan", () => {
  const current: EcsFargateRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: "sketchcatch-5ac411f8-build",
    ecrRepositoryName: "audience-live-check-api",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "api",
    containerPort: 3000,
    taskDefinitionArn:
      "arn:aws:ecs:ap-northeast-2:131404649047:task-definition/audience-live-check:1",
    outputUrl: "https://old.example.com"
  };
  const architectureJson: ArchitectureJson = {
    nodes: [
      architectureNode("ECR_REPOSITORY", { name: current.ecrRepositoryName }),
      architectureNode("ECS_CLUSTER", { name: current.clusterName }),
      architectureNode("ECS_SERVICE", {
        name: current.serviceName,
        loadBalancer: [{ containerName: current.containerName, containerPort: 8080 }]
      })
    ],
    edges: []
  };

  const result = synchronizeEcsFargateRuntimeConfigWithArchitecture(
    current,
    architectureJson,
    current.codeBuildProjectName
  );

  assert.deepEqual(result, {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: current.codeBuildProjectName,
    ecrRepositoryName: current.ecrRepositoryName,
    clusterName: current.clusterName,
    serviceName: current.serviceName,
    containerName: current.containerName,
    containerPort: 8080,
    outputUrl: null
  });
});

test("Board ECS synchronization repairs the canonical target identity even when runtime config is unchanged", async () => {
  const runtimeConfig: EcsFargateRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: "sketchcatch-5ac411f8-build",
    ecrRepositoryName: "audience-live-check-api",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "api",
    containerPort: 8080,
    outputUrl: null
  };
  const architectureJson: ArchitectureJson = {
    nodes: [
      architectureNode("ECR_REPOSITORY", { name: runtimeConfig.ecrRepositoryName }),
      architectureNode("ECS_CLUSTER", { name: runtimeConfig.clusterName }),
      architectureNode("ECS_SERVICE", {
        name: runtimeConfig.serviceName,
        loadBalancer: [{ containerName: runtimeConfig.containerName, containerPort: 8080 }]
      })
    ],
    edges: []
  };
  let persisted: Record<string, unknown> | undefined;
  const selectQuery = {
    from() {
      return this;
    },
    innerJoin() {
      return this;
    },
    where() {
      return this;
    },
    async for() {
      return [
        {
          accountId: "131404649047",
          architectureJson,
          confirmedBuildConfig: { healthCheckPath: "/health" },
          deploymentTargetFingerprint: "f".repeat(64),
          region: "ap-northeast-2",
          runtimeConfig,
          runtimeTarget: {
            adapterKind: "ecs_service_fargate",
            orchestrator: {
              kind: "ecs_service",
              clusterName: "stale-cluster",
              serviceName: "stale-service"
            }
          },
          runtimeTargetKind: "ecs_fargate"
        }
      ];
    }
  };
  const updateQuery = {
    set(values: Record<string, unknown>) {
      persisted = values;
      return this;
    },
    async where() {
      return [];
    }
  };
  const repository = createPostgresProjectBuildEnvironmentRepository({
    async transaction(operation: (transaction: unknown) => Promise<unknown>) {
      return operation({
        select() {
          return selectQuery;
        },
        update() {
          return updateQuery;
        }
      });
    }
  } as never);

  await repository.synchronizeEcsRuntimeConfig({
    architectureId: "architecture-1",
    codeBuildProjectName: runtimeConfig.codeBuildProjectName,
    projectId: "project-1",
    userId: "user-1"
  });

  const expectedIdentity = resolveAwsDeploymentTargetIdentity({
    projectId: "project-1",
    accountId: "131404649047",
    region: "ap-northeast-2",
    runtimeConfig,
    healthCheckPath: "/health"
  });
  assert.ok(persisted);
  assert.deepEqual(persisted.runtimeConfig, runtimeConfig);
  assert.deepEqual(persisted.runtimeTarget, expectedIdentity.target);
  assert.equal(
    persisted.deploymentTargetFingerprint,
    expectedIdentity.deploymentTargetFingerprint
  );
});

test("build environment preparation requires an active GitHub repository", async () => {
  const context = createContext({ sourceRepository: null });
  const repository = createRepository(context);

  await assert.rejects(
    prepareProjectBuildEnvironment(
      { projectId: context.projectId, userId: "user-1" },
      repository,
      createGateway()
    ),
    (error) =>
      error instanceof ProjectBuildEnvironmentError &&
      error.code === "SOURCE_REPOSITORY_REQUIRED"
  );
});

test("build environment preparation requires an available GitHub CodeConnection", async () => {
  const context = createContext({ codeConnection: null });
  const repository = createRepository(context);

  await assert.rejects(
    prepareProjectBuildEnvironment(
      { projectId: context.projectId, userId: "user-1" },
      repository,
      createGateway()
    ),
    (error) =>
      error instanceof ProjectBuildEnvironmentError &&
      error.code === "CODECONNECTION_REQUIRED"
  );
});

test("build environment preparation reconciles one project-scoped build environment", async () => {
  const context = createContext();
  const repository = createRepository(context);
  const reconciledInputs: Array<{ projectName: string; repositoryUrl: string }> = [];
  const gateway = createGateway({
    async reconcile(input) {
      reconciledInputs.push({
        projectName: input.codeBuildProjectName,
        repositoryUrl: input.sourceRepositoryUrl
      });
      return { verified: true, statusReason: null };
    }
  });

  const first = await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    gateway,
    { generateId: () => "build-environment-1", now: () => now }
  );
  const second = await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    gateway,
    { generateId: () => "unused", now: () => now }
  );

  assert.equal(first.buildEnvironment?.id, "build-environment-1");
  assert.equal(first.buildEnvironment?.status, "ready");
  assert.equal(first.buildEnvironment?.runtimeFingerprint.length, 64);
  const desired = createDesiredProjectBuildEnvironment(context as Parameters<
    typeof createDesiredProjectBuildEnvironment
  >[0]);
  assert.deepEqual(desired.buildCache, {
    repositoryName: "sketchcatch-12345678-build-cache",
    repositoryArn:
      "arn:aws:ecr:ap-northeast-2:131404649047:repository/sketchcatch-12345678-build-cache",
    repositoryUri:
      "131404649047.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-12345678-build-cache",
    cacheTag: "buildcache-v1-linux-amd64",
    cacheReference:
      "131404649047.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-12345678-build-cache:buildcache-v1-linux-amd64"
  });
  assert.equal(second.buildEnvironment?.id, "build-environment-1");
  assert.deepEqual(reconciledInputs, [
    {
      projectName: "sketchcatch-12345678-build",
      repositoryUrl: "https://github.com/jh-9999/audience-live-check.git"
    },
    {
      projectName: "sketchcatch-12345678-build",
      repositoryUrl: "https://github.com/jh-9999/audience-live-check.git"
    }
  ]);
});

test("repository access verification records the exact CodeBuild checkout commit", async () => {
  const context = createContext();
  const repository = createRepository(context);
  await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway(),
    { generateId: () => "build-environment-1", now: () => now }
  );
  const requestedCommitSha = context.confirmedBuildConfig?.confirmedCommitSha ?? "";
  const result = await verifyProjectRepositoryAccess(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway({
      async verifyRepositoryAccess(_input, commitSha) {
        return {
          verified: true,
          requestedCommitSha: commitSha,
          resolvedCommitSha: commitSha,
          buildArn: "arn:aws:codebuild:ap-northeast-2:131404649047:build/verify:1",
          statusReason: null
        };
      }
    }),
    { now: () => now }
  );

  assert.equal(result.buildEnvironment?.repositoryVerificationStatus, "verified");
  assert.equal(
    result.buildEnvironment?.repositoryVerificationRequestedCommitSha,
    requestedCommitSha
  );
  assert.equal(
    result.buildEnvironment?.repositoryVerificationResolvedCommitSha,
    requestedCommitSha
  );
  assert.match(result.buildEnvironment?.repositoryVerificationBuildArn ?? "", /codebuild/);
  assert.equal(result.buildEnvironment?.repositoryVerifiedAt, now.toISOString());
});

test("re-preparing an unchanged build environment preserves exact repository verification", async () => {
  const context = createContext();
  const repository = createRepository(context);
  const gateway = createGateway();

  await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    gateway,
    { generateId: () => "build-environment-1", now: () => now }
  );
  const verified = await verifyProjectRepositoryAccess(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    gateway,
    { now: () => now }
  );
  const preparedAgain = await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    gateway,
    { generateId: () => "unused", now: () => new Date("2026-07-15T12:01:00.000Z") }
  );

  assert.equal(verified.buildEnvironment?.repositoryVerificationStatus, "verified");
  assert.equal(preparedAgain.buildEnvironment?.repositoryVerificationStatus, "verified");
  assert.equal(
    preparedAgain.buildEnvironment?.repositoryVerificationRequestedCommitSha,
    context.confirmedBuildConfig?.confirmedCommitSha
  );
  assert.equal(
    preparedAgain.buildEnvironment?.repositoryVerificationResolvedCommitSha,
    context.confirmedBuildConfig?.confirmedCommitSha
  );
  assert.equal(
    preparedAgain.buildEnvironment?.repositoryVerificationBuildArn,
    verified.buildEnvironment?.repositoryVerificationBuildArn
  );
  assert.equal(
    preparedAgain.buildEnvironment?.repositoryVerifiedAt,
    verified.buildEnvironment?.repositoryVerifiedAt
  );
});

test("repository access verification records a safe failure when CodeBuild cannot checkout", async () => {
  const context = createContext();
  const repository = createRepository(context);
  await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway(),
    { generateId: () => "build-environment-1", now: () => now }
  );

  const result = await verifyProjectRepositoryAccess(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway({
      async verifyRepositoryAccess() {
        throw new Error("Access denied\nsecretAccessKey=temporary-secret-value");
      }
    }),
    { now: () => now }
  );

  assert.equal(result.buildEnvironment?.repositoryVerificationStatus, "failed");
  assert.equal(result.buildEnvironment?.repositoryVerificationResolvedCommitSha, null);
  assert.equal(result.buildEnvironment?.repositoryVerificationBuildArn, null);
  assert.equal(
    result.buildEnvironment?.repositoryVerificationStatusReason,
    "CodeBuild repository checkout failed: Access denied [REDACTED]"
  );
  assert.equal(result.buildEnvironment?.repositoryVerifiedAt, null);
});

test("repository access verification checks the live CodeBuild source before starting checkout", async () => {
  const context = createContext();
  const repository = createRepository(context);
  await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway(),
    { generateId: () => "build-environment-1", now: () => now }
  );
  let checkoutStarted = false;

  const result = await verifyProjectRepositoryAccess(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway({
      async verify() {
        return {
          verified: false,
          statusReason: "CodeBuild project source does not match the project contract"
        };
      },
      async verifyRepositoryAccess(_input, requestedCommitSha) {
        checkoutStarted = true;
        return {
          verified: true,
          requestedCommitSha,
          resolvedCommitSha: requestedCommitSha,
          buildArn: "unexpected",
          statusReason: null
        };
      }
    }),
    { now: () => now }
  );

  assert.equal(checkoutStarted, false);
  assert.equal(result.buildEnvironment?.repositoryVerificationStatus, "failed");
  assert.match(
    result.buildEnvironment?.repositoryVerificationStatusReason ?? "",
    /source does not match/
  );
});

test("build environment preparation synchronizes the deployment target before AWS reconciliation", async () => {
  const context = createContext();
  const repository = createRepository(context);
  const calls: string[] = [];
  Object.assign(repository, {
    async synchronizeEcsRuntimeConfig(input: {
      architectureId: string;
      codeBuildProjectName: string;
      projectId: string;
      userId: string;
    }) {
      assert.deepEqual(input, {
        architectureId: "architecture-1",
        codeBuildProjectName: "sketchcatch-12345678-build",
        projectId: context.projectId,
        userId: "user-1"
      });
      calls.push("synchronize_runtime");
    }
  });

  await prepareProjectBuildEnvironment(
    {
      projectId: context.projectId,
      userId: "user-1",
      architectureId: "architecture-1"
    } as Parameters<typeof prepareProjectBuildEnvironment>[0] & { architectureId: string },
    repository,
    createGateway({
      async reconcile() {
        calls.push("reconcile_aws");
        return { verified: true, statusReason: null };
      }
    }),
    { generateId: () => "build-environment-1", now: () => now }
  );

  assert.deepEqual(calls, ["synchronize_runtime", "reconcile_aws"]);
});

test("build environment preparation records verification failures without reporting ready", async () => {
  const context = createContext();
  const repository = createRepository(context);
  const result = await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway({
      async reconcile() {
        return { verified: false, statusReason: "forbidden deployment permission detected" };
      }
    }),
    { generateId: () => "build-environment-1", now: () => now }
  );

  assert.equal(result.buildEnvironment?.status, "verification_failed");
  assert.equal(result.buildEnvironment?.lastVerifiedAt, null);
});

test("build environment preparation persists a retryable failure when AWS reconciliation throws", async () => {
  const context = createContext();
  const repository = createRepository(context);

  await assert.rejects(
    prepareProjectBuildEnvironment(
      { projectId: context.projectId, userId: "user-1" },
      repository,
      createGateway({
        async reconcile() {
          throw new Error("AccessDenied: iam:CreateRole");
        }
      }),
      { generateId: () => "build-environment-1", now: () => now }
    ),
    (error) =>
      error instanceof ProjectBuildEnvironmentError &&
      error.code === "BUILD_ENVIRONMENT_PREPARE_FAILED"
  );

  const saved = await repository.findByProjectId(context.projectId);
  assert.equal(saved?.status, "verification_failed");
  assert.equal(saved?.lastVerifiedAt, null);
});

test("build environment preparation cannot become ready after project deletion starts", async () => {
  const context = createContext();
  const baseRepository = createRepository(context);
  let deletionStarted = false;
  const repository: ProjectBuildEnvironmentRepository = {
    ...baseRepository,
    async findPreparationContext() {
      return deletionStarted ? undefined : context;
    }
  };

  await assert.rejects(
    prepareProjectBuildEnvironment(
      { projectId: context.projectId, userId: "user-1" },
      repository,
      createGateway({
        async reconcile() {
          deletionStarted = true;
          return { verified: true, statusReason: null };
        }
      }),
      { generateId: () => "build-environment-1", now: () => now }
    ),
    (error) =>
      error instanceof ProjectBuildEnvironmentError &&
      error.code === "BUILD_ENVIRONMENT_PREPARE_FAILED"
  );

  const saved = await repository.findByProjectId(context.projectId);
  assert.equal(saved?.status, "verification_failed");
});

test("build environment fingerprint changes when the approved frontend build snapshot changes", () => {
  const base = createContext();
  assert.ok(base.sourceRepository);
  assert.ok(base.awsConnection);
  assert.ok(base.codeConnection);
  assert.ok(base.codeConnection.connectionArn);
  const requiredBase = {
    ...base,
    sourceRepository: base.sourceRepository,
    awsConnection: base.awsConnection,
    codeConnection: {
      ...base.codeConnection,
      connectionArn: base.codeConnection.connectionArn
    }
  };
  const first = createDesiredProjectBuildEnvironment({
    ...requiredBase,
    confirmedBuildConfig: createConfirmedBuildConfig("apps/web/dist")
  });
  const second = createDesiredProjectBuildEnvironment({
    ...requiredBase,
    confirmedBuildConfig: createConfirmedBuildConfig("apps/web/build")
  });

  assert.notEqual(first.runtimeFingerprint, second.runtimeFingerprint);
});

test("build environment fingerprint changes when the confirmed repository commit changes", () => {
  const base = createContext();
  assert.ok(base.sourceRepository);
  assert.ok(base.awsConnection);
  assert.ok(base.codeConnection);
  assert.ok(base.codeConnection.connectionArn);
  const requiredBase = {
    ...base,
    sourceRepository: base.sourceRepository,
    awsConnection: base.awsConnection,
    codeConnection: {
      ...base.codeConnection,
      connectionArn: base.codeConnection.connectionArn
    }
  };
  const firstConfig = createConfirmedBuildConfig("apps/web/dist");
  const first = createDesiredProjectBuildEnvironment({
    ...requiredBase,
    confirmedBuildConfig: firstConfig
  });
  const second = createDesiredProjectBuildEnvironment({
    ...requiredBase,
    confirmedBuildConfig: {
      ...firstConfig,
      confirmedCommitSha: "b".repeat(40)
    }
  });

  assert.notEqual(first.runtimeFingerprint, second.runtimeFingerprint);
});

test("build environment deletion removes verified AWS resources before its database record", async () => {
  const context = createContext();
  const baseRepository = createRepository(context);
  await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    baseRepository,
    createGateway(),
    { generateId: () => "build-environment-1", now: () => now }
  );
  const existing = await baseRepository.findByProjectId(context.projectId);
  assert.ok(existing);
  assert.ok(context.awsConnection);
  const calls: string[] = [];
  const repository: ProjectBuildEnvironmentRepository = {
    ...baseRepository,
    async findRemovalContext() {
      return { environment: existing, awsConnection: context.awsConnection! };
    },
    async deleteByProjectId(projectId) {
      calls.push(`db:${projectId}`);
      await baseRepository.deleteByProjectId(projectId);
    }
  };

  await deleteProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    repository,
    createGateway({
      async remove(input) {
        calls.push(`aws:${input.codeBuildProjectName}`);
      }
    })
  );

  assert.deepEqual(calls, [
    "aws:sketchcatch-12345678-build",
    `db:${context.projectId}`
  ]);
  assert.equal(await repository.findByProjectId(context.projectId), undefined);
});

test("build environment deletion is blocked while a project execution lease is active", async () => {
  const context = createContext();
  const baseRepository = createRepository(context);
  await prepareProjectBuildEnvironment(
    { projectId: context.projectId, userId: "user-1" },
    baseRepository,
    createGateway(),
    { generateId: () => "build-environment-1", now: () => now }
  );
  const existing = await baseRepository.findByProjectId(context.projectId);
  assert.ok(existing);
  assert.ok(context.awsConnection);
  let removeCalled = false;
  const repository: ProjectBuildEnvironmentRepository = {
    ...baseRepository,
    async findRemovalContext() {
      return { environment: existing, awsConnection: context.awsConnection! };
    },
    async hasActiveExecution() {
      return true;
    }
  };

  await assert.rejects(
    deleteProjectBuildEnvironment(
      { projectId: context.projectId, userId: "user-1" },
      repository,
      createGateway({
        async remove() {
          removeCalled = true;
        }
      })
    ),
    (error) =>
      error instanceof ProjectBuildEnvironmentError &&
      error.code === "BUILD_ENVIRONMENT_DELETE_BLOCKED"
  );
  assert.equal(removeCalled, false);
  assert.ok(await repository.findByProjectId(context.projectId));
});

function createContext(
  overrides: Partial<ProjectBuildEnvironmentPreparationContext> = {}
): ProjectBuildEnvironmentPreparationContext {
  return {
    projectId: "12345678-1234-1234-1234-1234567890ab",
    sourceRepository: {
      id: "source-1",
      owner: "jh-9999",
      name: "audience-live-check.git"
    },
    awsConnection: {
      id: "d346dcf5-0000-0000-0000-000000000000",
      accountId: "131404649047",
      roleArn:
        "arn:aws:iam::131404649047:role/SketchCatchTerraformExecutionRole-d346dcf5",
      externalId: "external-id",
      region: "ap-northeast-2"
    },
    codeConnection: {
      id: "codeconnection-1",
      connectionArn:
        "arn:aws:codeconnections:ap-northeast-2:131404649047:connection/connection-1",
      status: "AVAILABLE"
    },
    confirmedBuildConfig: createConfirmedBuildConfig("apps/web/dist"),
    ...overrides
  };
}

function createRepository(
  context: ProjectBuildEnvironmentPreparationContext
): ProjectBuildEnvironmentRepository {
  let record: ProjectBuildEnvironmentRecord | undefined;
  return {
    async findPreparationContext() {
      return context;
    },
    async findRemovalContext() {
      return undefined;
    },
    async hasActiveExecution() {
      return false;
    },
    async synchronizeEcsRuntimeConfig() {
      return;
    },
    async deleteByProjectId() {
      record = undefined;
    },
    async findByProjectId() {
      return record;
    },
    async save(input) {
      record = {
        ...input,
        createdAt: record?.createdAt ?? input.updatedAt
      };
      return record;
    }
  };
}

function createGateway(
  overrides: Partial<ProjectBuildEnvironmentGateway> = {}
): ProjectBuildEnvironmentGateway {
  return {
    async reconcile() {
      return { verified: true, statusReason: null };
    },
    async verify() {
      return { verified: true, statusReason: null };
    },
    async verifyRepositoryAccess(_input, requestedCommitSha) {
      return {
        verified: true,
        requestedCommitSha,
        resolvedCommitSha: requestedCommitSha,
        buildArn: "arn:aws:codebuild:ap-northeast-2:131404649047:build/test:1",
        statusReason: null
      };
    },
    ...overrides
  };
}

function createConfirmedBuildConfig(outputPath: string) {
  return {
    sourceRoot: ".",
    evidence: [],
    installPreset: "pnpm_frozen_lockfile" as const,
    buildPreset: "docker_build" as const,
    artifactOutputPath: outputPath,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: "apps/api/Dockerfile",
    packageManifestPath: "apps/web/package.json",
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha: "a".repeat(40),
    confirmedAt: "2026-07-15T00:00:00.000Z",
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
        packageManager: "pnpm" as const,
        packageManagerVersion: "10.11.1",
        installPreset: "pnpm_frozen_lockfile" as const,
        buildPreset: "pnpm_build" as const,
        outputPath
      }
    }
  };
}

function architectureNode(
  type: ArchitectureJson["nodes"][number]["type"],
  config: Record<string, unknown>
) {
  return {
    id: type,
    type,
    label: type,
    positionX: 0,
    positionY: 0,
    config
  };
}
