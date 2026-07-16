import assert from "node:assert/strict";
import test from "node:test";
import {
  ProjectBuildEnvironmentError,
  createDesiredProjectBuildEnvironment,
  deleteProjectBuildEnvironment,
  prepareProjectBuildEnvironment,
  type ProjectBuildEnvironmentGateway,
  type ProjectBuildEnvironmentPreparationContext,
  type ProjectBuildEnvironmentRecord,
  type ProjectBuildEnvironmentRepository
} from "./project-build-environment-service.js";

const now = new Date("2026-07-15T12:00:00.000Z");

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
