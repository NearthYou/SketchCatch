import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitCicdMonitoringConfig,
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

test("computes unsaved monitoring defaults from the Delivery source without persisting", async () => {
  const sourceRepository = {
    id: "source-1",
    defaultBranch: "develop",
    updatedAt: "2026-07-20T01:02:03.000Z"
  } as SourceRepository;
  const profile = await createProjectDeliveryProfileService({
    store: createStore({ sourceRepository, monitoringConfig: null }),
    inspectReadiness: async () => readiness
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.deepEqual(profile.monitoringConfig, {
    sourceRepositoryId: "source-1",
    enabled: true,
    monitorBranch: "develop",
    appPath: { mode: "repository_root", path: "." },
    infraPath: { mode: "repository_root", path: "." },
    validationStatus: "required",
    validationMessage: null,
    validatedAt: null,
    updatedAt: "2026-07-20T01:02:03.000Z"
  });
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

test("does not reuse an unrelated active Repository when current Board provenance is unattached", async () => {
  const calls: string[] = [];
  const profile = await createProjectDeliveryProfileService({
    store: createStore({
      analysisTarget: { sourceRepositoryId: null } as RepositoryAnalysisRecord,
      calls,
      sourceRepository: { id: "old-source" } as SourceRepository
    }),
    inspectReadiness: async () => readiness
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(profile.sourceRepository, null);
  assert.equal(calls.includes("find-source"), true);
  assert.equal(calls.includes("find-monitoring"), false);
});

test("passes the exact Delivery source id to readiness", async () => {
  let readinessSourceId: string | null | undefined;
  await createProjectDeliveryProfileService({
    store: createStore({
      analysisTarget: { sourceRepositoryId: "source-board" } as RepositoryAnalysisRecord,
      sourceRepository: { id: "source-board" } as SourceRepository
    }),
    inspectReadiness: async (input) => {
      readinessSourceId = (
        input as typeof input & { deliverySourceRepositoryId?: string | null }
      ).deliverySourceRepositoryId;
      return readiness;
    }
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(readinessSourceId, "source-board");
});

test("passes null to readiness instead of a stale active Repository", async () => {
  let readinessSourceId: string | null | undefined;
  await createProjectDeliveryProfileService({
    store: createStore({
      analysisTarget: { sourceRepositoryId: null } as RepositoryAnalysisRecord,
      sourceRepository: { id: "source-old" } as SourceRepository
    }),
    inspectReadiness: async (input) => {
      readinessSourceId = (
        input as typeof input & { deliverySourceRepositoryId?: string | null }
      ).deliverySourceRepositoryId;
      return readiness;
    }
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(readinessSourceId, null);
});

function createStore(input: {
  accessible?: boolean;
  analysisTarget?: RepositoryAnalysisRecord | null;
  calls?: string[];
  sourceRepository?: SourceRepository | null;
  monitoringConfig?: GitCicdMonitoringConfig | null;
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
      return input.analysisTarget ?? null;
    },
    async listActiveSourceRepositories() {
      calls.push("find-source");
      return input.sourceRepository ? [input.sourceRepository] : [];
    },
    async findMonitoringConfig(sourceRepositoryId) {
      calls.push("find-monitoring");
      if ("monitoringConfig" in input) {
        return input.monitoringConfig ?? null;
      }
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
