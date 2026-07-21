import assert from "node:assert/strict";
import test from "node:test";
import {
  getGitCicdMonitoringConfig,
  type GitCicdMonitoringRepository,
  type GitCicdMonitoringSourceRepository
} from "./git-cicd-monitoring-service.js";

const sourceRepository: GitCicdMonitoringSourceRepository = {
  id: "source-1",
  projectId: "project-1",
  provider: "github",
  status: "active",
  githubInstallationId: "installation-1",
  owner: "sketchcatch",
  name: "app",
  defaultBranch: "main",
  updatedAt: new Date("2026-07-20T01:02:03.000Z")
};

test("GET returns computed defaults without persisting a monitoring config", async () => {
  let writeCount = 0;
  const repository: GitCicdMonitoringRepository = {
    async findAccessibleSourceRepository() {
      return sourceRepository;
    },
    async findConfig() {
      return undefined;
    },
    async upsertConfig(input) {
      writeCount += 1;
      return { ...input, updatedAt: new Date() };
    }
  };

  const config = await getGitCicdMonitoringConfig({
    projectId: "project-1",
    sourceRepositoryId: "source-1",
    accessContext: { kind: "user", userId: "user-1" }
  }, repository);

  assert.equal(writeCount, 0);
  assert.equal(config.validationStatus, "required");
  assert.equal(config.monitorBranch, "main");
  assert.equal(config.updatedAt, sourceRepository.updatedAt);
});

test("GET returns the persisted config when one exists", async () => {
  const saved = {
    sourceRepositoryId: "source-1",
    enabled: false,
    monitorBranch: "release",
    appPath: { mode: "subdirectory" as const, path: "apps/web" },
    infraPath: { mode: "subdirectory" as const, path: "infra" },
    validationStatus: "required" as const,
    validationMessage: null,
    validatedAt: null,
    updatedAt: new Date("2026-07-20T02:00:00.000Z")
  };
  const repository: GitCicdMonitoringRepository = {
    async findAccessibleSourceRepository() {
      return sourceRepository;
    },
    async findConfig() {
      return saved;
    },
    async upsertConfig(input) {
      return { ...input, updatedAt: new Date() };
    }
  };

  assert.equal(await getGitCicdMonitoringConfig({
    projectId: "project-1",
    sourceRepositoryId: "source-1",
    accessContext: { kind: "user", userId: "user-1" }
  }, repository), saved);
});
