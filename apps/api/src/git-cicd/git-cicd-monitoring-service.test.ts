import assert from "node:assert/strict";
import test from "node:test";
import {
  getGitCicdMonitoringConfig,
  GitCicdMonitoringValidationError,
  normalizeMonitoredPath,
  updateGitCicdMonitoringConfig,
  type GitCicdMonitoringConfigRecord,
  type GitCicdMonitoringRepository
} from "./git-cicd-monitoring-service.js";

const accessContext = { kind: "user", userId: "user-1" } as const;
const sourceRepository = {
  id: "repository-1",
  projectId: "project-1",
  provider: "github" as const,
  status: "active" as const,
  githubInstallationId: "42",
  owner: "owner",
  name: "repo",
  defaultBranch: "main"
};

test("normalizeMonitoredPath normalizes repository root and rejects unsafe subdirectories", () => {
  assert.deepEqual(normalizeMonitoredPath({ mode: "repository_root", path: "anything" }), {
    mode: "repository_root",
    path: "."
  });
  assert.deepEqual(normalizeMonitoredPath({ mode: "subdirectory", path: "./apps/web/" }), {
    mode: "subdirectory",
    path: "apps/web"
  });

  for (const path of ["../secrets", "apps/../../secrets", "/etc", "C:\\secrets", "https://x/y"]) {
    assert.throws(
      () => normalizeMonitoredPath({ mode: "subdirectory", path }),
      GitCicdMonitoringValidationError
    );
  }
});

test("disabled monitoring persists normalized paths without provider validation", async () => {
  const repository = createRepository();
  const result = await updateGitCicdMonitoringConfig(
    {
      projectId: "project-1",
      sourceRepositoryId: "repository-1",
      accessContext,
      enabled: false,
      monitorBranch: "feature/next",
      appPath: { mode: "repository_root", path: "ignored" },
      infraPath: { mode: "subdirectory", path: "./infra/" },
      userAcceptedChangeId: "accepted-1"
    },
    repository,
    {
      async validateBranch() {
        throw new Error("provider must not be called");
      },
      async validateDirectory() {
        throw new Error("provider must not be called");
      }
    }
  );

  assert.equal(result.enabled, false);
  assert.deepEqual(result.appPath, { mode: "repository_root", path: "." });
  assert.deepEqual(result.infraPath, { mode: "subdirectory", path: "infra" });
  assert.equal(result.validationStatus, "required");
  assert.equal(result.validationMessage, null);
  assert.equal(result.validatedAt, null);
});

test("enabled monitoring validates the branch and both directories before persisting valid", async () => {
  const repository = createRepository();
  const checkedPaths: string[] = [];
  const result = await updateGitCicdMonitoringConfig(
    {
      projectId: "project-1",
      sourceRepositoryId: "repository-1",
      accessContext,
      enabled: true,
      monitorBranch: "main",
      appPath: { mode: "subdirectory", path: "apps/web" },
      infraPath: { mode: "subdirectory", path: "infra" },
      userAcceptedChangeId: "accepted-1"
    },
    repository,
    {
      async validateBranch(input) {
        assert.equal(input.branch, "main");
        return true;
      },
      async validateDirectory(input) {
        checkedPaths.push(input.path);
        return "directory";
      }
    },
    () => new Date("2026-07-13T00:00:00.000Z")
  );

  assert.deepEqual(checkedPaths, ["apps/web", "infra"]);
  assert.equal(result.validationStatus, "valid");
  assert.equal(result.validatedAt?.toISOString(), "2026-07-13T00:00:00.000Z");
});

test("enabled monitoring returns stable validation codes", async (t) => {
  const cases = [
    {
      name: "missing branch",
      branch: false,
      directory: "directory" as const,
      code: "MONITOR_BRANCH_NOT_FOUND"
    },
    {
      name: "missing path",
      branch: true,
      directory: "missing" as const,
      code: "MONITOR_PATH_NOT_FOUND"
    },
    {
      name: "file path",
      branch: true,
      directory: "file" as const,
      code: "MONITOR_PATH_NOT_DIRECTORY"
    }
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      await assert.rejects(
        updateGitCicdMonitoringConfig(
          {
            projectId: "project-1",
            sourceRepositoryId: "repository-1",
            accessContext,
            enabled: true,
            monitorBranch: "missing",
            appPath: { mode: "subdirectory", path: "apps/web" },
            infraPath: { mode: "subdirectory", path: "infra" },
            userAcceptedChangeId: "accepted-1"
          },
          createRepository(),
          {
            async validateBranch() {
              return testCase.branch;
            },
            async validateDirectory() {
              return testCase.directory;
            }
          }
        ),
        (error: unknown) =>
          error instanceof GitCicdMonitoringValidationError && error.code === testCase.code
      );
    });
  }
});

test("provider permission failures become GITHUB_PERMISSION_REQUIRED", async () => {
  await assert.rejects(
    updateGitCicdMonitoringConfig(
      {
        projectId: "project-1",
        sourceRepositoryId: "repository-1",
        accessContext,
        enabled: true,
        monitorBranch: "main",
        appPath: { mode: "subdirectory", path: "apps/web" },
        infraPath: { mode: "subdirectory", path: "infra" },
        userAcceptedChangeId: "accepted-1"
      },
      createRepository(),
      {
        async validateBranch() {
          throw Object.assign(new Error("forbidden"), { statusCode: 403 });
        },
        async validateDirectory() {
          return "directory";
        }
      }
    ),
    (error: unknown) =>
      error instanceof GitCicdMonitoringValidationError &&
      error.code === "GITHUB_PERMISSION_REQUIRED"
  );
});

test("get persists a durable enabled default for an active repository without a config", async () => {
  const repository = createRepository();
  const result = await getGitCicdMonitoringConfig(
    {
      projectId: "project-1",
      sourceRepositoryId: "repository-1",
      accessContext
    },
    repository
  );

  assert.equal(result.enabled, true);
  assert.equal(result.monitorBranch, "main");
  assert.deepEqual(result.appPath, { mode: "repository_root", path: "." });
  assert.deepEqual(result.infraPath, { mode: "repository_root", path: "." });
  assert.equal(result.validationStatus, "required");
});

function createRepository(): GitCicdMonitoringRepository {
  let config: GitCicdMonitoringConfigRecord | undefined;
  return {
    async findAccessibleSourceRepository(projectId, sourceRepositoryId, context) {
      return projectId === sourceRepository.projectId &&
        sourceRepositoryId === sourceRepository.id &&
        context.userId === accessContext.userId
        ? sourceRepository
        : undefined;
    },
    async findConfig(sourceRepositoryId) {
      return sourceRepositoryId === sourceRepository.id ? config : undefined;
    },
    async upsertConfig(input) {
      config = {
        ...input,
        updatedAt: new Date("2026-07-13T00:00:00.000Z")
      };
      return config;
    }
  };
}
