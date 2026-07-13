import assert from "node:assert/strict";
import { test } from "node:test";
import type { PutProjectDeploymentTargetRequest } from "@sketchcatch/types";
import {
  getProjectDeploymentTarget,
  listApplicationReleases,
  putProjectDeploymentTarget,
  recordApplicationRelease,
  ReleaseLedgerNotFoundError,
  ReleaseLedgerValidationError,
  type ApplicationReleaseRecord,
  type CreateApplicationReleaseRecordInput,
  type ProjectDeploymentTargetRecord,
  type ProjectReleaseLedgerRepository,
  type SaveProjectDeploymentTargetInput
} from "./project-release-ledger-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const connectionId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const pipelineRunId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-07-14T00:00:00.000Z");
const commitSha = "a".repeat(40);

test("project target upsert requires an owned project and verified regional connection", async () => {
  const repository = new InMemoryProjectReleaseLedgerRepository();

  repository.projectAccessible = false;
  await assert.rejects(
    putProjectDeploymentTarget(createTargetInput(), repository, () => now),
    ReleaseLedgerNotFoundError
  );

  repository.projectAccessible = true;
  repository.connection = null;
  await assert.rejects(
    putProjectDeploymentTarget(createTargetInput(), repository, () => now),
    ReleaseLedgerNotFoundError
  );

  repository.connection = { id: connectionId, region: "us-east-1" };
  await assert.rejects(
    putProjectDeploymentTarget(createTargetInput(), repository, () => now),
    /region must match/i
  );
});

test("project target is one replaceable record with structured build evidence", async () => {
  const repository = new InMemoryProjectReleaseLedgerRepository();

  const first = await putProjectDeploymentTarget(createTargetInput(), repository, () => now);
  const updated = await putProjectDeploymentTarget(
    createTargetInput({
      runtimeTargetKind: "lambda",
      runtimeConfig: null,
      confirmedBuildConfig: createBuildConfig({
        evidence: [{ kind: "sam_template", path: "template.yaml" }],
        buildPreset: "sam_build",
        dockerfilePath: null,
        samTemplatePath: "template.yaml",
        healthCheckPath: null
      })
    }),
    repository,
    () => new Date("2026-07-14T00:01:00.000Z")
  );

  assert.equal(first.projectId, projectId);
  assert.equal(repository.targets.size, 1);
  assert.equal(updated.runtimeTargetKind, "lambda");
  assert.equal((await getProjectDeploymentTarget({ projectId, userId }, repository))?.updatedAt.toISOString(), "2026-07-14T00:01:00.000Z");
});

test("project target rejects runtime-incompatible or unsafe build evidence", async () => {
  const repository = new InMemoryProjectReleaseLedgerRepository();

  await assert.rejects(
    putProjectDeploymentTarget(
      createTargetInput({
        runtimeTargetKind: "static_site",
        confirmedBuildConfig: createBuildConfig()
      }),
      repository,
      () => now
    ),
    ReleaseLedgerValidationError
  );
  await assert.rejects(
    putProjectDeploymentTarget(
      createTargetInput({
        confirmedBuildConfig: createBuildConfig({
          sourceRoot: "../outside",
          evidence: [{ kind: "dockerfile", path: "../Dockerfile" }]
        })
      }),
      repository,
      () => now
    ),
    ReleaseLedgerValidationError
  );
});

test("ECS project target requires safe immutable runtime coordinates", async () => {
  const repository = new InMemoryProjectReleaseLedgerRepository();

  await assert.rejects(
    putProjectDeploymentTarget(
      createTargetInput({ runtimeConfig: null }),
      repository,
      () => now
    ),
    /runtime configuration/i
  );
  await assert.rejects(
    putProjectDeploymentTarget(
      createTargetInput({
        runtimeConfig: createEcsRuntimeConfig({ outputUrl: "https://api.example.com?token=x" })
      }),
      repository,
      () => now
    ),
    /output url/i
  );
  await assert.rejects(
    putProjectDeploymentTarget(
      createTargetInput({
        runtimeConfig: createEcsRuntimeConfig({ serviceName: "../service" })
      }),
      repository,
      () => now
    ),
    /runtime configuration/i
  );
});

test("Direct and GitOps releases are recorded in the same project history", async () => {
  const repository = new InMemoryProjectReleaseLedgerRepository();
  await putProjectDeploymentTarget(createTargetInput(), repository, () => now);

  const direct = await recordApplicationRelease(
    {
      projectId,
      userId,
      deploymentId,
      pipelineRunId: null,
      source: "direct",
      runtimeTargetKind: "ecs_fargate",
      versionEvidence: { exactSemVerTag: "v1.4.0", commitSha },
      artifactDigest: "b".repeat(64),
      providerRevision: null,
      outputUrl: null,
      status: "deploying",
      healthEvidence: null,
      rollbackEvidence: null,
      startedAt: now,
      completedAt: null
    },
    repository,
    () => "66666666-6666-4666-8666-666666666666",
    () => now
  );
  const gitops = await recordApplicationRelease(
    {
      projectId,
      userId,
      deploymentId: null,
      pipelineRunId,
      source: "gitops",
      runtimeTargetKind: "ecs_fargate",
      versionEvidence: { manifestVersion: "1.5.0", commitSha: "c".repeat(40) },
      artifactDigest: "d".repeat(64),
      providerRevision: null,
      outputUrl: "https://api.example.com",
      status: "succeeded",
      healthEvidence: { state: "healthy" },
      rollbackEvidence: null,
      startedAt: now,
      completedAt: now
    },
    repository,
    () => "77777777-7777-4777-8777-777777777777",
    () => now
  );

  const history = await listApplicationReleases({ projectId, userId }, repository);

  assert.deepEqual(history.map((item) => item.source), ["gitops", "direct"]);
  assert.equal(direct.version, "v1.4.0");
  assert.equal(gitops.version, "1.5.0");
  assert.equal(repository.deploymentReleaseId, direct.id);
});

test("release references must match source, project, and active project target", async () => {
  const repository = new InMemoryProjectReleaseLedgerRepository();

  await assert.rejects(
    recordApplicationRelease(createReleaseInput(), repository, () => crypto.randomUUID(), () => now),
    /deployment target/i
  );
  await putProjectDeploymentTarget(createTargetInput(), repository, () => now);
  repository.deploymentAccessible = false;
  await assert.rejects(
    recordApplicationRelease(createReleaseInput(), repository, () => crypto.randomUUID(), () => now),
    ReleaseLedgerNotFoundError
  );
  repository.deploymentAccessible = true;
  await assert.rejects(
    recordApplicationRelease(
      { ...createReleaseInput(), pipelineRunId, source: "direct" },
      repository,
      () => crypto.randomUUID(),
      () => now
    ),
    ReleaseLedgerValidationError
  );
});

test("release ledger rejects unsafe Output URLs and secret-like provider metadata", async () => {
  const repository = new InMemoryProjectReleaseLedgerRepository();
  await putProjectDeploymentTarget(createTargetInput(), repository, () => now);

  await assert.rejects(
    recordApplicationRelease(
      { ...createReleaseInput(), outputUrl: "javascript:alert(1)" },
      repository,
      () => crypto.randomUUID(),
      () => now
    ),
    ReleaseLedgerValidationError
  );
  await assert.rejects(
    recordApplicationRelease(
      {
        ...createReleaseInput(),
        providerRevision: {
          provider: "aws",
          resourceType: "ecs_service",
          revisionId: "task-definition/api:42",
          artifactReference: null,
          metadata: { accessToken: "must-not-be-stored" }
        }
      },
      repository,
      () => crypto.randomUUID(),
      () => now
    ),
    /metadata/i
  );
  await assert.rejects(
    recordApplicationRelease(
      {
        ...createReleaseInput(),
        providerRevision: {
          provider: "aws",
          resourceType: "ecs_service",
          revisionId: "task-definition/api:42",
          artifactReference: null,
          metadata: { private__key: "must-not-be-stored" }
        }
      },
      repository,
      () => crypto.randomUUID(),
      () => now
    ),
    /metadata/i
  );
  await assert.rejects(
    recordApplicationRelease(
      {
        ...createReleaseInput(),
        providerRevision: {
          provider: "aws",
          resourceType: "ecs_service",
          revisionId: "task-definition/api:42",
          artifactReference: null
        } as never
      },
      repository,
      () => crypto.randomUUID(),
      () => now
    ),
    /revision evidence/i
  );
});

class InMemoryProjectReleaseLedgerRepository implements ProjectReleaseLedgerRepository {
  projectAccessible = true;
  deploymentAccessible = true;
  pipelineRunAccessible = true;
  connection: { id: string; region: string } | null = {
    id: connectionId,
    region: "ap-northeast-2"
  };
  targets = new Map<string, ProjectDeploymentTargetRecord>();
  releases: ApplicationReleaseRecord[] = [];
  deploymentReleaseId: string | null = null;

  async findAccessibleProject(candidateProjectId: string, candidateUserId: string) {
    return this.projectAccessible && candidateProjectId === projectId && candidateUserId === userId
      ? { id: projectId }
      : undefined;
  }

  async findVerifiedConnection(candidateConnectionId: string, candidateUserId: string) {
    return candidateConnectionId === connectionId && candidateUserId === userId
      ? this.connection ?? undefined
      : undefined;
  }

  async findProjectDeploymentTarget(candidateProjectId: string) {
    return this.targets.get(candidateProjectId);
  }

  async saveProjectDeploymentTarget(input: SaveProjectDeploymentTargetInput) {
    const existing = this.targets.get(input.projectId);
    const record: ProjectDeploymentTargetRecord = {
      ...input,
      createdAt: existing?.createdAt ?? input.updatedAt
    };
    this.targets.set(input.projectId, record);
    return record;
  }

  async findDeploymentInProject(candidateDeploymentId: string, candidateProjectId: string) {
    return this.deploymentAccessible && candidateDeploymentId === deploymentId && candidateProjectId === projectId
      ? { id: deploymentId }
      : undefined;
  }

  async findPipelineRunInProject(candidatePipelineRunId: string, candidateProjectId: string) {
    return this.pipelineRunAccessible && candidatePipelineRunId === pipelineRunId && candidateProjectId === projectId
      ? { id: pipelineRunId }
      : undefined;
  }

  async createApplicationRelease(input: CreateApplicationReleaseRecordInput) {
    const record: ApplicationReleaseRecord = { ...input, artifactDigestAlgorithm: "sha256" };
    this.releases.unshift(record);
    if (input.deploymentId) this.deploymentReleaseId = input.id;
    return record;
  }

  async listProjectApplicationReleases(candidateProjectId: string) {
    return this.releases.filter((item) => item.projectId === candidateProjectId);
  }

  async findProjectApplicationRelease(candidateProjectId: string, releaseId: string) {
    return this.releases.find((item) => item.projectId === candidateProjectId && item.id === releaseId);
  }
}

function createTargetInput(
  targetOverrides: Partial<PutProjectDeploymentTargetRequest> = {}
) {
  return {
    projectId,
    userId,
    target: {
      provider: "aws",
      connectionId,
      region: "ap-northeast-2",
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: createBuildConfig(),
      runtimeConfig: createEcsRuntimeConfig(),
      rolloutStrategy: "all_at_once",
      ...targetOverrides
    } satisfies PutProjectDeploymentTargetRequest
  };
}

function createEcsRuntimeConfig(overrides: Record<string, unknown> = {}) {
  return {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: "api-build",
    ecrRepositoryName: "api",
    clusterName: "api-cluster",
    serviceName: "api-service",
    containerName: "api",
    outputUrl: "https://api.example.com",
    ...overrides
  } as PutProjectDeploymentTargetRequest["runtimeConfig"];
}

function createBuildConfig(overrides: Record<string, unknown> = {}) {
  return {
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
    manifestVersion: "1.0.0",
    confirmedCommitSha: commitSha,
    confirmedAt: now.toISOString(),
    ...overrides
  } as PutProjectDeploymentTargetRequest["confirmedBuildConfig"];
}

function createReleaseInput() {
  return {
    projectId,
    userId,
    deploymentId,
    pipelineRunId: null,
    source: "direct" as const,
    runtimeTargetKind: "ecs_fargate" as const,
    versionEvidence: { commitSha },
    artifactDigest: "e".repeat(64),
    providerRevision: null,
    outputUrl: null,
    status: "pending" as const,
    healthEvidence: null,
    rollbackEvidence: null,
    startedAt: null,
    completedAt: null
  };
}
