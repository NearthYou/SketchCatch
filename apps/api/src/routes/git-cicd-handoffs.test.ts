import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { ZodError } from "zod";
import type {
  DeploymentPlanSummary,
  GitCicdHandoffListResponse,
  GitCicdHandoffResponse,
  GitCicdHandoffStatus,
  GitCicdMonitoringConfigResponse,
  GitCicdPipelineLogListResponse,
  GitCicdPipelineRunListResponse,
  GitCicdPipelineRunResponse
} from "@sketchcatch/types";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import { users } from "../db/schema.js";
import { createInMemoryRuntimeCache, type RuntimeCache } from "../runtime-cache/index.js";
import {
  createGitHubGitCicdHandoffProvider,
  type CreateGitCicdHandoffRecordInput,
  type GitProviderCreatePullRequestInput,
  type GitCicdHandoffArchitectureRecord,
  type GitCicdHandoffApprovedDeploymentRecord,
  type GitCicdHandoffApprovedPlanArtifactRecord,
  type GitCicdHandoffProvider,
  type GitCicdHandoffRecord,
  type GitCicdHandoffRepository,
  type GitCicdHandoffSourceRepositoryRecord,
  type GitCicdHandoffTerraformArtifactRecord,
  type GitCicdProviderCreateInput,
  type ProjectAccessContext,
  type GitCicdHandoffProjectRecord,
  type UpdateGitCicdHandoffStatusRecordInput
} from "../git-cicd/git-cicd-handoff-service.js";
import type { AwsRoleDiffGateway } from "../git-cicd/aws-role-diff-apply-service.js";
import type {
  GitCicdMonitoringConfigRecord,
  GitCicdMonitoringProvider,
  GitCicdMonitoringRepository
} from "../git-cicd/git-cicd-monitoring-service.js";
import type {
  GitCicdPipelinePersistenceRepository,
  PersistedPipelineLog,
  PersistedPipelineRun,
  PipelineRefreshTarget,
  PipelineRunWithStages
} from "../git-cicd/git-cicd-pipeline-run-service.js";
import type {
  GitCicdRunProvider,
  GitCicdRunProviderSnapshot
} from "../git-cicd/github-actions-run-provider.js";
import {
  GitCicdRepositorySettingsPermissionError,
  type GitCicdRepositorySettingsApplier
} from "../git-cicd/git-cicd-repository-settings-service.js";
import { registerGitCicdHandoffRoutes } from "./git-cicd-handoffs.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";
process.env.GIT_OAUTH_CLIENT_ID = "github-oauth-client-id";
process.env.GIT_OAUTH_CLIENT_SECRET = "github-oauth-client-secret";
process.env.OAUTH_REDIRECT_BASE_URL = "http://localhost:3000";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "66666666-6666-4666-8666-666666666666";
const handoffId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const sourceRepositoryId = "repo-1";
const pipelineRunId = "77777777-7777-4777-8777-777777777777";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

type UserRecord = typeof users.$inferSelect;

test("GET Pipeline Runs defaults to 20, caps at 50, and paginates newest first", async () => {
  const pipelineRepository = new FakePipelineRepository(
    Array.from({ length: 55 }, (_, index) => createPipelineRun(index))
  );
  pipelineRepository.runs.reverse();
  const app = await buildGitCicdHandoffTestApp(new FakeGitCicdHandoffRepository(), {
    pipelineRepository
  });
  const headers = await authHeaders();

  const first = await app.inject({
    headers,
    method: "GET",
    url: `/api/projects/${projectId}/git-cicd-pipeline-runs`
  });
  assert.equal(first.statusCode, 200);
  const firstBody = first.json() as GitCicdPipelineRunListResponse;
  assert.equal(firstBody.runs.length, 20);
  assert.equal(firstBody.runs[0]?.commitMessage, "Commit 54");
  assert.equal(firstBody.runs[19]?.commitMessage, "Commit 35");
  assert.equal(firstBody.nextCursor, firstBody.runs[19]?.id);

  const second = await app.inject({
    headers,
    method: "GET",
    url: `/api/projects/${projectId}/git-cicd-pipeline-runs?cursor=${firstBody.nextCursor}`
  });
  assert.equal(second.statusCode, 200);
  const secondBody = second.json() as GitCicdPipelineRunListResponse;
  assert.equal(secondBody.runs[0]?.commitMessage, "Commit 34");

  const maximum = await app.inject({
    headers,
    method: "GET",
    url: `/api/projects/${projectId}/git-cicd-pipeline-runs?limit=50`
  });
  assert.equal(maximum.statusCode, 200);
  assert.equal((maximum.json() as GitCicdPipelineRunListResponse).runs.length, 50);

  for (const url of [
    `/api/projects/${projectId}/git-cicd-pipeline-runs?limit=51`,
    `/api/projects/${projectId}/git-cicd-pipeline-runs?limit=20&unexpected=true`
  ]) {
    assert.equal((await app.inject({ headers, method: "GET", url })).statusCode, 400);
  }
  await app.close();
});

test("Pipeline Run detail and incremental logs return typed ISO responses", async () => {
  const pipelineRepository = new FakePipelineRepository([createPipelineRun(0)]);
  pipelineRepository.logs = [1, 2, 3].map((sequence) => createPipelineLog(sequence));
  pipelineRepository.refreshEnabled = false;
  const app = await buildGitCicdHandoffTestApp(new FakeGitCicdHandoffRepository(), {
    pipelineRepository
  });
  const headers = await authHeaders();

  const detail = await app.inject({
    headers,
    method: "GET",
    url: `/api/git-cicd-pipeline-runs/${pipelineRunId}`
  });
  assert.equal(detail.statusCode, 200);
  const detailBody = detail.json() as GitCicdPipelineRunResponse;
  assert.equal(detailBody.run.id, pipelineRunId);
  assert.equal(detailBody.run.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(detailBody.run.stages[0]?.startedAt, "2026-01-01T00:00:00.000Z");

  const logs = await app.inject({
    headers,
    method: "GET",
    url: `/api/git-cicd-pipeline-runs/${pipelineRunId}/logs?sinceSequence=1`
  });
  assert.equal(logs.statusCode, 200);
  const logsBody = logs.json() as GitCicdPipelineLogListResponse;
  assert.deepEqual(logsBody.logs.map((log) => log.sequence), [2, 3]);
  assert.equal(logsBody.nextSequence, 3);
  assert.equal(logsBody.logs[0]?.createdAt, "2026-01-01T00:00:00.000Z");

  const blockedRefresh = await app.inject({
    headers,
    method: "POST",
    url: `/api/git-cicd-pipeline-runs/${pipelineRunId}/refresh`
  });
  assert.equal(blockedRefresh.statusCode, 404);

  assert.equal(
    (
      await app.inject({
        headers,
        method: "GET",
        url: `/api/git-cicd-pipeline-runs/${pipelineRunId}/logs?sinceSequence=0&extra=1`
      })
    ).statusCode,
    400
  );
  await app.close();
});

test("Pipeline Run routes hide inaccessible projects and runs behind stable 404 responses", async () => {
  const pipelineRepository = new FakePipelineRepository([createPipelineRun(0)]);
  const handoffRepository = new FakeGitCicdHandoffRepository();
  const otherUser = createUserRecord({ id: "88888888-8888-4888-8888-888888888888" });
  const app = await buildGitCicdHandoffTestApp(handoffRepository, {
    pipelineRepository,
    userRows: [otherUser]
  });
  const headers = await authHeaders(otherUser.id);

  for (const request of [
    { method: "GET" as const, url: `/api/projects/${projectId}/git-cicd-pipeline-runs` },
    { method: "GET" as const, url: `/api/git-cicd-pipeline-runs/${pipelineRunId}` },
    { method: "GET" as const, url: `/api/git-cicd-pipeline-runs/${pipelineRunId}/logs` },
    { method: "POST" as const, url: `/api/git-cicd-pipeline-runs/${pipelineRunId}/refresh` }
  ]) {
    const response = await app.inject({ ...request, headers });
    assert.equal(response.statusCode, 404, `${request.method} ${request.url}`);
    assert.deepEqual(response.json(), {
      error: "not_found",
      message: "Pipeline Run not found"
    });
  }
  await app.close();
});

test("POST Pipeline Run refresh performs read-only provider sync and returns persisted detail", async () => {
  const pipelineRepository = new FakePipelineRepository([createPipelineRun(0)]);
  const providerCalls: string[] = [];
  const pipelineProvider = createPipelineProvider(providerCalls);
  const app = await buildGitCicdHandoffTestApp(new FakeGitCicdHandoffRepository(), {
    pipelineProvider,
    pipelineRepository
  });

  const response = await app.inject({
    headers: await authHeaders(),
    method: "POST",
    url: `/api/git-cicd-pipeline-runs/${pipelineRunId}/refresh`
  });

  assert.equal(response.statusCode, 200);
  assert.equal((response.json() as GitCicdPipelineRunResponse).run.status, "succeeded");
  assert.deepEqual(providerCalls, ["listSnapshots", "listCommitFiles"]);
  assert.equal(pipelineRepository.persistCount, 1);
  await app.close();
});

type RepositoryCall =
  | {
      name: "findAccessibleProject";
      projectId: string;
      accessContext: ProjectAccessContext;
    }
  | {
      name: "findArchitectureInProject";
      architectureId: string;
      projectId: string;
    }
  | {
      name: "findTerraformArtifactForArchitecture";
      terraformArtifactId: string;
      projectId: string;
      architectureId: string;
    }
  | {
      name: "findActiveSourceRepository";
      sourceRepositoryId: string;
      projectId: string;
    }
  | {
      name: "findApprovedDeploymentForHandoff";
      deploymentId: string;
      projectId: string;
    }
  | {
      name: "findApprovedPlanArtifactForHandoff";
      planArtifactId: string;
      deploymentId: string;
    }
  | {
      name: "findSourceRepositoryById";
      sourceRepositoryId: string;
      projectId: string;
    }
  | {
      name: "createHandoff";
      input: CreateGitCicdHandoffRecordInput;
    }
  | {
      name: "findHandoffById";
      handoffId: string;
    }
  | {
      name: "listHandoffsByProject";
      projectId: string;
    }
  | {
      name: "updateHandoffStatus";
      handoffId: string;
      input: UpdateGitCicdHandoffStatusRecordInput;
    }
  | {
      name: "updateHandoffAutomationMetadata";
      handoffId: string;
      input: {
        repositorySettingsPreview?: GitCicdHandoffRecord["repositorySettingsPreview"];
        awsRoleDiff?: GitCicdHandoffRecord["awsRoleDiff"];
        githubOAuthRequired?: boolean;
      };
    };

class FakeGitCicdHandoffRepository implements GitCicdHandoffRepository {
  readonly calls: RepositoryCall[] = [];
  project: GitCicdHandoffProjectRecord | undefined = createProjectRecord();
  architecture: GitCicdHandoffArchitectureRecord | undefined = createArchitectureRecord();
  terraformArtifact: GitCicdHandoffTerraformArtifactRecord | undefined =
    createTerraformArtifactRecord();
  sourceRepository: GitCicdHandoffSourceRepositoryRecord | undefined =
    createSourceRepositoryRecord();
  approvedDeployment: GitCicdHandoffApprovedDeploymentRecord | undefined =
    createApprovedDeploymentRecord();
  approvedPlanArtifact: GitCicdHandoffApprovedPlanArtifactRecord | undefined =
    createApprovedPlanArtifactRecord();
  handoff: GitCicdHandoffRecord | undefined = createHandoffRecord();
  handoffs: GitCicdHandoffRecord[] = [createHandoffRecord()];
  monitoringConfig: GitCicdMonitoringConfigRecord | undefined = {
    sourceRepositoryId,
    enabled: true,
    monitorBranch: "main",
    appPath: { mode: "subdirectory", path: "apps/web" },
    infraPath: { mode: "subdirectory", path: "infra" },
    validationStatus: "valid",
    validationMessage: null,
    validatedAt: fixedNow,
    updatedAt: fixedNow
  };

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "findAccessibleProject",
      projectId: candidateProjectId,
      accessContext
    });

    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      this.project.userId !== accessContext.userId
    ) {
      return undefined;
    }

    return this.project;
  }

  async findArchitectureInProject(candidateArchitectureId: string, candidateProjectId: string) {
    this.calls.push({
      name: "findArchitectureInProject",
      architectureId: candidateArchitectureId,
      projectId: candidateProjectId
    });

    if (
      !this.architecture ||
      this.architecture.id !== candidateArchitectureId ||
      this.architecture.projectId !== candidateProjectId
    ) {
      return undefined;
    }

    return this.architecture;
  }

  async findTerraformArtifactForArchitecture(
    candidateTerraformArtifactId: string,
    candidateProjectId: string,
    candidateArchitectureId: string
  ) {
    this.calls.push({
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId: candidateTerraformArtifactId,
      projectId: candidateProjectId,
      architectureId: candidateArchitectureId
    });

    if (
      !this.terraformArtifact ||
      this.terraformArtifact.id !== candidateTerraformArtifactId ||
      this.terraformArtifact.projectId !== candidateProjectId ||
      this.terraformArtifact.architectureId !== candidateArchitectureId
    ) {
      return undefined;
    }

    return this.terraformArtifact;
  }

  async findActiveSourceRepository(
    candidateSourceRepositoryId: string,
    candidateProjectId: string
  ) {
    this.calls.push({
      name: "findActiveSourceRepository",
      sourceRepositoryId: candidateSourceRepositoryId,
      projectId: candidateProjectId
    });

    if (
      !this.sourceRepository ||
      this.sourceRepository.id !== candidateSourceRepositoryId ||
      this.sourceRepository.projectId !== candidateProjectId ||
      this.sourceRepository.status !== "active"
    ) {
      return undefined;
    }

    return this.sourceRepository;
  }

  async findMonitoringConfig(candidateSourceRepositoryId: string) {
    return candidateSourceRepositoryId === sourceRepositoryId
      ? this.monitoringConfig
      : undefined;
  }

  // 테스트 요청도 실제 서버와 같은 승인 Deployment 조회 경계를 통과시킵니다.
  async findApprovedDeploymentForHandoff(
    candidateDeploymentId: string,
    candidateProjectId: string
  ) {
    this.calls.push({
      name: "findApprovedDeploymentForHandoff",
      deploymentId: candidateDeploymentId,
      projectId: candidateProjectId
    });

    if (
      !this.approvedDeployment ||
      this.approvedDeployment.id !== candidateDeploymentId ||
      this.approvedDeployment.projectId !== candidateProjectId
    ) {
      return undefined;
    }

    return this.approvedDeployment;
  }

  async findApprovedPlanArtifactForHandoff(
    candidatePlanArtifactId: string,
    candidateDeploymentId: string
  ) {
    this.calls.push({
      name: "findApprovedPlanArtifactForHandoff",
      planArtifactId: candidatePlanArtifactId,
      deploymentId: candidateDeploymentId
    });

    if (
      !this.approvedPlanArtifact ||
      this.approvedPlanArtifact.id !== candidatePlanArtifactId ||
      this.approvedPlanArtifact.deploymentId !== candidateDeploymentId
    ) {
      return undefined;
    }

    return this.approvedPlanArtifact;
  }

  async findSourceRepositoryById(
    candidateSourceRepositoryId: string,
    candidateProjectId: string
  ) {
    this.calls.push({
      name: "findSourceRepositoryById",
      sourceRepositoryId: candidateSourceRepositoryId,
      projectId: candidateProjectId
    });

    if (
      !this.sourceRepository ||
      this.sourceRepository.id !== candidateSourceRepositoryId ||
      this.sourceRepository.projectId !== candidateProjectId
    ) {
      return undefined;
    }

    return this.sourceRepository;
  }

  async createHandoff(input: CreateGitCicdHandoffRecordInput) {
    this.calls.push({
      name: "createHandoff",
      input
    });

    this.handoff = createHandoffRecord(input.id, input);
    this.handoffs = [this.handoff];

    return this.handoff;
  }

  async findHandoffById(candidateHandoffId: string) {
    this.calls.push({
      name: "findHandoffById",
      handoffId: candidateHandoffId
    });

    return this.handoff?.id === candidateHandoffId ? this.handoff : undefined;
  }

  async listHandoffsByProject(candidateProjectId: string) {
    this.calls.push({
      name: "listHandoffsByProject",
      projectId: candidateProjectId
    });

    return this.handoffs.filter((handoff) => handoff.projectId === candidateProjectId);
  }

  async updateHandoffStatus(
    candidateHandoffId: string,
    input: UpdateGitCicdHandoffStatusRecordInput
  ) {
    this.calls.push({
      name: "updateHandoffStatus",
      handoffId: candidateHandoffId,
      input
    });

    if (!this.handoff || this.handoff.id !== candidateHandoffId) {
      return undefined;
    }

    this.handoff = {
      ...this.handoff,
      status: input.status,
      pullRequestUrl:
        input.pullRequestUrl === undefined ? this.handoff.pullRequestUrl : input.pullRequestUrl,
      pipelineRunUrl:
        input.pipelineRunUrl === undefined ? this.handoff.pipelineRunUrl : input.pipelineRunUrl,
      pullRequestNumber:
        input.pullRequestNumber === undefined
          ? this.handoff.pullRequestNumber
          : input.pullRequestNumber,
      pullRequestHeadSha:
        input.pullRequestHeadSha === undefined
          ? this.handoff.pullRequestHeadSha
          : input.pullRequestHeadSha,
      mergeCommitSha:
        input.mergeCommitSha === undefined ? this.handoff.mergeCommitSha : input.mergeCommitSha,
      infraPipelineRunUrl:
        input.infraPipelineRunUrl === undefined
          ? this.handoff.infraPipelineRunUrl
          : input.infraPipelineRunUrl,
      infraPipelineStatus:
        input.infraPipelineStatus === undefined
          ? this.handoff.infraPipelineStatus
          : input.infraPipelineStatus,
      appPipelineRunUrl:
        input.appPipelineRunUrl === undefined
          ? this.handoff.appPipelineRunUrl
          : input.appPipelineRunUrl,
      appPipelineStatus:
        input.appPipelineStatus === undefined
          ? this.handoff.appPipelineStatus
          : input.appPipelineStatus,
      destroyPipelineRunUrl:
        input.destroyPipelineRunUrl === undefined
          ? this.handoff.destroyPipelineRunUrl
          : input.destroyPipelineRunUrl,
      destroyPipelineStatus:
        input.destroyPipelineStatus === undefined
          ? this.handoff.destroyPipelineStatus
          : input.destroyPipelineStatus,
      statusMessage:
        input.statusMessage === undefined ? this.handoff.statusMessage : input.statusMessage,
      updatedAt: fixedNow
    };

    return this.handoff;
  }

  async updateHandoffAutomationMetadata(
    candidateHandoffId: string,
    input: {
      repositorySettingsPreview?: GitCicdHandoffRecord["repositorySettingsPreview"];
      awsRoleDiff?: GitCicdHandoffRecord["awsRoleDiff"];
      githubOAuthRequired?: boolean;
    }
  ) {
    this.calls.push({
      name: "updateHandoffAutomationMetadata",
      handoffId: candidateHandoffId,
      input
    });

    if (!this.handoff || this.handoff.id !== candidateHandoffId) {
      return undefined;
    }

    this.handoff = {
      ...this.handoff,
      repositorySettingsPreview:
        input.repositorySettingsPreview === undefined
          ? this.handoff.repositorySettingsPreview
          : input.repositorySettingsPreview,
      awsRoleDiff:
        input.awsRoleDiff === undefined ? this.handoff.awsRoleDiff : input.awsRoleDiff,
      githubOAuthRequired:
        input.githubOAuthRequired === undefined
          ? this.handoff.githubOAuthRequired
          : input.githubOAuthRequired,
      updatedAt: fixedNow
    };

    return this.handoff;
  }
}

test("POST /api/projects/:projectId/git-cicd-handoffs creates an internal metadata handoff", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  const provider = createProviderSpy(providerCalls);
  const app = await buildGitCicdHandoffTestApp(repository, { provider });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 201);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.projectId, projectId);
  assert.equal(body.handoff.architectureId, architectureId);
  assert.equal(body.handoff.terraformArtifactId, terraformArtifactId);
  assert.equal(body.handoff.sourceRepositoryId, sourceRepositoryId);
  assert.equal(body.handoff.repositoryProvider, "internal");
  assert.equal(body.handoff.status, "draft");
  assert.equal(body.handoff.pullRequestUrl, null);
  assert.equal(body.handoff.pipelineRunUrl, null);
  assert.equal(body.handoff.createdByUserId, userId);
  assert.equal(providerCalls.length, 1);
  const providerCall = providerCalls[0];
  assert.equal(providerCall?.projectId, projectId);
  assert.equal(providerCall?.terraformArtifact.fileName, "main.tf");
  assert.equal(providerCall?.terraformArtifact.objectKey, "projects/project-id/terraform/main.tf");
  assert.deepEqual(providerCall?.sourceRepository, {
    id: sourceRepositoryId,
    provider: "internal",
    owner: "sketchcatch",
    name: "infra-live",
    defaultBranch: "main",
    githubInstallationId: null,
    githubRepositoryId: null
  });
  assert.equal(providerCall?.sourceBranch, "sketchcatch/iac-preview");
  assert.equal(providerCall?.commitMessage, "Add SketchCatch Terraform preview");
  assert.equal(providerCall?.pullRequestTitle, "SketchCatch IaC preview");
  assert.equal(providerCall?.pullRequestDraft.title, "SketchCatch IaC preview");
  assert.match(providerCall?.pullRequestDraft.body ?? "", /## IaC Preview/);
  assert.match(providerCall?.pullRequestDraft.body ?? "", /## Review checklist/);
  assert.equal(providerCall?.pullRequestDraft.reviewChecklist.length, 4);
  assert.equal(providerCall?.userAcceptedChangeId, "accepted-change-1");
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs creates GitHub PR handoff through fake provider", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456",
    githubRepositoryId: "987654"
  });
  const gitProviderCalls: GitProviderCreatePullRequestInput[] = [];
  const provider = createGitHubGitCicdHandoffProvider({
    async createPullRequest(input) {
      gitProviderCalls.push(input);

      return {
        pullRequestUrl: "https://github.com/sketchcatch/infra-live/pull/42",
        sourceBranch: input.sourceBranch,
        commitSha: "abc1234",
        pullRequestHeadSha: "abc1234",
        pullRequestNumber: 42
      };
    }
  });
  const app = await buildGitCicdHandoffTestApp(repository, { provider });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: {
      ...createHandoffBody(),
      sourceBranch: undefined
    }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.repositoryProvider, "github");
  assert.equal(body.handoff.status, "pr_created");
  assert.equal(body.handoff.pullRequestUrl, "https://github.com/sketchcatch/infra-live/pull/42");
  assert.equal(body.handoff.pullRequestHeadSha, "abc1234");
  assert.match(body.handoff.sourceBranch ?? "", /^sketchcatch\/test-project\/iac-[a-f0-9]{8}$/);
  assert.match(body.handoff.statusMessage ?? "", /GitHub PR created/);
  assert.equal(gitProviderCalls.length, 1);
  assert.deepEqual(gitProviderCalls[0]?.repository, {
    provider: "github",
    installationId: "123456",
    owner: "sketchcatch",
    name: "infra-live"
  });
  assert.equal(gitProviderCalls[0]?.targetBranch, "main");
  assert.equal(gitProviderCalls[0]?.files[0]?.path, "sketchcatch/test-project/terraform/main.tf");
  assert.equal(
    gitProviderCalls[0]?.files[0]?.expectedSha256,
    "a".repeat(64)
  );
  assert.match(gitProviderCalls[0]?.pullRequest.body ?? "", /Create 2, update 1, delete 0, replace 0/);
  assert.match(gitProviderCalls[0]?.pullRequest.body ?? "", /Pre-Deployment Check/);
  assert.equal(gitProviderCalls[0]?.pullRequest.reviewChecklist.length, 4);
  assert.equal(
    gitProviderCalls[0]?.pullRequest.planSummary?.warnings[0]?.relatedResourceId,
    "aws_instance.web"
  );
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs rejects provider mismatch", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456",
    githubRepositoryId: "987654"
  });
  const providerCalls: GitCicdProviderCreateInput[] = [];
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Git/CI/CD handoff provider mismatch: requested github, received internal"
  });
  assert.equal(repository.calls.some((call) => call.name === "createHandoff"), false);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs maps GitHub permission failures before saving handoff", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456",
    githubRepositoryId: "987654"
  });
  const provider = createGitHubGitCicdHandoffProvider({
    async createPullRequest() {
      const error = new Error("Resource not accessible by integration") as Error & {
        statusCode?: number;
      };

      error.statusCode = 403;
      throw error;
    }
  });
  const app = await buildGitCicdHandoffTestApp(repository, { provider });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "github_oauth_required",
    message:
      "GitHub App repository permissions must allow Contents, Pull requests, and Workflows write access before Git/CI/CD handoff can be created"
  });
  assert.equal(repository.calls.some((call) => call.name === "createHandoff"), false);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs maps GitHub file conflicts before saving handoff", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456",
    githubRepositoryId: "987654"
  });
  const provider = createGitHubGitCicdHandoffProvider({
    async createPullRequest() {
      const error = new Error("No Git/CI/CD handoff file changes were needed") as Error & {
        statusCode?: number;
      };

      error.statusCode = 409;
      throw error;
    }
  });
  const app = await buildGitCicdHandoffTestApp(repository, { provider });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "GitHub PR could not be created because the handoff files did not change"
  });
  assert.equal(repository.calls.some((call) => call.name === "createHandoff"), false);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs rejects secret-looking request fields", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: {
      ...createHandoffBody(),
      accessToken: "should-not-be-accepted"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(providerCalls.length, 0);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs maps inaccessible projects to not_found", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  repository.project = undefined;
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Project not found"
  });
  assert.equal(providerCalls.length, 0);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs requires matching Terraform artifact", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  repository.terraformArtifact = undefined;
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Terraform artifact not found for project architecture"
  });
  assert.equal(providerCalls.length, 0);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs rejects unapproved deployment plan ids", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  repository.approvedDeployment = createApprovedDeploymentRecord({
    approvedPlanArtifactId: "different-approved-plan"
  });
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Git/CI/CD handoff requires the current user's approved deployment plan"
  });
  assert.equal(providerCalls.length, 0);
  assert.equal(repository.calls.some((call) => call.name === "createHandoff"), false);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs rejects approved destroy plans", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  repository.approvedPlanArtifact = createApprovedPlanArtifactRecord({ operation: "destroy" });
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 409);
  assert.equal(providerCalls.length, 0);
  assert.equal(repository.calls.some((call) => call.name === "createHandoff"), false);

  await app.close();
});

test("GET /api/projects/:projectId/git-cicd-handoffs lists project handoffs", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdHandoffListResponse;
  assert.equal(body.handoffs.length, 1);
  assert.equal(body.handoffs[0]?.id, handoffId);
  assertResponseHasNoSecretFields(body.handoffs[0]);
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "listHandoffsByProject",
      projectId
    }
  ]);

  await app.close();
});

test("GET /api/git-cicd-handoffs/:handoffId returns one accessible handoff", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.id, handoffId);
  assert.equal(body.handoff.createdAt, fixedNow.toISOString());
  assert.equal(body.handoff.updatedAt, fixedNow.toISOString());
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("GET /api/git-cicd-handoffs/:handoffId/pipeline-status uses Runtime Cache after RDS miss", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pipeline_running",
    pipelineRunUrl: "https://example.invalid/sketchcatch/infra-live/actions/runs/1",
    statusMessage: "Pipeline is running"
  });
  const runtimeCache = createInMemoryRuntimeCache();
  const app = await buildGitCicdHandoffTestApp(repository, { runtimeCache });

  const firstResponse = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}/pipeline-status`,
    headers: await authHeaders()
  });
  const secondResponse = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}/pipeline-status`,
    headers: await authHeaders()
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  const firstBody = firstResponse.json() as { pipelineStatus: { source: string } };
  const secondBody = secondResponse.json() as { pipelineStatus: { source: string } };
  assert.equal(firstBody.pipelineStatus.source, "rds");
  assert.equal(secondBody.pipelineStatus.source, "runtime_cache");
  assert.equal(
    repository.calls.filter((call) => call.name === "findHandoffById").length,
    1
  );

  await app.close();
});

test("GET /api/git-cicd-handoffs/:handoffId hides handoffs from other users", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.project = createProjectRecord({
    userId: "99999999-9999-4999-8999-999999999999"
  });
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Git/CI/CD handoff not found"
  });

  await app.close();
});

test("PATCH /api/git-cicd-handoffs/:handoffId/status updates status metadata", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pr_created"
  });
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "PATCH",
    url: `/api/git-cicd-handoffs/${handoffId}/status`,
    headers: await authHeaders(),
    payload: {
      status: "pipeline_running" satisfies GitCicdHandoffStatus,
      pullRequestUrl: "https://example.invalid/sketchcatch/infra-live/pull/1",
      pipelineRunUrl: "https://example.invalid/sketchcatch/infra-live/actions/runs/1",
      statusMessage: "Pipeline started by internal provider worker"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.status, "pipeline_running");
  assert.equal(
    body.handoff.pullRequestUrl,
    "https://example.invalid/sketchcatch/infra-live/pull/1"
  );
  assert.equal(
    body.handoff.pipelineRunUrl,
    "https://example.invalid/sketchcatch/infra-live/actions/runs/1"
  );
  assert.equal(body.handoff.statusMessage, "Pipeline started by internal provider worker");
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("PATCH /api/git-cicd-handoffs/:handoffId/status refreshes cached pipeline status", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pr_created"
  });
  const runtimeCache = createInMemoryRuntimeCache();
  const app = await buildGitCicdHandoffTestApp(repository, { runtimeCache });

  const patchResponse = await app.inject({
    method: "PATCH",
    url: `/api/git-cicd-handoffs/${handoffId}/status`,
    headers: await authHeaders(),
    payload: {
      status: "pipeline_running" satisfies GitCicdHandoffStatus,
      pipelineRunUrl: "https://example.invalid/sketchcatch/infra-live/actions/runs/2",
      statusMessage: "Pipeline started"
    }
  });
  const statusResponse = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}/pipeline-status`,
    headers: await authHeaders()
  });

  assert.equal(patchResponse.statusCode, 200);
  assert.equal(statusResponse.statusCode, 200);
  const body = statusResponse.json() as {
    pipelineStatus: {
      pipelineRunUrl: string | null;
      source: string;
      status: GitCicdHandoffStatus;
      statusMessage: string | null;
    };
  };
  assert.equal(body.pipelineStatus.source, "runtime_cache");
  assert.equal(body.pipelineStatus.status, "pipeline_running");
  assert.equal(
    body.pipelineStatus.pipelineRunUrl,
    "https://example.invalid/sketchcatch/infra-live/actions/runs/2"
  );
  assert.equal(body.pipelineStatus.statusMessage, "Pipeline started");

  await app.close();
});

test("PATCH /api/git-cicd-handoffs/:handoffId/status rejects invalid status transitions", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pipeline_success"
  });
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "PATCH",
    url: `/api/git-cicd-handoffs/${handoffId}/status`,
    headers: await authHeaders(),
    payload: {
      status: "pipeline_running" satisfies GitCicdHandoffStatus
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message:
      "Invalid Git/CI/CD handoff status transition from pipeline_success to pipeline_running"
  });
  assert.equal(
    repository.calls.some((call) => call.name === "updateHandoffStatus"),
    false
  );

  await app.close();
});

test("POST /api/git-cicd-handoffs/:handoffId/repository-settings/apply applies GitHub variables", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456"
  });
  repository.handoff = createHandoffRecord(handoffId, {
    repositoryProvider: "github",
    githubOAuthRequired: true,
    repositorySettingsPreview: {
      environmentName: "sketchcatch-production",
      variables: {
        SKETCHCATCH_AWS_REGION: "ap-northeast-2",
        SKETCHCATCH_RELEASE_BUCKET: "release-bucket"
      },
      secrets: [],
      workflowFiles: [".github/workflows/sketchcatch-app.yml"]
    }
  });
  const app = await buildGitCicdHandoffTestApp(repository, {
    repositorySettingsApplier: {
      async applyRepositorySettings({ handoff }) {
        assert.equal(handoff.id, handoffId);

        return {
          applied: true,
          environmentName: "sketchcatch-production",
          variables: ["SKETCHCATCH_AWS_REGION", "SKETCHCATCH_RELEASE_BUCKET"],
          secrets: [],
          workflowFiles: [".github/workflows/sketchcatch-app.yml"],
          githubOAuthRequired: false
        };
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/repository-settings/apply`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    applied: true,
    environmentName: "sketchcatch-production",
    variables: ["SKETCHCATCH_AWS_REGION", "SKETCHCATCH_RELEASE_BUCKET"],
    secrets: [],
    workflowFiles: [".github/workflows/sketchcatch-app.yml"],
    githubOAuthRequired: false
  });
  assert.equal(repository.handoff?.githubOAuthRequired, false);

  await app.close();
});

test("POST /api/git-cicd-handoffs/:handoffId/repository-settings/apply maps permission gaps", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456"
  });
  repository.handoff = createHandoffRecord(handoffId, {
    repositoryProvider: "github",
    githubOAuthRequired: true,
    repositorySettingsPreview: {
      environmentName: "sketchcatch-production",
      variables: {
        SKETCHCATCH_AWS_REGION: "ap-northeast-2"
      },
      secrets: [],
      workflowFiles: []
    }
  });
  const app = await buildGitCicdHandoffTestApp(repository, {
    repositorySettingsApplier: {
      async applyRepositorySettings() {
        throw new GitCicdRepositorySettingsPermissionError("GitHub permissions are missing");
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/repository-settings/apply`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "github_oauth_required",
    message: "GitHub permissions are missing"
  });

  await app.close();
});

test("GitHub OAuth repository settings grant starts, stores token, and applies once", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456"
  });
  repository.handoff = createHandoffRecord(handoffId, {
    repositoryProvider: "github",
    githubOAuthRequired: true,
    repositorySettingsPreview: {
      environmentName: "sketchcatch-production",
      variables: {
        SKETCHCATCH_AWS_REGION: "ap-northeast-2"
      },
      secrets: [],
      workflowFiles: [".github/workflows/sketchcatch-infra.yml"]
    }
  });
  const runtimeCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  const exchangedBodies: URLSearchParams[] = [];
  const usedTokens: string[] = [];
  const app = await buildGitCicdHandoffTestApp(repository, {
    runtimeCache,
    githubOAuthFetch: (async (_input, init) => {
      exchangedBodies.push(new URLSearchParams(String(init?.body ?? "")));

      return new Response(JSON.stringify({ access_token: "repo-settings-oauth-token" }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    }) as typeof fetch,
    createGitHubOAuthRepositorySettingsApplier: (accessToken) => {
      usedTokens.push(accessToken);

      return {
        async applyRepositorySettings() {
          return {
            applied: true,
            environmentName: "sketchcatch-production",
            variables: ["SKETCHCATCH_AWS_REGION"],
            secrets: [],
            workflowFiles: [".github/workflows/sketchcatch-infra.yml"],
            githubOAuthRequired: false
          };
        }
      };
    }
  });

  const startResponse = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/github-oauth/start`,
    headers: await authHeaders()
  });

  assert.equal(startResponse.statusCode, 201);
  const authorizationUrl = new URL(startResponse.json().authorizationUrl);

  assert.equal(authorizationUrl.origin, "https://github.com");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "github-oauth-client-id");
  assert.equal(
    authorizationUrl.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/git-cicd-handoffs/github-oauth/callback"
  );
  assert.equal(authorizationUrl.searchParams.get("scope"), "repo workflow");

  const callbackResponse = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/github-oauth/callback?code=oauth-code&state=${encodeURIComponent(
      authorizationUrl.searchParams.get("state") ?? ""
    )}`
  });

  assert.equal(callbackResponse.statusCode, 302);
  assert.equal(callbackResponse.headers.location, "/workspace?gitCicdGitHubOAuth=ready");
  assert.equal(exchangedBodies[0]?.get("redirect_uri"), "http://localhost:3000/api/git-cicd-handoffs/github-oauth/callback");

  const applyResponse = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/repository-settings/apply-with-github-oauth`,
    headers: await authHeaders()
  });

  assert.equal(applyResponse.statusCode, 200);
  assert.equal(usedTokens[0], "repo-settings-oauth-token");
  assert.equal(repository.handoff?.githubOAuthRequired, false);

  const secondApplyResponse = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/repository-settings/apply-with-github-oauth`,
    headers: await authHeaders()
  });

  assert.equal(secondApplyResponse.statusCode, 409);
  assert.deepEqual(secondApplyResponse.json(), {
    error: "github_oauth_required",
    message: "GitHub OAuth approval is required before repository settings can be applied"
  });

  await app.close();
});

test("GitHub OAuth callback consumes state before token exchange", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.sourceRepository = createSourceRepositoryRecord({
    provider: "github",
    githubInstallationId: "123456"
  });
  repository.handoff = createHandoffRecord(handoffId, {
    repositoryProvider: "github",
    githubOAuthRequired: true,
    repositorySettingsPreview: {
      environmentName: "sketchcatch-production",
      variables: {
        SKETCHCATCH_AWS_REGION: "ap-northeast-2"
      },
      secrets: [],
      workflowFiles: []
    }
  });
  const runtimeCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  let tokenExchangeCalls = 0;
  const app = await buildGitCicdHandoffTestApp(repository, {
    runtimeCache,
    githubOAuthFetch: (async () => {
      tokenExchangeCalls += 1;

      return new Response(JSON.stringify({ error: "temporarily_unavailable" }), {
        headers: { "content-type": "application/json" },
        status: 500
      });
    }) as typeof fetch
  });

  const startResponse = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/github-oauth/start`,
    headers: await authHeaders()
  });
  const state = new URL(startResponse.json().authorizationUrl).searchParams.get("state") ?? "";

  const failedCallback = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/github-oauth/callback?code=oauth-code&state=${encodeURIComponent(
      state
    )}`
  });
  const replayCallback = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/github-oauth/callback?code=oauth-code&state=${encodeURIComponent(
      state
    )}`
  });

  assert.equal(failedCallback.statusCode, 302);
  assert.equal(failedCallback.headers.location, "/workspace?gitCicdGitHubOAuth=failed");
  assert.equal(replayCallback.statusCode, 302);
  assert.equal(replayCallback.headers.location, "/workspace?gitCicdGitHubOAuth=failed");
  assert.equal(tokenExchangeCalls, 1);

  await app.close();
});

test("POST /api/git-cicd-handoffs/:handoffId/aws-role-diff/apply records explicit approval and updates trust policy", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const roleArn = "arn:aws:iam::123456789012:role/SketchCatchGitHubDeployRole";
  repository.handoff = createHandoffRecord(handoffId, {
    repositoryProvider: "github",
    awsRoleDiff: {
      roleArn,
      repository: "sketchcatch/infra-live",
      targetBranch: "main",
      environmentName: "sketchcatch-production",
      requiredTrustConditions: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub":
          "repo:sketchcatch/infra-live:environment:sketchcatch-production",
        "sketchcatch:target_branch": "main"
      },
      approved: false,
      approvedByUserId: null,
      approvedAt: null
    }
  });
  const policies: Record<string, unknown>[] = [
    {
      Version: "2012-10-17",
      Statement: []
    }
  ];
  const app = await buildGitCicdHandoffTestApp(repository, {
    awsRoleDiffGateway: {
      async getAssumeRolePolicy() {
        return policies.at(-1) as Record<string, unknown>;
      },
      async updateAssumeRolePolicy(_roleArn, policy) {
        policies.push(policy);
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/aws-role-diff/apply`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    applied: boolean;
    roleArn: string;
    verified: boolean;
  };
  assert.equal(body.applied, true);
  assert.equal(body.roleArn, roleArn);
  assert.equal(body.verified, true);
  assert.equal(repository.handoff?.awsRoleDiff?.applied, true);
  assert.equal(repository.handoff?.awsRoleDiff?.approved, true);
  assert.equal(repository.handoff?.awsRoleDiff?.approvedByUserId, userId);
  assert.equal(repository.handoff?.awsRoleDiff?.verified, true);

  await app.close();
});

test("GET /api/projects/:projectId/git-cicd-handoffs requires authentication", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/git-cicd-handoffs`
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});

test("POST Git/CI/CD handoff is blocked until monitoring is enabled and valid", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.monitoringConfig = {
    ...repository.monitoringConfig!,
    validationStatus: "required"
  };
  const providerCalls: GitCicdProviderCreateInput[] = [];
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.json().message, /monitoring/i);
  assert.equal(providerCalls.length, 0);
  await app.close();
});

test("GET cicd-monitoring ensures and returns a durable default config", async () => {
  const monitoringRepository = new FakeMonitoringRepository();
  const app = await buildGitCicdHandoffTestApp(new FakeGitCicdHandoffRepository(), {
    monitoringRepository,
    monitoringProvider: createMonitoringProvider()
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/cicd-monitoring`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdMonitoringConfigResponse;
  assert.equal(body.config.enabled, true);
  assert.equal(body.config.monitorBranch, "main");
  assert.deepEqual(body.config.appPath, { mode: "repository_root", path: "." });
  assert.equal(body.config.validationStatus, "required");
  assert.equal(monitoringRepository.config?.sourceRepositoryId, sourceRepositoryId);
  await app.close();
});

test("PUT cicd-monitoring validates and persists a normalized enabled config", async () => {
  const monitoringRepository = new FakeMonitoringRepository();
  const app = await buildGitCicdHandoffTestApp(new FakeGitCicdHandoffRepository(), {
    monitoringRepository,
    monitoringProvider: createMonitoringProvider()
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/cicd-monitoring`,
    headers: await authHeaders(),
    payload: {
      enabled: true,
      monitorBranch: "main",
      appPath: { mode: "subdirectory", path: "./apps/web/" },
      infraPath: { mode: "repository_root", path: "ignored" },
      userAcceptedChangeId: "accepted-monitoring-1"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdMonitoringConfigResponse;
  assert.deepEqual(body.config.appPath, { mode: "subdirectory", path: "apps/web" });
  assert.deepEqual(body.config.infraPath, { mode: "repository_root", path: "." });
  assert.equal(body.config.validationStatus, "valid");
  await app.close();
});

test("disabled PUT cicd-monitoring does not require GitHub App configuration", async () => {
  const previousGitHubEnv = {
    appId: process.env.GIT_APP_ID,
    appSlug: process.env.GIT_APP_SLUG,
    privateKey: process.env.GIT_APP_PRIVATE_KEY_BASE64,
    callbackUrl: process.env.GIT_APP_CALLBACK_URL
  };
  delete process.env.GIT_APP_ID;
  delete process.env.GIT_APP_SLUG;
  delete process.env.GIT_APP_PRIVATE_KEY_BASE64;
  delete process.env.GIT_APP_CALLBACK_URL;
  const app = await buildGitCicdHandoffTestApp(new FakeGitCicdHandoffRepository(), {
    monitoringRepository: new FakeMonitoringRepository()
  });

  try {
    const response = await app.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/cicd-monitoring`,
      headers: await authHeaders(),
      payload: {
        enabled: false,
        monitorBranch: "main",
        appPath: { mode: "repository_root", path: "." },
        infraPath: { mode: "repository_root", path: "." },
        userAcceptedChangeId: "accepted-monitoring-1"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().config.enabled, false);
  } finally {
    await app.close();
    restoreEnvironmentVariable("GIT_APP_ID", previousGitHubEnv.appId);
    restoreEnvironmentVariable("GIT_APP_SLUG", previousGitHubEnv.appSlug);
    restoreEnvironmentVariable("GIT_APP_PRIVATE_KEY_BASE64", previousGitHubEnv.privateKey);
    restoreEnvironmentVariable("GIT_APP_CALLBACK_URL", previousGitHubEnv.callbackUrl);
  }
});

test("PUT cicd-monitoring requires an accepted change and returns stable validation errors", async () => {
  const app = await buildGitCicdHandoffTestApp(new FakeGitCicdHandoffRepository(), {
    monitoringRepository: new FakeMonitoringRepository(),
    monitoringProvider: {
      async validateBranch() {
        return false;
      },
      async validateDirectory() {
        return "directory";
      }
    }
  });
  const payload = {
    enabled: true,
    monitorBranch: "missing",
    appPath: { mode: "repository_root", path: "." },
    infraPath: { mode: "repository_root", path: "." }
  };

  const missingAcceptance = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/cicd-monitoring`,
    headers: await authHeaders(),
    payload
  });
  assert.equal(missingAcceptance.statusCode, 400);

  const invalidBranch = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/cicd-monitoring`,
    headers: await authHeaders(),
    payload: { ...payload, userAcceptedChangeId: "accepted-monitoring-1" }
  });
  assert.equal(invalidBranch.statusCode, 422);
  assert.equal(invalidBranch.json().code, "MONITOR_BRANCH_NOT_FOUND");
  await app.close();
});

class FakeMonitoringRepository implements GitCicdMonitoringRepository {
  config: GitCicdMonitoringConfigRecord | undefined;

  async findAccessibleSourceRepository(
    candidateProjectId: string,
    candidateSourceRepositoryId: string,
    accessContext: ProjectAccessContext
  ) {
    if (
      candidateProjectId !== projectId ||
      candidateSourceRepositoryId !== sourceRepositoryId ||
      accessContext.userId !== userId
    ) {
      return undefined;
    }
    return {
      id: sourceRepositoryId,
      projectId,
      provider: "github" as const,
      status: "active" as const,
      githubInstallationId: "42",
      owner: "owner",
      name: "repo",
      defaultBranch: "main"
    };
  }

  async findConfig(candidateSourceRepositoryId: string) {
    return candidateSourceRepositoryId === sourceRepositoryId ? this.config : undefined;
  }

  async ensureDefaultConfig(input: Omit<GitCicdMonitoringConfigRecord, "updatedAt">) {
    this.config ??= { ...input, updatedAt: fixedNow };
    return this.config;
  }

  async upsertConfig(input: Omit<GitCicdMonitoringConfigRecord, "updatedAt">) {
    this.config = { ...input, updatedAt: fixedNow };
    return this.config;
  }
}

function createMonitoringProvider(): GitCicdMonitoringProvider {
  return {
    async validateBranch() {
      return true;
    },
    async validateDirectory() {
      return "directory";
    }
  };
}

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

class FakePipelineRepository implements GitCicdPipelinePersistenceRepository {
  logs: PersistedPipelineLog[] = [];
  persistCount = 0;
  refreshEnabled = true;

  constructor(readonly runs: PipelineRunWithStages[]) {}

  async findRefreshTarget(candidateProjectId: string, candidateSourceRepositoryId: string) {
    return this.refreshEnabled && candidateProjectId === projectId && candidateSourceRepositoryId === sourceRepositoryId
      ? createPipelineRefreshTarget()
      : undefined;
  }

  async findPipelineRun(candidatePipelineRunId: string) {
    return this.runs.find((run) => run.id === candidatePipelineRunId);
  }

  async findRunRefreshTarget(candidatePipelineRunId: string) {
    const run = await this.findPipelineRun(candidatePipelineRunId);
    return this.refreshEnabled && run
      ? { ...createPipelineRefreshTarget(), commitSha: run.commitSha }
      : undefined;
  }

  async listProjectPipelineRuns(candidateProjectId: string) {
    return this.runs.filter((run) => run.projectId === candidateProjectId);
  }

  async listPipelineLogs(candidatePipelineRunId: string, sinceSequence: number) {
    return this.logs.filter(
      (log) => log.pipelineRunId === candidatePipelineRunId && log.sequence > sinceSequence
    );
  }

  async findPipelineRunsByCommitShas(
    _candidateSourceRepositoryId: string,
    _commitShas: readonly string[]
  ) {
    return new Map<string, PersistedPipelineRun>();
  }

  async persistSnapshot(input: {
    run: PersistedPipelineRun;
    stages: PipelineRunWithStages["stages"];
    logs: PersistedPipelineLog[];
  }) {
    this.persistCount += 1;
    const existingIndex = this.runs.findIndex((run) => run.commitSha === input.run.commitSha);
    const existing = this.runs[existingIndex];
    const id = existing?.id ?? input.run.id;
    const persisted = {
      ...input.run,
      id,
      stages: input.stages.map((stage) => ({ ...stage, pipelineRunId: id }))
    };
    if (existingIndex >= 0) this.runs.splice(existingIndex, 1, persisted);
    else this.runs.push(persisted);
    this.logs = input.logs.map((log) => ({ ...log, pipelineRunId: id }));
    return persisted;
  }
}

function createPipelineRefreshTarget(): PipelineRefreshTarget {
  return {
    projectId,
    sourceRepositoryId,
    installationId: "installation-1",
    owner: "sketchcatch",
    name: "infra-live",
    monitorBranch: "main",
    appPath: { mode: "subdirectory", path: "apps/web" },
    infraPath: { mode: "subdirectory", path: "infra" }
  };
}

function createPipelineRun(index: number): PipelineRunWithStages {
  const createdAt = new Date(fixedNow.getTime() + index * 60_000);
  const id = index === 0 ? pipelineRunId : `pipeline-run-${index}`;
  return {
    id,
    projectId,
    sourceRepositoryId,
    handoffId: null,
    commitSha: `${index}`.padStart(40, "a"),
    commitMessage: `Commit ${index}`,
    branch: "main",
    changeScope: "app_and_infra",
    status: "running",
    statusMessage: "Workflow: running",
    pipelineRunUrl: `https://example.invalid/actions/runs/${index}`,
    appUrl: null,
    apiUrl: null,
    startedAt: fixedNow,
    finishedAt: null,
    lastRefreshedAt: fixedNow,
    createdAt,
    stages: [
      {
        id: `stage-${index}`,
        pipelineRunId: id,
        kind: "detect",
        status: "succeeded",
        runUrl: null,
        startedAt: fixedNow,
        finishedAt: fixedNow
      }
    ]
  };
}

function createPipelineLog(sequence: number): PersistedPipelineLog {
  return {
    id: `log-${sequence}`,
    pipelineRunId,
    stageId: "stage-0",
    sequence,
    level: "info",
    message: `Log ${sequence}`,
    createdAt: fixedNow
  };
}

function createPipelineProvider(calls: string[]): GitCicdRunProvider {
  const snapshot: GitCicdRunProviderSnapshot = {
    commitSha: createPipelineRun(0).commitSha,
    commitMessage: "Commit 0",
    branch: "main",
    workflowName: "SketchCatch",
    runUrl: "https://example.invalid/actions/runs/0",
    status: "succeeded",
    startedAt: fixedNow,
    finishedAt: fixedNow,
    jobs: [],
    logs: []
  };
  return {
    async listSnapshots() {
      calls.push("listSnapshots");
      return [snapshot];
    },
    async listCommitFiles() {
      calls.push("listCommitFiles");
      return ["apps/web/page.tsx"];
    }
  };
}

type GitCicdRouteTestOptions = {
  provider?: GitCicdHandoffProvider;
  runtimeCache?: RuntimeCache;
  userRows?: UserRecord[];
  repositorySettingsApplier?: GitCicdRepositorySettingsApplier;
  createGitHubOAuthRepositorySettingsApplier?: (
    accessToken: string
  ) => GitCicdRepositorySettingsApplier;
  githubOAuthFetch?: typeof fetch;
  awsRoleDiffGateway?: AwsRoleDiffGateway;
  monitoringRepository?: GitCicdMonitoringRepository;
  monitoringProvider?: GitCicdMonitoringProvider;
  pipelineRepository?: GitCicdPipelinePersistenceRepository;
  pipelineProvider?: GitCicdRunProvider;
};

async function buildGitCicdHandoffTestApp(
  repository: GitCicdHandoffRepository,
  routeOptions: GitCicdRouteTestOptions = {}
) {
  const app = Fastify({ logger: false });
  const fakeAuthDb = new GitCicdRouteFakeAuthDb(routeOptions.userRows ?? [createUserRecord()]);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "bad_request",
        message: error.message
      });
      return;
    }

    throw error;
  });

  await app.register(registerGitCicdHandoffRoutes, {
    prefix: "/api",
    getDatabaseClient: () => fakeAuthDb.client,
    createGitCicdHandoffRepository: () => repository,
    ...(routeOptions.monitoringRepository
      ? { createGitCicdMonitoringRepository: () => routeOptions.monitoringRepository! }
      : {}),
    ...(routeOptions.monitoringProvider
      ? { gitCicdMonitoringProvider: routeOptions.monitoringProvider }
      : {}),
    ...(routeOptions.pipelineRepository
      ? { createGitCicdPipelinePersistenceRepository: () => routeOptions.pipelineRepository! }
      : {}),
    ...(routeOptions.pipelineProvider
      ? { gitCicdRunProvider: routeOptions.pipelineProvider }
      : {}),
    ...(routeOptions.provider ? { gitCicdHandoffProvider: routeOptions.provider } : {}),
    ...(routeOptions.repositorySettingsApplier
      ? { gitCicdRepositorySettingsApplier: routeOptions.repositorySettingsApplier }
      : {}),
    ...(routeOptions.createGitHubOAuthRepositorySettingsApplier
      ? {
          createGitHubOAuthRepositorySettingsApplier:
            routeOptions.createGitHubOAuthRepositorySettingsApplier
        }
      : {}),
    ...(routeOptions.githubOAuthFetch ? { githubOAuthFetch: routeOptions.githubOAuthFetch } : {}),
    ...(routeOptions.awsRoleDiffGateway ? { awsRoleDiffGateway: routeOptions.awsRoleDiffGateway } : {}),
    ...(routeOptions.runtimeCache ? { runtimeCache: routeOptions.runtimeCache } : {})
  });

  return app;
}

function createProviderSpy(calls: GitCicdProviderCreateInput[]): GitCicdHandoffProvider {
  return {
    async createHandoff(input) {
      calls.push(input);

      return {
        repositoryProvider: "internal",
        pullRequestUrl: null,
        pipelineRunUrl: null,
        status: "draft",
        statusMessage: null
      };
    }
  };
}

function createHandoffRecord(
  id: string = handoffId,
  overrides: Partial<GitCicdHandoffRecord> = {}
): GitCicdHandoffRecord {
  return {
    id,
    projectId,
    architectureId,
    terraformArtifactId,
    handoffKind: "terraform_iac",
    sourceDeploymentId: null,
    deploymentMode: "infra_and_app",
    requiresEnvironmentApproval: true,
    sourceRepositoryId,
    repositoryProvider: "internal",
    repositoryOwner: "sketchcatch",
    repositoryName: "infra-live",
    targetBranch: "main",
    sourceBranch: "sketchcatch/iac-preview",
    commitMessage: "Add SketchCatch Terraform preview",
    pullRequestTitle: "SketchCatch IaC preview",
    pullRequestUrl: null,
    pullRequestNumber: null,
    pullRequestHeadSha: null,
    mergeCommitSha: null,
    environmentName: "sketchcatch-production",
    pipelineRunUrl: null,
    infraPipelineRunUrl: null,
    infraPipelineStatus: "waiting_for_merge",
    appPipelineRunUrl: null,
    appPipelineStatus: "not_started",
    destroyPipelineRunUrl: null,
    destroyPipelineStatus: "not_started",
    staticSiteUrl: null,
    apiBaseUrl: null,
    repositorySettingsPreview: null,
    awsRoleDiff: null,
    githubOAuthRequired: false,
    status: "draft",
    statusMessage: null,
    userAcceptedChangeId: "accepted-change-1",
    createdByUserId: userId,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createProjectRecord(
  overrides: Partial<GitCicdHandoffProjectRecord> = {}
): GitCicdHandoffProjectRecord {
  return {
    id: projectId,
    userId,
    name: "Test Project",
    description: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createArchitectureRecord(
  overrides: Partial<GitCicdHandoffArchitectureRecord> = {}
): GitCicdHandoffArchitectureRecord {
  return {
    id: architectureId,
    projectId,
    version: 1,
    source: "manual",
    architectureJson: {
      nodes: [],
      edges: []
    },
    createdAt: fixedNow,
    ...overrides
  };
}

function createTerraformArtifactRecord(
  overrides: Partial<GitCicdHandoffTerraformArtifactRecord> = {}
): GitCicdHandoffTerraformArtifactRecord {
  return {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/terraform/main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform",
    uploadStatus: "uploaded",
    ...overrides
  };
}

// Git handoff 테스트에서 사용할 서버 승인 완료 Deployment를 만듭니다.
function createApprovedDeploymentRecord(
  overrides: Partial<GitCicdHandoffApprovedDeploymentRecord> = {}
): GitCicdHandoffApprovedDeploymentRecord {
  return {
    id: deploymentId,
    projectId,
    architectureId,
    terraformArtifactId,
    planSummary: createPlanSummary(),
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: "accepted-change-1",
    ...overrides
  };
}

// Git handoff 테스트에서 승인된 apply Plan artifact를 만듭니다.
function createApprovedPlanArtifactRecord(
  overrides: Partial<GitCicdHandoffApprovedPlanArtifactRecord> = {}
): GitCicdHandoffApprovedPlanArtifactRecord {
  return {
    id: "accepted-change-1",
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256: "a".repeat(64),
    operation: "apply",
    ...overrides
  };
}

function createSourceRepositoryRecord(
  overrides: Partial<GitCicdHandoffSourceRepositoryRecord> = {}
): GitCicdHandoffSourceRepositoryRecord {
  return {
    id: sourceRepositoryId,
    projectId,
    provider: "internal",
    status: "active",
    githubInstallationId: null,
    githubRepositoryId: null,
    owner: "sketchcatch",
    name: "infra-live",
    defaultBranch: "main",
    repositoryUrl: "https://example.invalid/sketchcatch/infra-live",
    ...overrides
  };
}

function createHandoffBody() {
  return {
    architectureId,
    terraformArtifactId,
    sourceDeploymentId: deploymentId,
    sourceRepositoryId,
    targetBranch: "main",
    sourceBranch: "sketchcatch/iac-preview",
    commitMessage: "Add SketchCatch Terraform preview",
    pullRequestTitle: "SketchCatch IaC preview",
    userAcceptedChangeId: "accepted-change-1"
  };
}

function createPlanSummary(): DeploymentPlanSummary {
  return {
    createCount: 2,
    updateCount: 1,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: [
      {
        id: "repository-variable-warning",
        level: "medium",
        category: "configuration",
        source: "pre_deployment_check",
        code: "UNSUPPORTED_RESOURCE",
        message: "Confirm destination repository variables before merge.",
        relatedResourceId: "aws_instance.web",
        requiresAcknowledgement: true,
        blocksApproval: false
      }
    ]
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: userId,
    username: "git-cicd-user",
    email: "git-cicd@example.com",
    nickname: "Git CI User",
    passwordHash: "unused",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
    ...overrides
  };
}

async function authHeaders(activeUserId = userId): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(activeUserId)}`
  };
}

function assertResponseHasNoSecretFields(value: unknown): void {
  assert.equal(hasOwnKey(value, "accessToken"), false);
  assert.equal(hasOwnKey(value, "privateKey"), false);
  assert.equal(hasOwnKey(value, "ciSecret"), false);
  assert.equal(hasOwnKey(value, "deployKey"), false);
}

function hasOwnKey(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key);
}

class GitCicdRouteFakeAuthDb {
  client: DatabaseClient;

  constructor(private readonly userRows: UserRecord[]) {
    this.client = {
      db: this.createDb() as DatabaseClient["db"],
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => new SelectQuery(() => (table === users ? this.userRows : []))
      })
    };
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}
