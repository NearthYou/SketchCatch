import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitCicdReadinessSnapshot,
  ProjectDeliveryProfile,
  ProjectDeploymentTarget,
  RepositoryAnalysisRecord,
  SourceRepository
} from "@sketchcatch/types";
import {
  createProjectDeliveryProfileService,
  ProjectDeliveryProfileNotFoundError,
  type ProjectDeliveryProfileStore
} from "./project-delivery-profile-service.js";

const readiness: GitCicdReadinessSnapshot = {
  projectId: "project-1",
  checkedAt: "2026-07-17T00:00:00.000Z",
  ready: false,
  requiredActionCount: 3,
  sourceDeploymentId: null,
  approvedApplyPlanArtifactId: null,
  initialApplicationReleaseId: null,
  items: []
};

test("composes a partial Delivery profile without requiring optional settings", async () => {
  const calls: string[] = [];
  const profile = await createProjectDeliveryProfileService({
    store: createStore({ calls }),
    inspectReadiness: async () => {
      calls.push("inspect-readiness");
      return readiness;
    }
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.deepEqual(profile, {
    githubInstallations: [],
    repositoryAnalysisTarget: null,
    sourceRepository: null,
    monitoringConfig: null,
    deploymentTarget: null,
    environmentName: null,
    readiness
  } satisfies ProjectDeliveryProfile);
  assert.equal(calls.includes("find-monitoring"), false);
  assert.equal(calls.includes("inspect-readiness"), true);
});

test("loads monitoring only for the active Source Repository", async () => {
  const calls: string[] = [];
  const sourceRepository = { id: "source-1" } as SourceRepository;
  const profile = await createProjectDeliveryProfileService({
    store: createStore({ calls, sourceRepository }),
    inspectReadiness: async () => readiness
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(profile.sourceRepository, sourceRepository);
  assert.equal(profile.monitoringConfig?.sourceRepositoryId, "source-1");
  assert.equal(calls.includes("find-monitoring"), true);
});

test("does not disclose a profile for an inaccessible project", async () => {
  const service = createProjectDeliveryProfileService({
    store: createStore({ accessible: false }),
    inspectReadiness: async () => readiness
  });

  await assert.rejects(
    service.get({ projectId: "project-1", userId: "another-user" }),
    ProjectDeliveryProfileNotFoundError
  );
});

function createStore(input: {
  accessible?: boolean;
  calls?: string[];
  sourceRepository?: SourceRepository | null;
} = {}): ProjectDeliveryProfileStore {
  const calls = input.calls ?? [];
  return {
    async isProjectAccessible() {
      return input.accessible ?? true;
    },
    async listGitHubInstallations() {
      return [];
    },
    async findRepositoryAnalysisTarget() {
      return null as RepositoryAnalysisRecord | null;
    },
    async findActiveSourceRepository() {
      return input.sourceRepository ?? null;
    },
    async findMonitoringConfig(sourceRepositoryId) {
      calls.push("find-monitoring");
      return {
        sourceRepositoryId,
        enabled: true,
        monitorBranch: "main",
        appPath: { mode: "repository_root", path: "." },
        infraPath: { mode: "subdirectory", path: "infra" },
        validationStatus: "valid",
        validationMessage: null,
        validatedAt: null,
        updatedAt: "2026-07-17T00:00:00.000Z"
      };
    },
    async findDeploymentTarget() {
      return null as ProjectDeploymentTarget | null;
    },
    async findEnvironmentName() {
      return null;
    }
  };
}
