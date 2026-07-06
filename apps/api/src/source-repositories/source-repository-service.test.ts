import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import {
  connectGitHubSourceRepository,
  createGitHubExistingInstallationCallbackUrl,
  createGitHubInstallUrl,
  listGitHubInstallationRepositories,
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

test("GitHub App install URL starts at target selection so already-installed accounts keep the signed state", async () => {
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
  assert.equal(installUrl.pathname, "/apps/sketchcatch-test/installations/select_target");
  assert.ok(installUrl.searchParams.get("state"));
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

test("existing installation callback URL requires an active GitHub source repository", async () => {
  const repository = createInMemorySourceRepositoryRepository([
    createSourceRepositoryRecord({
      status: "inactive"
    })
  ]);

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

function createAccessContext(accessUserId: string): ProjectAccessContext {
  return {
    kind: "user",
    userId: accessUserId
  };
}

function createFakeGitHubAppClient(repositories: GitHubRepositoryCandidate[]): GitHubAppClient {
  return {
    async listInstallationRepositories() {
      return repositories;
    },
    async createPullRequest() {
      throw new Error("not used");
    },
    async getLatestWorkflowRunForHeadSha() {
      throw new Error("not used");
    }
  };
}

function createInMemorySourceRepositoryRepository(
  initialRows: SourceRepositoryRecord[] = []
): SourceRepositoryRepository & { rows: SourceRepositoryRecord[] } {
  const rows = [...initialRows];

  return {
    rows,
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
    }
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
    disconnectedAt: overrides.disconnectedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}
