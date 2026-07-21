import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureJson,
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
    readiness,
    handoffConfigurationPreview: null
  } satisfies ProjectDeliveryProfile);
  assert.equal(calls.includes("find-monitoring"), false);
  assert.equal(calls.includes("inspect-readiness"), true);
});

test("derives handoff configuration from the readiness-selected Deployment Architecture", async () => {
  const profile = await createProjectDeliveryProfileService({
    store: createStore({
      architectureForDeployment: {
        nodes: [
          {
            id: "database-1",
            type: "RDS",
            positionX: 0,
            positionY: 0,
            config: { terraformResourceType: "aws_db_instance" }
          }
        ],
        edges: []
      },
      deploymentTarget: createEcsWebTarget("https://app.example.com")
    }),
    inspectReadiness: async () => ({
      ...readiness,
      sourceDeploymentId: "deployment-1",
      approvedApplyPlanArtifactId: "plan-artifact-1"
    })
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.deepEqual(profile.handoffConfigurationPreview, {
    rdsEnabled: true,
    staticSiteUrl: "https://app.example.com",
    apiBaseUrl: "https://app.example.com"
  });
});

test("returns no handoff configuration when the readiness-selected Architecture is unavailable", async () => {
  const architectureLookupCalls: Array<{ projectId: string; deploymentId: string }> = [];
  const profile = await createProjectDeliveryProfileService({
    store: createStore({
      architectureLookupCalls,
      architectureForDeployment: null,
      deploymentTarget: createEcsWebTarget("https://app.example.com")
    }),
    inspectReadiness: async () => ({
      ...readiness,
      sourceDeploymentId: "deployment-1",
      approvedApplyPlanArtifactId: "plan-artifact-1"
    })
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(profile.handoffConfigurationPreview, null);
  assert.deepEqual(architectureLookupCalls, [
    { projectId: "project-1", deploymentId: "deployment-1" }
  ]);
});

test("does not read a handoff Architecture when no Deployment Target is confirmed", async () => {
  const architectureLookupCalls: Array<{ projectId: string; deploymentId: string }> = [];
  const profile = await createProjectDeliveryProfileService({
    store: createStore({ architectureLookupCalls, deploymentTarget: null }),
    inspectReadiness: async () => ({
      ...readiness,
      sourceDeploymentId: "deployment-1",
      approvedApplyPlanArtifactId: "plan-artifact-1"
    })
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(profile.handoffConfigurationPreview, null);
  assert.deepEqual(architectureLookupCalls, []);
});

test("does not derive handoff configuration from an unconfirmed Deployment Target", async () => {
  const architectureLookupCalls: Array<{ projectId: string; deploymentId: string }> = [];
  const profile = await createProjectDeliveryProfileService({
    store: createStore({
      architectureLookupCalls,
      architectureForDeployment: { nodes: [], edges: [] },
      deploymentTarget: {
        ...createEcsWebTarget("https://app.example.com"),
        confirmedBuildConfig: null
      }
    }),
    inspectReadiness: async () => ({
      ...readiness,
      sourceDeploymentId: "deployment-1",
      approvedApplyPlanArtifactId: "plan-artifact-1"
    })
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(profile.handoffConfigurationPreview, null);
  assert.deepEqual(architectureLookupCalls, []);
});

test("does not read a handoff Architecture before an Apply Plan is approved", async () => {
  const architectureLookupCalls: Array<{ projectId: string; deploymentId: string }> = [];
  const profile = await createProjectDeliveryProfileService({
    store: createStore({
      architectureLookupCalls,
      architectureForDeployment: { nodes: [], edges: [] },
      deploymentTarget: createEcsWebTarget("https://app.example.com")
    }),
    inspectReadiness: async () => ({
      ...readiness,
      sourceDeploymentId: "deployment-1",
      approvedApplyPlanArtifactId: null
    })
  }).get({ projectId: "project-1", userId: "user-1" });

  assert.equal(profile.handoffConfigurationPreview, null);
  assert.deepEqual(architectureLookupCalls, []);
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
  architectureLookupCalls?: Array<{ projectId: string; deploymentId: string }>;
  architectureForDeployment?: ArchitectureJson | null;
  calls?: string[];
  deploymentTarget?: ProjectDeploymentTarget | null;
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
    async findArchitectureForDeployment(projectId, deploymentId) {
      input.architectureLookupCalls?.push({ projectId, deploymentId });
      return input.architectureForDeployment ?? null;
    },
    async findDeploymentTarget() {
      return input.deploymentTarget ?? null;
    },
    async findEnvironmentName() {
      return null;
    }
  };
}

function createEcsWebTarget(outputUrl: string): ProjectDeploymentTarget {
  return {
    projectId: "project-1",
    provider: "aws",
    connectionId: "connection-1",
    region: "ap-northeast-2",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [
        { kind: "dockerfile", path: "apps/api/Dockerfile" },
        { kind: "package_manifest", path: "apps/web/package.json" },
        { kind: "static_output", path: "apps/web/.next" }
      ],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
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
      confirmedAt: "2026-07-22T00:00:00.000Z",
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
          outputPath: "apps/web/.next"
        }
      }
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "app-build",
      ecrRepositoryName: "app",
      clusterName: "app-cluster",
      serviceName: "app-service",
      containerName: "app",
      outputUrl
    },
    rolloutStrategy: "all_at_once",
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z"
  };
}
