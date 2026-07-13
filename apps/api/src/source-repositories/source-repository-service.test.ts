import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import {
  connectGitHubSourceRepository,
  createGitHubExistingInstallationCallbackUrl,
  createGitHubInstallUrl,
  listGitHubInstalledRepositories,
  listGitHubInstallationRepositories,
  requireRepositoryAnalysisTemplateId,
  RepositoryAnalysisTemplateSelectionError,
  SourceRepositoryNotFoundError,
  SourceRepositoryConflictError,
  SourceRepositoryStateError,
  type CreateActiveGitHubSourceRepositoryInput,
  type SourceRepositoryRecord,
  type SourceRepositoryRepository
} from "./source-repository-service.js";
import type { GitHubAppClient } from "./github-app-client.js";
import type { ProjectAccessContext } from "../git-cicd/git-cicd-handoff-service.js";

const stateSecret = "github-app-state-secret-for-tests";
const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

test("GitHub App callback lists installation repositories without storing the installation repository list", async () => {
  const repository = createInMemorySourceRepositoryRepository();
  const github = createFakeGitHubAppClient([
    createRepositoryCandidate({ githubRepositoryId: "repo-1", name: "api" }),
    createRepositoryCandidate({ githubRepositoryId: "repo-2", name: "web" })
  ]);
  const install = await createGitHubInstallUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      appSlug: "sketchcatch-test",
      stateSecret
    },
    repository
  );
  const state = new URL(install.installUrl).searchParams.get("state");

  assert.ok(state);

  const result = await listGitHubInstallationRepositories(
    {
      installationId: "12345",
      state,
      accessContext: createAccessContext(userId),
      stateSecret
    },
    repository,
    github
  );

  assert.equal(result.projectId, projectId);
  assert.deepEqual(
    result.repositories.map((candidate) => candidate.fullName),
    ["owner/api", "owner/web"]
  );
  assert.equal(repository.rows.length, 0);
});

test("GitHub App install URL uses the official installation path and keeps the signed state", async () => {
  const repository = createInMemorySourceRepositoryRepository();
  const install = await createGitHubInstallUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      appSlug: "sketchcatch-test",
      stateSecret
    },
    repository
  );
  const installUrl = new URL(install.installUrl);

  assert.equal(installUrl.origin, "https://github.com");
  assert.equal(installUrl.pathname, "/apps/sketchcatch-test/installations/new");
  assert.ok(installUrl.searchParams.get("state"));
});

test("GitHub App installed repositories include repos not yet stored in SketchCatch", async () => {
  const repository = createInMemorySourceRepositoryRepository([
    createSourceRepositoryRecord({
      githubInstallationId: "42",
      githubRepositoryId: "repo-1",
      name: "connected"
    })
  ]);
  const github = createFakeGitHubAppClient([
    createRepositoryCandidate({ githubRepositoryId: "repo-1", name: "connected" }),
    createRepositoryCandidate({ githubRepositoryId: "repo-2", name: "handoff-test" })
  ], [createInstallation("42", "github-account-1")]);
  const result = await listGitHubInstalledRepositories(
    {
      projectId,
      accessContext: createAccessContext(userId),
      stateSecret
    },
    repository,
    github
  );

  assert.ok(result.state);
  assert.deepEqual(
    result.repositories.map((candidate) => ({
      fullName: candidate.fullName,
      installationId: candidate.installationId,
      connectedStatus: candidate.connectedStatus
    })),
    [
      { fullName: "owner/connected", installationId: "42", connectedStatus: "active" },
      { fullName: "owner/handoff-test", installationId: "42", connectedStatus: null }
    ]
  );
});

test("installed repositories only expose installations owned by the signed-in GitHub identity", async () => {
  const repository = createInMemorySourceRepositoryRepository([], "github-account-1");
  const github = createFakeGitHubAppClient(
    [createRepositoryCandidate({ githubRepositoryId: "repo-1" })],
    [
      createInstallation("42", "github-account-1"),
      createInstallation("99", "another-account")
    ]
  );

  const result = await listGitHubInstalledRepositories(
    {
      projectId,
      accessContext: createAccessContext(userId),
      stateSecret
    },
    repository,
    github
  );

  assert.deepEqual(result.repositories.map((candidate) => candidate.installationId), ["42"]);
});

test("installed repositories require a linked GitHub identity", async () => {
  const repository = createInMemorySourceRepositoryRepository([], null);

  await assert.rejects(
    () =>
      listGitHubInstalledRepositories(
        {
          projectId,
          accessContext: createAccessContext(userId),
          stateSecret
        },
        repository,
        createFakeGitHubAppClient([])
      ),
    (error: unknown) =>
      error instanceof SourceRepositoryConflictError &&
      error.message === "GIT_APP_GITHUB_IDENTITY_REQUIRED"
  );
});

test("connect rejects an installation owned by another GitHub identity", async () => {
  const repository = createInMemorySourceRepositoryRepository([], "github-account-1");
  const github = createFakeGitHubAppClient(
    [createRepositoryCandidate({ githubRepositoryId: "repo-1" })],
    [createInstallation("99", "another-account")]
  );
  const install = await createGitHubInstallUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      appSlug: "sketchcatch-test",
      stateSecret
    },
    repository
  );
  const state = new URL(install.installUrl).searchParams.get("state");
  assert.ok(state);

  await assert.rejects(
    () =>
      connectGitHubSourceRepository(
        {
          projectId,
          installationId: "99",
          githubRepositoryId: "repo-1",
          state,
          accessContext: createAccessContext(userId),
          stateSecret
        },
        repository,
        github
      ),
    (error: unknown) =>
      error instanceof SourceRepositoryConflictError &&
      error.message === "GIT_APP_INSTALLATION_FORBIDDEN"
  );
});

test("existing active GitHub installation issues a callback URL for the repo selection screen", async () => {
  const repository = createInMemorySourceRepositoryRepository([
    createSourceRepositoryRecord({
      githubInstallationId: "active-installation"
    })
  ]);
  const callback = await createGitHubExistingInstallationCallbackUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      callbackUrl: "https://sketchcatch.net/integrations/github/callback",
      stateSecret
    },
    repository
  );
  const callbackUrl = new URL(callback.callbackUrl);

  assert.equal(callbackUrl.origin, "https://sketchcatch.net");
  assert.equal(callbackUrl.pathname, "/integrations/github/callback");
  assert.equal(callbackUrl.searchParams.get("installation_id"), "active-installation");
  assert.ok(callbackUrl.searchParams.get("state"));
});

test("existing installation callback URL can reuse an inactive GitHub source repository", async () => {
  const repository = createInMemorySourceRepositoryRepository([
    createSourceRepositoryRecord({
      githubInstallationId: "inactive-installation",
      status: "inactive"
    })
  ]);
  const callback = await createGitHubExistingInstallationCallbackUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      callbackUrl: "https://sketchcatch.net/integrations/github/callback",
      stateSecret
    },
    repository
  );
  const callbackUrl = new URL(callback.callbackUrl);

  assert.equal(callbackUrl.searchParams.get("installation_id"), "inactive-installation");
  assert.ok(callbackUrl.searchParams.get("state"));
});

test("existing installation callback URL requires a known GitHub source repository", async () => {
  const repository = createInMemorySourceRepositoryRepository();

  await assert.rejects(
    () =>
      createGitHubExistingInstallationCallbackUrl(
        {
          projectId,
          accessContext: createAccessContext(userId),
          callbackUrl: "https://sketchcatch.net/integrations/github/callback",
          stateSecret
        },
        repository
      ),
    SourceRepositoryNotFoundError
  );
});

test("connecting a GitHub repository stores only the selected repository and soft deactivates the previous active repo", async () => {
  const repository = createInMemorySourceRepositoryRepository([
    createSourceRepositoryRecord({
      id: "old-source-repository",
      githubRepositoryId: "old-repo",
      name: "old",
      status: "active"
    })
  ]);
  const github = createFakeGitHubAppClient([
    createRepositoryCandidate({ githubRepositoryId: "repo-1", name: "api" }),
    createRepositoryCandidate({ githubRepositoryId: "repo-2", name: "web" })
  ]);
  const install = await createGitHubInstallUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      appSlug: "sketchcatch-test",
      stateSecret
    },
    repository
  );
  const state = new URL(install.installUrl).searchParams.get("state");

  assert.ok(state);

  const connected = await connectGitHubSourceRepository(
    {
      projectId,
      installationId: "12345",
      githubRepositoryId: "repo-2",
      state,
      accessContext: createAccessContext(userId),
      stateSecret
    },
    repository,
    github,
    () => "new-source-repository"
  );

  assert.equal(connected.id, "new-source-repository");
  assert.equal(connected.githubRepositoryId, "repo-2");
  assert.equal(connected.name, "web");
  assert.equal(connected.status, "active");
  assert.equal(repository.rows.length, 2);
  assert.equal(repository.rows[0]?.status, "inactive");
  assert.ok(repository.rows[0]?.disconnectedAt instanceof Date);
  assert.equal(repository.rows[1]?.githubRepositoryId, "repo-2");
});

test("connecting an archived GitHub repository is rejected before any DB row is created", async () => {
  const repository = createInMemorySourceRepositoryRepository();
  const github = createFakeGitHubAppClient([
    createRepositoryCandidate({
      githubRepositoryId: "repo-archived",
      name: "archived",
      archived: true
    })
  ]);
  const install = await createGitHubInstallUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      appSlug: "sketchcatch-test",
      stateSecret
    },
    repository
  );
  const state = new URL(install.installUrl).searchParams.get("state");

  assert.ok(state);

  await assert.rejects(
    () =>
      connectGitHubSourceRepository(
        {
          projectId,
          installationId: "12345",
          githubRepositoryId: "repo-archived",
          state,
          accessContext: createAccessContext(userId),
          stateSecret
        },
        repository,
        github
      ),
    SourceRepositoryConflictError
  );
  assert.equal(repository.rows.length, 0);
});

test("expired GitHub App state is rejected", async () => {
  const repository = createInMemorySourceRepositoryRepository();
  const github = createFakeGitHubAppClient([]);
  const install = await createGitHubInstallUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      appSlug: "sketchcatch-test",
      stateSecret,
      now: () => new Date(Date.now() - 11 * 60 * 1000)
    },
    repository
  );
  const state = new URL(install.installUrl).searchParams.get("state");

  assert.ok(state);

  await assert.rejects(
    () =>
      listGitHubInstallationRepositories(
        {
          installationId: "12345",
          state,
          accessContext: createAccessContext(userId),
          stateSecret
        },
        repository,
        github
      ),
    SourceRepositoryStateError
  );
});

test("GitHub App state cannot be exchanged for an inaccessible project", async () => {
  const repository = createInMemorySourceRepositoryRepository();
  const github = createFakeGitHubAppClient([]);
  const install = await createGitHubInstallUrl(
    {
      projectId,
      accessContext: createAccessContext(userId),
      appSlug: "sketchcatch-test",
      stateSecret
    },
    repository
  );
  const state = new URL(install.installUrl).searchParams.get("state");

  assert.ok(state);

  await assert.rejects(
    () =>
      listGitHubInstallationRepositories(
        {
          installationId: "12345",
          state,
          accessContext: createAccessContext("33333333-3333-4333-8333-333333333333"),
          stateSecret
        },
        repository,
        github
      ),
    SourceRepositoryStateError
  );
});

test("AI handoff resolves only the Template selected by the stored Repository Analysis", async () => {
  const repository = createInMemorySourceRepositoryRepository([
    createSourceRepositoryRecord({
      analysisResult: {
        status: "template_selected",
        templateId: "static-web-hosting",
        applicationUnits: [],
        evidence: [],
        missingEvidence: [],
        selectionReasons: ["static frontend"]
      }
    })
  ]);

  const templateId = await requireRepositoryAnalysisTemplateId(
    {
      projectId,
      sourceRepositoryId: "source-repository-id",
      accessContext: createAccessContext(userId)
    },
    repository
  );

  assert.equal(templateId, "static-web-hosting");
});

test("AI handoff rejects a repository without a successful Template Selection", async () => {
  const repository = createInMemorySourceRepositoryRepository([
    createSourceRepositoryRecord({
      analysisResult: {
        status: "template_selection_failed",
        templateId: null,
        applicationUnits: [],
        evidence: [],
        missingEvidence: ["package_json"],
        mismatchReasons: ["unsupported"]
      }
    })
  ]);

  await assert.rejects(
    () =>
      requireRepositoryAnalysisTemplateId(
        {
          projectId,
          sourceRepositoryId: "source-repository-id",
          accessContext: createAccessContext(userId)
        },
        repository
      ),
    RepositoryAnalysisTemplateSelectionError
  );
});

function createAccessContext(accessUserId: string): ProjectAccessContext {
  return {
    kind: "user",
    userId: accessUserId
  };
}

function createFakeGitHubAppClient(
  repositories: GitHubRepositoryCandidate[],
  installations = [createInstallation("12345", "github-account-1")]
): GitHubAppClient {
  return {
    async listInstallations() {
      return installations;
    },
    async listInstallationRepositories() {
      return repositories;
    },
    async createPullRequest() {
      throw new Error("not used");
    },
    async applyRepositorySettings() {
      throw new Error("not used");
    },
    async getLatestWorkflowRunForHeadSha() {
      throw new Error("not used");
    },
    async getPipelineStatusForPullRequest() {
      throw new Error("not used");
    }
  };
}

function createInMemorySourceRepositoryRepository(
  initialRows: SourceRepositoryRecord[] = [],
  githubProviderUserId: string | null = "github-account-1"
): SourceRepositoryRepository & { rows: SourceRepositoryRecord[] } {
  const rows = [...initialRows];

  return {
    rows,
    async findGitHubProviderUserId(requestUserId) {
      return requestUserId === userId ? githubProviderUserId : null;
    },
    async findAccessibleProject(requestProjectId, accessContext) {
      if (requestProjectId !== projectId || accessContext.userId !== userId) {
        return undefined;
      }

      return { id: projectId, userId } as Awaited<
        ReturnType<SourceRepositoryRepository["findAccessibleProject"]>
      >;
    },
    async listProjectSourceRepositories(requestProjectId) {
      return rows.filter((row) => row.projectId === requestProjectId);
    },
    async findProjectSourceRepository(requestProjectId, sourceRepositoryId) {
      return rows.find((row) => row.projectId === requestProjectId && row.id === sourceRepositoryId);
    },
    async createActiveGitHubSourceRepository(input: CreateActiveGitHubSourceRepositoryInput) {
      const now = new Date();

      for (const row of rows) {
        if (row.projectId === input.projectId && row.provider === "github" && row.status === "active") {
          row.status = "inactive";
          row.disconnectedAt = now;
          row.updatedAt = now;
        }
      }

      const row = createSourceRepositoryRecord({
        id: input.id,
        projectId: input.projectId,
        createdByUserId: input.createdByUserId,
        githubInstallationId: input.githubInstallationId,
        githubRepositoryId: input.repository.githubRepositoryId,
        owner: input.repository.owner,
        name: input.repository.name,
        defaultBranch: input.repository.defaultBranch,
        repositoryUrl: input.repository.repositoryUrl,
        visibility: input.repository.visibility,
        archived: input.repository.archived,
        status: "active"
      });

      rows.push(row);

      return row;
    },
    // 실제 repository와 같은 active-row 조건으로 분석 저장 경쟁을 재현한다.
    async saveProjectSourceRepositoryAnalysis(input) {
      const row = rows.find(
        (candidate) =>
          candidate.projectId === input.projectId &&
          candidate.id === input.sourceRepositoryId &&
          candidate.status === "active"
      );

      if (!row) {
        return undefined;
      }

      row.analysisResult = input.aiHandoff;
      row.analysisRevision = input.repositoryRevision;
      row.analyzedAt = input.analyzedAt;
      row.updatedAt = input.analyzedAt;
      return row;
    }
  };
}

function createInstallation(installationId: string, accountId: string) {
  return {
    installationId,
    accountId,
    accountLogin: `account-${accountId}`,
    accountType: "User",
    repositorySelection: "selected" as const,
    htmlUrl: `https://github.com/settings/installations/${installationId}`
  };
}

function createRepositoryCandidate(
  overrides: Partial<GitHubRepositoryCandidate> = {}
): GitHubRepositoryCandidate {
  const name = overrides.name ?? "repo";

  return {
    githubRepositoryId: overrides.githubRepositoryId ?? "repo-1",
    owner: overrides.owner ?? "owner",
    name,
    fullName: overrides.fullName ?? `${overrides.owner ?? "owner"}/${name}`,
    defaultBranch: overrides.defaultBranch ?? "main",
    repositoryUrl: overrides.repositoryUrl ?? `https://github.com/owner/${name}`,
    visibility: overrides.visibility ?? "private",
    archived: overrides.archived ?? false
  };
}

function createSourceRepositoryRecord(
  overrides: Partial<SourceRepositoryRecord> = {}
): SourceRepositoryRecord {
  const now = new Date("2026-07-05T00:00:00.000Z");

  return {
    id: overrides.id ?? "source-repository-id",
    projectId: overrides.projectId ?? projectId,
    createdByUserId: overrides.createdByUserId ?? userId,
    provider: overrides.provider ?? "github",
    status: overrides.status ?? "active",
    githubInstallationId: overrides.githubInstallationId ?? "12345",
    githubRepositoryId: overrides.githubRepositoryId ?? "repo-1",
    owner: overrides.owner ?? "owner",
    name: overrides.name ?? "repo",
    defaultBranch: overrides.defaultBranch ?? "main",
    repositoryUrl: overrides.repositoryUrl ?? "https://github.com/owner/repo",
    visibility: overrides.visibility ?? "private",
    archived: overrides.archived ?? false,
    analysisResult: overrides.analysisResult ?? null,
    analysisRevision: overrides.analysisRevision ?? null,
    analyzedAt: overrides.analyzedAt ?? null,
    disconnectedAt: overrides.disconnectedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}
