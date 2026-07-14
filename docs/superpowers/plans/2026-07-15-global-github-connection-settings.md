# Global GitHub Connection Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move GitHub App installation and permission management below `연결된 AWS 계정` in global Dashboard settings while keeping repository selection, analysis, and CI/CD configuration project-scoped.

**Architecture:** Add an account-scoped GitHub App state and authenticated installation-list endpoints without creating new database rows. Render those installations in a dedicated global settings component, keep `SourceRepository` creation behind the existing project-scoped selection API, and make the shared callback distinguish account-scoped installation completion from project-scoped repository selection.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Fastify 5, Zod 4, jose JWT state, Drizzle repository adapters, Node test runner through `tsx --test`.

## Global Constraints

- GitHub App installation and repository permissions are account-scoped; `SourceRepository` selection and analysis remain project-scoped.
- An account-scoped callback must never create or change a `SourceRepository`.
- Account-scoped and project-scoped signed states must be discriminated and must not be interchangeable.
- GitHub installation access tokens, App private keys, and secrets must not enter browser responses, logs, RDS, or documentation.
- Keep the existing `source_repositories` schema; this work must not create or edit `apps/api/drizzle/**`.
- Keep existing unrelated dirty-worktree changes untouched and stage only files owned by each task.
- Do not install dependencies or rewrite `pnpm-lock.yaml`.
- User-facing copy and documentation are Korean; code identifiers and API paths remain in English.

---

## File Structure

- `packages/types/src/index.ts`: shared account installation DTOs and discriminated callback response.
- `apps/api/src/source-repositories/github-app-state.ts`: account/project state signing and verification.
- `apps/api/src/source-repositories/github-app-state.test.ts`: focused state scope and tamper tests.
- `apps/api/src/source-repositories/source-repository-service.ts`: account installation URL/list behavior and scope-aware callback resolution.
- `apps/api/src/source-repositories/source-repository-service.test.ts`: service ownership and no-project-mutation tests.
- `apps/api/src/routes/source-repositories.ts`: global installation endpoints and response validation boundary.
- `apps/api/src/routes/source-repositories.test.ts`: authenticated route contracts and failure cases.
- `apps/web/features/workspace/api.ts`: global GitHub settings API client functions.
- `apps/web/features/workspace/api.test.ts`: exact method/path/response client tests.
- `apps/web/app/dashboard/settings/github-account-settings.tsx`: stateful global GitHub installation panel.
- `apps/web/app/dashboard/settings/settings-dashboard-client.tsx`: compose the GitHub panel immediately after AWS connections.
- `apps/web/app/dashboard/dashboard-tools.module.css`: GitHub installation list/card/action styles following existing settings styles.
- `apps/web/features/dashboard/github-account-settings.test.ts`: source regression coverage for placement and project-data boundary.
- `apps/web/app/projects/[projectId]/settings/project-github-settings-client.tsx`: project repository selection and analysis only.
- `apps/web/app/projects/[projectId]/settings/github-repository-connection-panel.tsx`: remove installation mutation and link to global settings.
- `apps/web/app/integrations/github/callback/page.tsx`: redirect account callbacks and preserve project repository selection.
- `apps/web/app/workspace/repository/repository-start-client.tsx`: use global settings for permission management navigation.
- `apps/web/features/workspace/github-callback-route.test.ts`: account/project callback regression.
- `apps/web/features/workspace/project-github-settings.test.ts`: project/global responsibility regression.
- `apps/web/features/workspace/repository-start-template-recommendation.test.ts`: updated settings URL regression.
- `apps/web/features/workspace/workspace-right-panel-layout.test.ts`: updated settings URL regression.
- `docs/data-models.md`: document the account installation DTO and state scope boundary.
- `agent-progress.md`: concise English verification record appended without rewriting unrelated entries.

---

### Task 1: Discriminate Account and Project GitHub App State

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/source-repositories/github-app-state.ts`
- Create: `apps/api/src/source-repositories/github-app-state.test.ts`
- Modify: `apps/api/src/source-repositories/source-repository-service.ts`

**Interfaces:**
- Produces: `GitHubInstallationConnection`, `ListGitHubInstallationsResponse`, and discriminated `ListGitHubInstallationRepositoriesResponse`.
- Produces: `createGitHubAppState(input)` accepting `scope: "account"` without `projectId` or `scope: "project"` with `projectId`.
- Produces: `verifyGitHubAppState(input)` returning the same discriminated scope.

- [ ] **Step 1: Write failing state scope tests**

```ts
test("GitHub App state round-trips account scope without a project", async () => {
  const { state } = await createGitHubAppState({
    scope: "account",
    userId: "user-1",
    secret: stateSecret,
    now,
    generateNonce: () => "nonce-1"
  });

  assert.deepEqual(await verifyGitHubAppState({ state, secret: stateSecret, now }), {
    scope: "account",
    userId: "user-1",
    nonce: "nonce-1",
    expiresAt: new Date("2026-07-15T00:10:00.000Z")
  });
});

test("GitHub App state keeps the project id only for project scope", async () => {
  const { state } = await createGitHubAppState({
    scope: "project",
    projectId: "project-1",
    userId: "user-1",
    secret: stateSecret,
    now
  });
  const payload = await verifyGitHubAppState({ state, secret: stateSecret, now });
  assert.equal(payload.scope, "project");
  if (payload.scope === "project") assert.equal(payload.projectId, "project-1");
});
```

- [ ] **Step 2: Run the state tests and verify failure**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-state.test.ts`

Expected: FAIL because `scope` is not accepted and account state still requires `projectId`.

- [ ] **Step 3: Add shared installation and callback contracts**

```ts
export type GitHubInstallationConnection = {
  installationId: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: "all" | "selected" | null;
  repositoryCount: number;
  htmlUrl: string;
};

export type ListGitHubInstallationsResponse = {
  installations: GitHubInstallationConnection[];
};

export type ListGitHubInstallationRepositoriesResponse =
  | { scope: "account" }
  | {
      scope: "project";
      projectId: string;
      repositories: GitHubRepositoryCandidate[];
    };
```

- [ ] **Step 4: Implement discriminated signed state**

Add `scope` to the JWT payload. Require a non-empty `projectId` only when `scope === "project"`; reject an account payload containing a project ID and reject any unknown scope. Preserve issuer, audience, TTL, nonce, expiry, and secret validation.

```ts
export type GitHubAppStatePayload =
  | GitHubAppStateBasePayload & { scope: "account" }
  | GitHubAppStateBasePayload & { scope: "project"; projectId: string };
```

Update every existing `createGitHubAppState` call in `source-repository-service.ts` to pass `scope: "project"`. This is a mechanical caller update only; the new account service behavior remains in Task 2.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-state.test.ts`

Expected: PASS.

Run: `pnpm --filter @sketchcatch/api typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the state contract**

```bash
git add packages/types/src/index.ts apps/api/src/source-repositories/github-app-state.ts apps/api/src/source-repositories/github-app-state.test.ts apps/api/src/source-repositories/source-repository-service.ts
git commit -m "Feat: GitHub 연결 상태 범위 분리"
```

---

### Task 2: Add Account-Scoped GitHub Installation APIs

**Files:**
- Modify: `apps/api/src/source-repositories/source-repository-service.ts`
- Modify: `apps/api/src/source-repositories/source-repository-service.test.ts`
- Modify: `apps/api/src/routes/source-repositories.ts`
- Modify: `apps/api/src/routes/source-repositories.test.ts`

**Interfaces:**
- Consumes: discriminated state and installation DTOs from Task 1.
- Produces: `createGitHubAccountInstallUrl`, `listGitHubAccountInstallations`, and scope-aware `listGitHubInstallationRepositories`.
- Produces: `POST /source-repositories/github/install-url` and `GET /source-repositories/github/installations`.
- Preserves: project repository candidate and connection endpoints.

- [ ] **Step 1: Write failing service tests**

Add tests proving:

```ts
const install = await createGitHubAccountInstallUrl(
  { accessContext, appSlug: "sketchcatch", stateSecret: stateSecret, now },
  repository
);
const state = new URL(install.installUrl).searchParams.get("state");
assert.equal((await verifyGitHubAppState({ state: state!, secret: stateSecret, now })).scope, "account");

const result = await listGitHubAccountInstallations(
  { accessContext },
  repository,
  githubAppClient
);
assert.deepEqual(result.installations, [{
  installationId: "42",
  accountLogin: "NearthYou",
  accountType: "Organization",
  repositorySelection: "selected",
  repositoryCount: 2,
  htmlUrl: "https://github.com/settings/installations/42"
}]);
```

Also assert that installations owned by a different GitHub `accountId` are filtered out, missing GitHub OAuth identity throws `GIT_APP_GITHUB_IDENTITY_REQUIRED`, and resolving account state returns `{ scope: "account" }` without calling any `SourceRepository` insert/update method.

- [ ] **Step 2: Run the service tests and verify failure**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/source-repository-service.test.ts`

Expected: FAIL because account-scoped functions do not exist.

- [ ] **Step 3: Implement account installation service behavior**

- `createGitHubAccountInstallUrl` signs `{ scope: "account", userId }` and builds the existing GitHub App installation URL.
- `listGitHubAccountInstallations` reuses `listOwnedGitHubInstallations`, obtains repository counts with `listInstallationRepositories`, maps only public installation metadata, and sorts by `accountLogin` then `installationId`.
- Existing project state creation adds `scope: "project"`.
- `listGitHubInstallationRepositories` validates installation ownership first, returns `{ scope: "account" }` for account state, and returns `{ scope: "project", projectId, repositories }` for project state.
- `verifyAndAuthorizeState` rejects account state when a project-scoped operation is requested.

- [ ] **Step 4: Write failing route tests**

```ts
const listResponse = await app.inject({
  method: "GET",
  url: "/api/source-repositories/github/installations",
  headers: authorizationHeaders
});
assert.equal(listResponse.statusCode, 200);
assert.deepEqual(listResponse.json(), { installations: [expectedInstallation] });

const installResponse = await app.inject({
  method: "POST",
  url: "/api/source-repositories/github/install-url",
  headers: authorizationHeaders
});
assert.equal(installResponse.statusCode, 201);
```

Add 401 coverage, missing GitHub identity coverage, foreign installation filtering, and an account callback response equal to `{ scope: "account" }`.

- [ ] **Step 5: Run route tests and verify failure**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/routes/source-repositories.test.ts`

Expected: FAIL with 404 for the new global endpoints.

- [ ] **Step 6: Register the global routes**

Add `GET /source-repositories/github/installations` and `POST /source-repositories/github/install-url` beside the existing GitHub routes. Use `requireActiveUserId`, the existing request context, `getGitHubAppRouteRuntime`, and `handleSourceRepositoryError`; never accept `userId`, `accountId`, or installation ownership from the request body.

- [ ] **Step 7: Run focused API verification**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-state.test.ts src/source-repositories/source-repository-service.test.ts src/routes/source-repositories.test.ts`

Expected: PASS.

Run: `pnpm --filter @sketchcatch/api typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the account APIs**

```bash
git add apps/api/src/source-repositories/source-repository-service.ts apps/api/src/source-repositories/source-repository-service.test.ts apps/api/src/routes/source-repositories.ts apps/api/src/routes/source-repositories.test.ts
git commit -m "Feat: 전역 GitHub 설치 API 추가"
```

---

### Task 3: Render GitHub Installations Below AWS Connections

**Files:**
- Modify: `apps/web/features/workspace/api.ts`
- Modify: `apps/web/features/workspace/api.test.ts`
- Create: `apps/web/app/dashboard/settings/github-account-settings.tsx`
- Modify: `apps/web/app/dashboard/settings/settings-dashboard-client.tsx`
- Modify: `apps/web/app/dashboard/dashboard-tools.module.css`
- Create: `apps/web/features/dashboard/github-account-settings.test.ts`

**Interfaces:**
- Consumes: `GET /source-repositories/github/installations` and `POST /source-repositories/github/install-url`.
- Produces: `listGitHubAccountInstallations()` and `createGitHubAccountInstallUrl()`.
- Produces: `GitHubAccountSettings` with no `projectId` prop.

- [ ] **Step 1: Write failing Web API client tests**

```ts
const installations = await listGitHubAccountInstallations();
assert.equal(String(requests[0]?.input), "/api/source-repositories/github/installations");
assert.equal(requests[0]?.init?.method, undefined);
assert.equal(installations[0]?.accountLogin, "NearthYou");

const install = await createGitHubAccountInstallUrl();
assert.equal(String(requests[1]?.input), "/api/source-repositories/github/install-url");
assert.equal(requests[1]?.init?.method, "POST");
assert.equal(install.installUrl, "https://github.com/apps/sketchcatch/installations/new");
```

- [ ] **Step 2: Run the Web API test and verify failure**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts`

Expected: FAIL because the global client functions are not exported.

- [ ] **Step 3: Implement the Web API functions**

```ts
export async function listGitHubAccountInstallations(): Promise<GitHubInstallationConnection[]> {
  const response = await apiFetch<ListGitHubInstallationsResponse>(
    "/source-repositories/github/installations"
  );
  return response.installations;
}

export async function createGitHubAccountInstallUrl(): Promise<GitHubAppInstallUrlResponse> {
  return apiFetch<GitHubAppInstallUrlResponse>(
    "/source-repositories/github/install-url",
    { method: "POST" }
  );
}
```

- [ ] **Step 4: Write failing global settings source tests**

Assert that `settings-dashboard-client.tsx` renders `<GitHubAccountSettings />` immediately after the `connectionList` section, that `github-account-settings.tsx` calls the two global client functions, and that it does not import or reference `projectId`, `SourceRepository`, `analyzeSourceRepository`, or `connectGitHubSourceRepository`.

- [ ] **Step 5: Run the global settings test and verify failure**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/dashboard/github-account-settings.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 6: Implement `GitHubAccountSettings`**

The component loads installations after authentication, renders a dedicated loading/error/empty state, and opens the signed install URL only after the user presses the button.

```tsx
<section className={styles.settingsSection} aria-labelledby="github-account-settings-title">
  <header>
    <Github size={20} />
    <div>
      <h2 id="github-account-settings-title">GitHub 계정 연결</h2>
      <p>모든 프로젝트에서 사용할 GitHub App 권한을 관리합니다.</p>
    </div>
  </header>
  {/* installation cards or explicit empty/error state */}
</section>
```

Each card displays `accountLogin`, `accountType`, `repositorySelection`, and `repositoryCount`, with an external link to `htmlUrl`. Use `rel="noreferrer"` and `target="_blank"`. Do not show a project name or repository analysis.

- [ ] **Step 7: Place and style the section**

Import `GitHubAccountSettings` into `settings-dashboard-client.tsx` and render it directly after the closing `connectionList` section. Replace the current whole-page AWS loading/error early returns with an AWS-section `ProductState`, so a failed AWS request does not hide or block the independent GitHub section. Add only settings-specific card/list/action classes to `dashboard-tools.module.css`; reuse existing colors, radii, focus visibility, and responsive breakpoints.

- [ ] **Step 8: Run focused Web verification**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/dashboard/github-account-settings.test.ts features/dashboard/dashboard-page-copy.test.ts`

Expected: PASS.

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

- [ ] **Step 9: Commit the global settings UI**

```bash
git add apps/web/features/workspace/api.ts apps/web/features/workspace/api.test.ts apps/web/app/dashboard/settings/github-account-settings.tsx apps/web/app/dashboard/settings/settings-dashboard-client.tsx apps/web/app/dashboard/dashboard-tools.module.css apps/web/features/dashboard/github-account-settings.test.ts
git commit -m "Feat: 설정에 GitHub 계정 연결 추가"
```

---

### Task 4: Keep Repository Selection Project-Scoped

**Files:**
- Modify: `apps/web/app/projects/[projectId]/settings/project-github-settings-client.tsx`
- Modify: `apps/web/app/projects/[projectId]/settings/github-repository-connection-panel.tsx`
- Modify: `apps/web/app/projects/[projectId]/settings/project-github-settings.test.ts`
- Modify: `apps/web/features/workspace/project-github-settings.test.ts`

**Interfaces:**
- Consumes: existing `listGitHubInstalledRepositories(projectId)` and `connectGitHubSourceRepository`.
- Produces: a project settings panel that can select/analyze a repository but cannot install or expand GitHub App permissions.

- [ ] **Step 1: Write failing project-boundary tests**

Assert that project settings:

```ts
assert.doesNotMatch(clientSource, /createGitHubSourceRepositoryInstallUrl|openGitHubInstallation/);
assert.doesNotMatch(panelSource, /onOpenGitHubInstallation|GitHub App 설치\/권한 추가/);
assert.match(panelSource, /href="\/dashboard\/settings"/);
assert.match(clientSource, /connectGitHubSourceRepository|analyzeSourceRepository/);
```

- [ ] **Step 2: Run the project settings tests and verify failure**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/project-github-settings.test.ts`

Expected: FAIL because the project panel still owns installation behavior.

- [ ] **Step 3: Remove installation mutation from project settings**

Delete the `createGitHubSourceRepositoryInstallUrl` import, `openGitHubInstallation`, and `onOpenGitHubInstallation` prop. Replace the installation button with a Next.js `Link` to `/dashboard/settings` labeled `GitHub 권한 관리`. Preserve repository candidate loading, project-scoped signed state, explicit repository selection, current repository summary, and analysis.

- [ ] **Step 4: Improve the no-installation state**

When repository candidates are empty after a successful load, show `먼저 설정에서 GitHub App을 연결하거나 repository 권한을 추가하세요.` beside the global settings link. Do not treat an API error as an empty installation.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/project-github-settings.test.ts`

Expected: PASS.

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the project boundary**

```bash
git add apps/web/app/projects/[projectId]/settings/project-github-settings-client.tsx apps/web/app/projects/[projectId]/settings/github-repository-connection-panel.tsx apps/web/app/projects/[projectId]/settings/project-github-settings.test.ts apps/web/features/workspace/project-github-settings.test.ts
git commit -m "Refactor: 프로젝트 GitHub 설정 역할 축소"
```

---

### Task 5: Route Account Callbacks and Permission Links to Global Settings

**Files:**
- Modify: `apps/web/app/integrations/github/callback/page.tsx`
- Modify: `apps/web/app/workspace/repository/repository-start-client.tsx`
- Modify: `apps/web/features/workspace/github-callback-route.test.ts`
- Modify: `apps/web/features/workspace/repository-start-template-recommendation.test.ts`
- Modify: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Modify: `apps/web/features/workspace/CicdConsoleScreen.tsx`

**Interfaces:**
- Consumes: discriminated `ListGitHubInstallationRepositoriesResponse` from Task 1 and scope-aware API behavior from Task 2.
- Produces: account callback redirect to `/dashboard/settings?github=connected`; project callback repository chooser remains unchanged.

- [ ] **Step 1: Write failing callback and navigation tests**

Add source assertions that the callback checks `result.scope === "account"`, calls `router.replace("/dashboard/settings?github=connected")`, and only accesses `result.projectId` and `result.repositories` after narrowing to project scope. Replace every permission-management expectation from project settings with `/dashboard/settings`; keep project repository configuration links on `/dashboard/projects/{projectId}/settings` without `?tab=github`.

- [ ] **Step 2: Run the callback/navigation tests and verify failure**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/github-callback-route.test.ts features/workspace/repository-start-template-recommendation.test.ts features/workspace/workspace-right-panel-layout.test.ts`

Expected: FAIL on the old project settings URLs and missing account callback branch.

- [ ] **Step 3: Implement scope-aware callback behavior**

```ts
const result = await listGitHubInstallationRepositories({ installationId, state });
if (result.scope === "account") {
  router.replace("/dashboard/settings?github=connected");
  return;
}
setCallbackState({
  installationId,
  projectId: result.projectId,
  repositories: result.repositories,
  state,
  status: "ready"
});
```

The account branch must not render repository candidates or call `connectGitHubSourceRepository`.

- [ ] **Step 4: Update permission and project configuration links**

- Permission installation/expansion links: `/dashboard/settings`.
- Project repository configuration links: `/dashboard/projects/${encodeURIComponent(projectId)}/settings`.
- Remove generated `?tab=github` links because the route does not implement tabs.

- [ ] **Step 5: Run focused Web tests**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/github-callback-route.test.ts features/workspace/repository-start-template-recommendation.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/project-github-settings.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit callback and link routing**

```bash
git add apps/web/app/integrations/github/callback/page.tsx apps/web/app/workspace/repository/repository-start-client.tsx apps/web/features/workspace/github-callback-route.test.ts apps/web/features/workspace/repository-start-template-recommendation.test.ts apps/web/features/workspace/workspace-right-panel-layout.test.ts apps/web/features/workspace/CicdConsoleScreen.tsx
git commit -m "Fix: GitHub 권한 링크를 전역 설정으로 이동"
```

---

### Task 6: Document Contracts and Complete Repository Verification

**Files:**
- Modify: `docs/data-models.md`
- Modify: `agent-progress.md`

**Interfaces:**
- Documents: account installation DTO, account/project state scope, and unchanged project `SourceRepository` persistence.
- Verifies: no migration, secret, lockfile, or unrelated-file changes are introduced.

- [ ] **Step 1: Update canonical data-model documentation**

Add a concise GitHub account connection subsection stating:

```md
- `GitHubInstallationConnection`은 GitHub App installation의 공개 관리 메타데이터만 반환한다.
- account scope callback은 installation 소유권만 검증하며 `SourceRepository`를 생성하지 않는다.
- project scope callback과 repository 선택 요청만 프로젝트별 `SourceRepository`를 생성·교체한다.
- account/project scope state는 상호 교환할 수 없다.
```

- [ ] **Step 2: Run all focused tests**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-state.test.ts src/source-repositories/source-repository-service.test.ts src/routes/source-repositories.test.ts`

Expected: PASS.

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/dashboard/github-account-settings.test.ts features/dashboard/dashboard-page-copy.test.ts features/workspace/project-github-settings.test.ts features/workspace/github-callback-route.test.ts features/workspace/repository-start-template-recommendation.test.ts features/workspace/workspace-right-panel-layout.test.ts`

Expected: PASS.

- [ ] **Step 3: Run required repository checks**

Run, in order:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: every command exits 0. If a command fails in an unrelated dirty file, record the exact command and failure without changing that file.

- [ ] **Step 4: Apply the clean-state checklist**

Confirm with read-only commands:

```bash
git status --short
git diff --name-only origin/dev...HEAD
git diff -- apps/api/drizzle pnpm-lock.yaml
git diff --check
```

Expected: no `apps/api/drizzle/**` or `pnpm-lock.yaml` changes from this work, no secrets in the diff, and all unrelated pre-existing changes remain preserved.

- [ ] **Step 5: Append the English progress record**

Append a concise `2026-07-15 - Move GitHub App permissions to global settings` record listing changed behavior, verification commands, no DB migration, no dependency change, and no external GitHub mutation performed during tests. Preserve all existing user changes in `agent-progress.md`.

- [ ] **Step 6: Commit documentation and progress evidence**

```bash
git add docs/data-models.md agent-progress.md
git commit -m "Docs: 전역 GitHub 연결 계약 기록"
```

- [ ] **Step 7: Final diff review**

Run:

```bash
git status --short
git log --oneline -8
git diff --stat origin/dev...HEAD
```

Expected: implementation commits are present, unrelated working-tree changes are still unstaged, and the final report can name every passing or failing check exactly.
