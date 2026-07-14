# Project Source Repository Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move project-scoped GitHub repository selection and analysis out of Project Settings into `/dashboard/projects/:projectId/repository`, while keeping account-scoped GitHub App permissions in global Settings.

**Architecture:** Add one Dashboard route dedicated to project `SourceRepository` management and redirect the legacy `settings?tab=github` URL to it. Reuse the existing API contracts, split account-installation state from project-repository state in the client, and require explicit confirmation before replacing an active repository.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node test runner through `tsx --test`, existing SketchCatch Dashboard styles and API client.

## Global Constraints

- Work on the current branch; do not create a worktree or new branch.
- Preserve unrelated dirty worktree changes and stage only files named by each task.
- GitHub App installation and permission management remain only at `/dashboard/settings`.
- Project repository selection and analysis live only at `/dashboard/projects/:projectId/repository`.
- The new page must not install GitHub Apps, change GitHub files or branches, create pull requests, or run deployments.
- Reuse the existing account-scoped GitHub installation API and project-scoped `SourceRepository` APIs; do not change shared types, API routes, database schema, migrations, dependencies, or `pnpm-lock.yaml`.
- Keep user-facing copy in Korean and code identifiers in English.
- Preserve Project Settings deployment-target and CI/CD-monitoring behavior.
- Use TDD for every behavior change and commit each independently reviewable task.

---

## File Structure

### New project repository surface

- `apps/web/app/dashboard/projects/[projectId]/repository/page.tsx`
  - Server route that passes `projectId` to the repository client.
- `apps/web/app/projects/[projectId]/repository/project-source-repository-client.tsx`
  - Owns project loading, GitHub account-connection loading, candidates, repository activation, replacement confirmation, and analysis requests.
- `apps/web/app/projects/[projectId]/repository/project-source-repository-state.ts`
  - Pure helpers for active repository selection, analysis replacement, authentication gating, and replacement-confirmation decisions.
- `apps/web/app/projects/[projectId]/repository/github-repository-connection-panel.tsx`
  - Presents candidate loading and repository selection only.
- `apps/web/app/projects/[projectId]/repository/repository-analysis-result.tsx`
  - Existing persisted-analysis presentation relocated without behavior changes.
- `apps/web/app/projects/[projectId]/repository/project-source-repository.module.css`
  - Existing repository styles plus confirmation-dialog styles.
- `apps/web/app/projects/[projectId]/repository/repository-analysis-result.module.css`
  - Existing analysis-result styles relocated without behavior changes.
- `apps/web/app/projects/[projectId]/repository/project-source-repository.test.ts`
  - Pure helper and source-contract regression coverage for the new responsibility boundary.

### Existing routes and entry points

- `apps/web/app/dashboard/projects/[projectId]/settings/page.tsx`
  - Removes repository UI and redirects the legacy `tab=github` query.
- `apps/web/features/dashboard/project-detail-client.tsx`
  - Adds separate `소스 저장소` and `프로젝트 설정` actions.
- `apps/web/components/dashboard/dashboard-shell.tsx`
  - Labels the new route `소스 저장소` in the top bar.
- `apps/web/features/workspace/CicdConsoleScreen.tsx`
  - Sends connected GitHub accounts without a project repository to the new route.
- `apps/web/app/workspace/repository/repository-start-client.tsx`
  - Imports the relocated repository helper and points private-repository guidance to the new project screen.

### Tests and tracking

- `apps/web/features/dashboard/dashboard-routes.test.ts`
- `apps/web/features/dashboard/design-dashboard.test.ts`
- `apps/web/features/dashboard/project-source-repository-navigation.test.ts`
- `apps/web/features/workspace/cicd-github-account-cta.test.ts`
- `apps/web/features/workspace/project-github-settings.test.ts`
- `apps/web/app/workspace/repository/repository-start-client.test.ts`
- `agent-progress.md`

---

### Task 1: Add the dedicated route and separate navigation

**Files:**
- Create: `apps/web/app/dashboard/projects/[projectId]/repository/page.tsx`
- Create: `apps/web/features/dashboard/project-source-repository-navigation.test.ts`
- Modify: `apps/web/app/dashboard/projects/[projectId]/settings/page.tsx`
- Modify: `apps/web/features/dashboard/project-detail-client.tsx`
- Modify: `apps/web/components/dashboard/dashboard-shell.tsx`
- Modify: `apps/web/features/dashboard/dashboard-routes.test.ts`
- Modify: `apps/web/features/dashboard/design-dashboard.test.ts`

**Interfaces:**
- Consumes: existing `ProjectGitHubSettingsClient({ projectId }: { projectId: string })` temporarily so the route works before Task 2 relocates the client.
- Produces: `/dashboard/projects/:projectId/repository`, legacy query redirect, and three distinct project-detail actions.

- [ ] **Step 1: Write the failing route and navigation tests**

Add `dashboard/projects/[projectId]/repository/page.tsx` to both route arrays. In `dashboard-routes.test.ts`, replace the Project Settings GitHub assertion and add the new route assertion:

```ts
assert.doesNotMatch(
  readAppFile("dashboard/projects/[projectId]/settings/page.tsx"),
  /ProjectGitHubSettingsClient/
);
assert.match(
  readAppFile("dashboard/projects/[projectId]/repository/page.tsx"),
  /ProjectGitHubSettingsClient/
);
```

Create `project-source-repository-navigation.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function readWorkspaceFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}

test("project detail separates source repository, project settings, and Board actions", () => {
  const source = readWorkspaceFile("features/dashboard/project-detail-client.tsx");

  assert.match(source, /\/repository`}/);
  assert.match(source, />\s*소스 저장소\s*</);
  assert.match(source, /\/settings`}/);
  assert.match(source, />\s*프로젝트 설정\s*</);
  assert.match(source, /Architecture Board 열기/);
});

test("legacy GitHub settings URL redirects to the project source repository page", () => {
  const source = readWorkspaceFile("app/dashboard/projects/[projectId]/settings/page.tsx");

  assert.match(source, /searchParams/);
  assert.match(source, /tab === "github"/);
  assert.match(source, /redirect\(`\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/repository`\)/);
});

test("dashboard shell labels the repository route as source repository", () => {
  const source = readWorkspaceFile("components/dashboard/dashboard-shell.tsx");

  assert.match(source, /pathname\.endsWith\("\/repository"\)\s*\?\s*"소스 저장소"/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/dashboard/dashboard-routes.test.ts \
  features/dashboard/design-dashboard.test.ts \
  features/dashboard/project-source-repository-navigation.test.ts
```

Expected: FAIL because the repository route and separated actions do not exist and Project Settings still renders `ProjectGitHubSettingsClient`.

- [ ] **Step 3: Add the route, redirect, labels, and entry points**

Create the route:

```tsx
import { ProjectGitHubSettingsClient } from "../../../../../projects/[projectId]/settings/project-github-settings-client";

type ProjectRepositoryPageProps = {
  readonly params: Promise<{ readonly projectId: string }>;
};

export default async function ProjectRepositoryPage({ params }: ProjectRepositoryPageProps) {
  const { projectId } = await params;

  return <ProjectGitHubSettingsClient projectId={projectId} />;
}
```

Change Project Settings to accept `searchParams`, redirect `tab=github`, remove the GitHub client import/render, and correct its description:

```tsx
import { redirect } from "next/navigation";

type ProjectSettingsPageProps = {
  readonly params: Promise<{ readonly projectId: string }>;
  readonly searchParams: Promise<{ readonly tab?: string | readonly string[] }>;
};

export default async function ProjectSettingsPage({
  params,
  searchParams
}: ProjectSettingsPageProps) {
  const [{ projectId }, { tab }] = await Promise.all([params, searchParams]);

  if (tab === "github") {
    redirect(`/dashboard/projects/${encodeURIComponent(projectId)}/repository`);
  }

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Project settings</p>
          <h1>프로젝트 설정</h1>
          <p>배포 타깃과 CI/CD 모니터링을 프로젝트 단위로 관리합니다.</p>
        </div>
      </header>
      <ProjectDeploymentTargetSettingsClient projectId={projectId} />
      <ProjectCicdMonitoringSettingsClient projectId={projectId} />
    </div>
  );
}
```

In `project-detail-client.tsx`, import `GitBranch` and render two secondary links before the existing Board link:

```tsx
<Link
  className="dashboardSecondaryAction"
  href={`/dashboard/projects/${encodeURIComponent(projectId)}/repository`}
>
  <GitBranch aria-hidden="true" size={17} />
  소스 저장소
</Link>
<Link
  className="dashboardSecondaryAction"
  href={`/dashboard/projects/${encodeURIComponent(projectId)}/settings`}
>
  <Settings aria-hidden="true" size={17} />
  프로젝트 설정
</Link>
```

Update `getDashboardPageTitle` before the settings branch:

```ts
if (pathname.startsWith("/dashboard/projects/")) {
  return pathname.endsWith("/repository")
    ? "소스 저장소"
    : pathname.endsWith("/settings")
      ? "프로젝트 설정"
      : "프로젝트 상세";
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run the Step 2 command.

Expected: all route and navigation tests PASS.

- [ ] **Step 5: Commit the route slice**

```bash
git add -- \
  'apps/web/app/dashboard/projects/[projectId]/repository/page.tsx' \
  'apps/web/app/dashboard/projects/[projectId]/settings/page.tsx' \
  apps/web/features/dashboard/project-detail-client.tsx \
  apps/web/components/dashboard/dashboard-shell.tsx \
  apps/web/features/dashboard/dashboard-routes.test.ts \
  apps/web/features/dashboard/design-dashboard.test.ts \
  apps/web/features/dashboard/project-source-repository-navigation.test.ts
git commit -m "Feat: 프로젝트 소스 저장소 경로 추가"
```

---

### Task 2: Relocate repository state and distinguish account connection

**Files:**
- Create: `apps/web/app/projects/[projectId]/repository/project-source-repository-state.ts`
- Create: `apps/web/app/projects/[projectId]/repository/project-source-repository-client.tsx`
- Create: `apps/web/app/projects/[projectId]/repository/project-source-repository.test.ts`
- Modify: `apps/web/app/dashboard/projects/[projectId]/repository/page.tsx`
- Modify: `apps/web/app/workspace/repository/repository-start-client.tsx`

**Interfaces:**
- Consumes: `listGitHubAccountInstallations(): Promise<GitHubInstallationConnection[]>`, `getProject`, `listSourceRepositories`, and existing analysis APIs.
- Produces: `ProjectSourceRepositoryClient`, `findActiveGitHubRepository`, `applyRepositoryAnalysis`, `canRunRepositoryAnalysis`, `shouldLoadProjectSourceRepository`, and `shouldConfirmRepositoryChange`.

- [ ] **Step 1: Write failing helper and responsibility tests**

Create the test by carrying over the existing repository-analysis cases and adding these cases:

```ts
test("source repository waits for authentication before loading project data", () => {
  assert.equal(shouldLoadProjectSourceRepository("loading"), false);
  assert.equal(shouldLoadProjectSourceRepository("unauthenticated"), false);
  assert.equal(shouldLoadProjectSourceRepository("authenticated"), true);
});

test("an active repository requires confirmation only when selecting a different repository", () => {
  const active = createRepository();
  const same = createCandidate({ githubRepositoryId: active.githubRepositoryId });
  const different = createCandidate({ githubRepositoryId: "repository-2" });

  assert.equal(shouldConfirmRepositoryChange(null, different), false);
  assert.equal(shouldConfirmRepositoryChange(active, same), false);
  assert.equal(shouldConfirmRepositoryChange(active, different), true);
});

test("project source repository owns selection and analysis but not GitHub App installation", () => {
  const clientSource = readLocalFile("project-source-repository-client.tsx");

  assert.match(clientSource, /listGitHubAccountInstallations/);
  assert.match(clientSource, /connectGitHubSourceRepository|analyzeSourceRepository/);
  assert.doesNotMatch(clientSource, /createGitHubAccountInstallUrl|openGitHubInstallation/);
  assert.match(clientSource, /href="\/dashboard\/settings#github-account-settings-title"/);
});
```

Use a `createCandidate` fixture with the exact `GitHubInstalledRepositoryCandidate` fields already used by API tests.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  'app/projects/[projectId]/repository/project-source-repository.test.ts'
```

Expected: FAIL because the repository directory and exported helpers do not exist.

- [ ] **Step 3: Create the pure state module**

Move the existing pure helpers without changing analysis semantics, rename the authentication helper, and add replacement confirmation:

```ts
export function shouldLoadProjectSourceRepository(authStatus: string): boolean {
  return authStatus === "authenticated";
}

export function shouldConfirmRepositoryChange(
  activeRepository: SourceRepository | null,
  candidate: GitHubInstalledRepositoryCandidate
): boolean {
  return Boolean(
    activeRepository &&
      activeRepository.githubRepositoryId !== candidate.githubRepositoryId
  );
}
```

Keep these existing signatures unchanged:

```ts
export function findActiveGitHubRepository(
  repositories: readonly SourceRepository[]
): SourceRepository | null;

export function canRunRepositoryAnalysis(
  repository: SourceRepository | null,
  analysisState: RequestState
): repository is SourceRepository;

export function applyRepositoryAnalysis(
  repositories: readonly SourceRepository[],
  result: AnalyzeSourceRepositoryResponse
): SourceRepository[];
```

- [ ] **Step 4: Create the client with independent project and account loaders**

Start from the existing client, rename the component, and replace the single loader with two independent operations:

```ts
const [accountState, setAccountState] = useState<RequestState>("loading");
const [hasGitHubAccountConnection, setHasGitHubAccountConnection] = useState<boolean | null>(null);
const [accountErrorMessage, setAccountErrorMessage] = useState("");

async function loadGitHubAccountConnection(): Promise<void> {
  setAccountState("loading");
  setAccountErrorMessage("");

  try {
    const installations = await listGitHubAccountInstallations();
    setHasGitHubAccountConnection(installations.length > 0);
    setAccountState("idle");
  } catch (error) {
    setHasGitHubAccountConnection(null);
    setAccountState("error");
    setAccountErrorMessage(
      getApiErrorMessage(error, "GitHub 계정 연결 상태를 불러오지 못했습니다.")
    );
  }
}
```

The authenticated effect invokes both loaders without coupling their failure states:

```ts
useEffect(() => {
  if (!shouldLoadProjectSourceRepository(authStatus)) return;

  void loadProjectRepository();
  void loadGitHubAccountConnection();
}, [authStatus, projectId]);
```

Render a Dashboard page stack and header before the repository panel:

```tsx
<div className="dashboardRouteStack">
  <header className="dashboardPageHeader">
    <div>
      <p className="dashboardEyebrow">Source repository</p>
      <h1>소스 저장소</h1>
      <p>이 프로젝트의 아키텍처 분석과 Git/CI/CD에 사용할 repository를 선택합니다.</p>
    </div>
  </header>
  {/* repository section */}
</div>
```

When `hasGitHubAccountConnection === false`, do not render the candidate loader. Render:

```tsx
<div className="dashboardStateBand">
  <strong>GitHub 계정 연결이 필요합니다.</strong>
  <p>전역 설정에서 GitHub App을 연결한 뒤 프로젝트 repository를 선택할 수 있습니다.</p>
  <Link
    className="dashboardPrimaryAction"
    href="/dashboard/settings#github-account-settings-title"
  >
    GitHub 계정 연결
  </Link>
</div>
```

If `accountState === "error"`, show `accountErrorMessage` with `role="alert"` and a retry button that calls only `loadGitHubAccountConnection`. Project and saved analysis content remain visible.

- [ ] **Step 5: Point the route and repository-start helper import to the new module**

The new route imports:

```ts
import { ProjectSourceRepositoryClient } from "../../../../../projects/[projectId]/repository/project-source-repository-client";
```

`repository-start-client.tsx` imports `applyRepositoryAnalysis` and `findActiveGitHubRepository` from:

```ts
../../projects/[projectId]/repository/project-source-repository-state
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  'app/projects/[projectId]/repository/project-source-repository.test.ts' \
  app/workspace/repository/repository-start-client.test.ts \
  features/dashboard/dashboard-routes.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the state-boundary slice**

```bash
git add -- \
  'apps/web/app/dashboard/projects/[projectId]/repository/page.tsx' \
  'apps/web/app/projects/[projectId]/repository/project-source-repository-client.tsx' \
  'apps/web/app/projects/[projectId]/repository/project-source-repository-state.ts' \
  'apps/web/app/projects/[projectId]/repository/project-source-repository.test.ts' \
  apps/web/app/workspace/repository/repository-start-client.tsx
git commit -m "Refactor: 프로젝트 저장소 연결 책임 분리"
```

---

### Task 3: Add candidate selection and safe repository replacement

**Files:**
- Create: `apps/web/app/projects/[projectId]/repository/github-repository-connection-panel.tsx`
- Create: `apps/web/app/projects/[projectId]/repository/project-source-repository.module.css`
- Modify: `apps/web/app/projects/[projectId]/repository/project-source-repository-client.tsx`
- Modify: `apps/web/app/projects/[projectId]/repository/project-source-repository.test.ts`

**Interfaces:**
- Consumes: `shouldConfirmRepositoryChange` from Task 2 and existing `connectGitHubSourceRepository`.
- Produces: collapsed candidate selection, `pendingRepository`, and an accessible confirmation dialog that is the only replacement path for an active repository.

- [ ] **Step 1: Write failing source-contract tests for collapsed candidates and confirmation**

Add:

```ts
test("active repository candidates stay collapsed until the user requests a change", () => {
  const source = readLocalFile("project-source-repository-client.tsx");

  assert.match(source, /showRepositoryCandidates/);
  assert.match(source, /저장소 변경/);
  assert.match(source, /setShowRepositoryCandidates\(true\)/);
});

test("replacing an active repository requires explicit confirmation", () => {
  const source = readLocalFile("project-source-repository-client.tsx");

  assert.match(source, /pendingRepository/);
  assert.match(source, /shouldConfirmRepositoryChange/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /분석 및 Git\/CI\/CD에서 사용할 프로젝트 소스가 변경됩니다/);
  assert.match(source, /confirmRepositoryChange/);
});

test("repository candidate panel explains why archived repositories are disabled", () => {
  const source = readLocalFile("github-repository-connection-panel.tsx");

  assert.match(source, /Archived repository는 연결할 수 없습니다/);
  assert.match(source, /repository\.archived/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the Task 2 Step 2 command.

Expected: FAIL because the new panel and confirmation states do not exist.

- [ ] **Step 3: Create the candidate panel without account-installation actions**

Relocate the existing candidate presentation, remove the global permission-management link from the candidate actions, and add explicit candidate details:

```tsx
<article key={`${repository.installationId}-${repository.githubRepositoryId}`}>
  <span>{repository.installationAccountLogin}</span>
  <strong>{repository.fullName}</strong>
  <small>
    {repository.defaultBranch} · {repository.visibility === "private" ? "Private" : repository.visibility}
  </small>
  {repository.archived ? (
    <p role="status">Archived repository는 연결할 수 없습니다.</p>
  ) : null}
  <button
    className="dashboardSecondaryButton"
    disabled={actionState === "loading" || repository.archived || repository.connectedStatus === "active"}
    onClick={() => onSelectRepository(repository)}
    type="button"
  >
    {repository.connectedStatus === "active" ? "연결됨" : "이 repository 선택"}
  </button>
</article>
```

The panel exposes these exact props:

```ts
type GitHubRepositoryConnectionPanelProps = {
  readonly actionState: RequestState;
  readonly installationState: string;
  readonly installedRepositories: readonly GitHubInstalledRepositoryCandidate[];
  readonly onLoadInstalledRepositories: () => void;
  readonly onSelectRepository: (repository: GitHubInstalledRepositoryCandidate) => void;
  readonly repositoryState: RequestState;
};
```

- [ ] **Step 4: Gate replacements behind confirmation**

Add:

```ts
const [pendingRepository, setPendingRepository] =
  useState<GitHubInstalledRepositoryCandidate | null>(null);
const [showRepositoryCandidates, setShowRepositoryCandidates] = useState(!activeRepository);
const repositoryChangeTriggerRef = useRef<HTMLButtonElement | null>(null);

function requestRepositoryConnection(repository: GitHubInstalledRepositoryCandidate): void {
  if (shouldConfirmRepositoryChange(activeRepository, repository)) {
    setPendingRepository(repository);
    return;
  }

  void connectRepository(repository);
}

async function confirmRepositoryChange(): Promise<void> {
  if (!pendingRepository) return;
  const repository = pendingRepository;
  setPendingRepository(null);
  await connectRepository(repository);
}

function closeRepositoryChangeDialog(): void {
  setPendingRepository(null);
  requestAnimationFrame(() => repositoryChangeTriggerRef.current?.focus());
}
```

Render candidates immediately only without an active repository. With an active repository, render `저장소 변경`; clicking it expands candidates and stores the trigger ref.

Render the dialog only when `pendingRepository` exists:

```tsx
<div
  aria-labelledby="repository-change-dialog-title"
  aria-modal="true"
  className={styles.dialogOverlay}
  role="dialog"
>
  <div className={styles.dialog}>
    <h3 id="repository-change-dialog-title">소스 저장소를 변경할까요?</h3>
    <p>분석 및 Git/CI/CD에서 사용할 프로젝트 소스가 변경됩니다.</p>
    <p>GitHub의 파일, branch, 권한 자체는 변경되지 않습니다.</p>
    <div className="settingsActionRow">
      <button className="dashboardSecondaryButton" onClick={closeRepositoryChangeDialog} type="button">
        취소
      </button>
      <button className="dashboardTopbarAction" onClick={() => void confirmRepositoryChange()} type="button">
        변경 확인
      </button>
    </div>
  </div>
</div>
```

Add an effect that closes the dialog on `Escape` when `actionState !== "loading"`, and focus the dialog heading or first button when it opens. Disable cancel and confirm during the connection request.

- [ ] **Step 5: Add bounded responsive styles**

Use existing Dashboard tokens and add only:

```css
.dialogOverlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.42);
}

.dialog {
  width: min(100%, 520px);
  display: grid;
  gap: 16px;
  padding: 24px;
  border: 1px solid #dcdee0;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.14);
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  'app/projects/[projectId]/repository/project-source-repository.test.ts' \
  features/dashboard/project-source-repository-navigation.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit safe selection behavior**

```bash
git add -- \
  'apps/web/app/projects/[projectId]/repository/github-repository-connection-panel.tsx' \
  'apps/web/app/projects/[projectId]/repository/project-source-repository-client.tsx' \
  'apps/web/app/projects/[projectId]/repository/project-source-repository.module.css' \
  'apps/web/app/projects/[projectId]/repository/project-source-repository.test.ts'
git commit -m "Feat: 소스 저장소 변경 확인 추가"
```

---

### Task 4: Relocate analysis presentation and update all repository links

**Files:**
- Create: `apps/web/app/projects/[projectId]/repository/repository-analysis-result.tsx`
- Create: `apps/web/app/projects/[projectId]/repository/repository-analysis-result.module.css`
- Modify: `apps/web/app/projects/[projectId]/repository/project-source-repository-client.tsx`
- Modify: `apps/web/app/projects/[projectId]/repository/project-source-repository.test.ts`
- Modify: `apps/web/features/workspace/CicdConsoleScreen.tsx`
- Modify: `apps/web/features/workspace/cicd-github-account-cta.test.ts`
- Modify: `apps/web/features/workspace/project-github-settings.test.ts`
- Modify: `apps/web/app/workspace/repository/repository-start-client.tsx`
- Modify: `apps/web/app/workspace/repository/repository-start-client.test.ts`
- Delete: `apps/web/app/projects/[projectId]/settings/project-github-settings-client.tsx`
- Delete: `apps/web/app/projects/[projectId]/settings/project-github-settings-state.ts`
- Delete: `apps/web/app/projects/[projectId]/settings/github-repository-connection-panel.tsx`
- Delete: `apps/web/app/projects/[projectId]/settings/repository-analysis-result.tsx`
- Delete: `apps/web/app/projects/[projectId]/settings/project-github-settings.module.css`
- Delete: `apps/web/app/projects/[projectId]/settings/repository-analysis-result.module.css`
- Delete: `apps/web/app/projects/[projectId]/settings/project-github-settings.test.ts`

**Interfaces:**
- Consumes: the new route/client/state from Tasks 1–3.
- Produces: no remaining project-repository implementation under `settings`, and correct routing from CI/CD and repository-start flows.

- [ ] **Step 1: Update failing link and boundary assertions**

In `cicd-github-account-cta.test.ts`, preserve the existing global Settings assertions and replace the project Settings expectation:

```ts
test("CI/CD sends connected GitHub accounts without a repository to source repository", () => {
  assert.match(source, /GitHub 저장소 연결이 필요합니다\./);
  assert.match(source, /프로젝트 소스 저장소 열기/);
  assert.match(
    source,
    /\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/repository/
  );
  assert.doesNotMatch(source, /settings\?tab=github/);
});
```

Change `features/workspace/project-github-settings.test.ts` into a source-boundary regression test:

```ts
test("project settings no longer owns repository connection", () => {
  const settingsSource = readWorkspaceFile("app/dashboard/projects/[projectId]/settings/page.tsx");
  const repositorySource = readWorkspaceFile(
    "app/projects/[projectId]/repository/project-source-repository-client.tsx"
  );

  assert.doesNotMatch(settingsSource, /ProjectGitHubSettingsClient|connectGitHubSourceRepository|analyzeSourceRepository/);
  assert.match(repositorySource, /connectGitHubSourceRepository|analyzeSourceRepository/);
});
```

Add a repository-start assertion that private-repository guidance includes `/dashboard/projects/${projectId}/repository` rather than `프로젝트 환경설정`.

- [ ] **Step 2: Run the link tests and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/cicd-github-account-cta.test.ts \
  features/workspace/project-github-settings.test.ts \
  app/workspace/repository/repository-start-client.test.ts
```

Expected: FAIL while CI/CD and repository-start still reference the old location.

- [ ] **Step 3: Relocate analysis presentation without changing behavior**

Create the new analysis component and CSS with the existing content, updating only relative imports and the module path. Update the new client import to:

```ts
import { RepositoryAnalysisResult } from "./repository-analysis-result";
```

Do not alter result copy, Template recommendation behavior, or the Architecture Draft handoff URL.

- [ ] **Step 4: Update CI/CD and repository-start links**

In `CicdConsoleScreen.tsx`, keep the account settings destination already present in the dirty worktree, and replace only the project destination:

```ts
const repositoryHref = `/dashboard/projects/${encodeURIComponent(projectId)}/repository`;
```

Use `repositoryHref` only for the state where `hasGitHubAccountConnection === true` and `repository === null`. Change its label to `프로젝트 소스 저장소 열기`. Do not change the monitoring-validation link that correctly points to Project Settings.

In `repository-start-client.tsx`, create:

```ts
const projectRepositoryHref = `/dashboard/projects/${encodeURIComponent(projectId)}/repository`;
```

Use it for private-repository connection guidance. Keep `githubSettingsHref = "/dashboard/settings"` only for account permission management.

- [ ] **Step 5: Remove obsolete Settings repository modules**

After all imports point to the repository directory, delete the seven obsolete files listed above. Verify no source path remains:

```bash
rg -n "projects/\[projectId\]/settings/project-github|settings\?tab=github|ProjectGitHubSettingsClient" apps/web
```

Expected: no production source matches. A redirect test may still contain the literal legacy query.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/dashboard/dashboard-routes.test.ts \
  features/dashboard/project-source-repository-navigation.test.ts \
  'app/projects/[projectId]/repository/project-source-repository.test.ts' \
  features/workspace/cicd-github-account-cta.test.ts \
  features/workspace/project-github-settings.test.ts \
  app/workspace/repository/repository-start-client.test.ts \
  features/workspace/repository-start-template-recommendation.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the completed responsibility move**

```bash
git add -- \
  'apps/web/app/projects/[projectId]/repository' \
  'apps/web/app/projects/[projectId]/settings' \
  apps/web/features/workspace/CicdConsoleScreen.tsx \
  apps/web/features/workspace/cicd-github-account-cta.test.ts \
  apps/web/features/workspace/project-github-settings.test.ts \
  apps/web/app/workspace/repository/repository-start-client.tsx \
  apps/web/app/workspace/repository/repository-start-client.test.ts
git commit -m "Refactor: 저장소 연결을 전용 화면으로 이동"
```

---

### Task 5: Verify the complete flow and record evidence

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: the completed source repository route and existing API contracts.
- Produces: reproducible verification evidence without API, DB, dependency, or cloud mutation.

- [ ] **Step 1: Run the focused project repository suite**

Run the Task 4 Step 6 command.

Expected: all focused tests PASS.

- [ ] **Step 2: Run the complete Web test suite**

```bash
pnpm --filter @sketchcatch/web test
```

Expected: all Web tests PASS with zero failures.

- [ ] **Step 3: Run required repository checks**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: every command exits 0. If a failure belongs to an unrelated dirty file, capture the exact file and error instead of changing unrelated work.

- [ ] **Step 4: Perform browser route verification**

Use the `playwright` skill. Verify:

- `/dashboard/projects/:projectId/repository` renders the `소스 저장소` page when authenticated.
- `/dashboard/projects/:projectId/settings` contains no repository connection section.
- `/dashboard/projects/:projectId/settings?tab=github` lands on the repository route.
- Project detail exposes separate source repository, project settings, and Board actions.
- At 1440×900 and 390×844, the candidate grid and confirmation dialog have no horizontal overflow.

If local authentication redirects to login, report that limitation and rely on source, test, typecheck, and build evidence; do not create credentials or alter auth state.

- [ ] **Step 5: Confirm no contract or migration drift**

```bash
git diff -- apps/api packages/types apps/api/drizzle pnpm-lock.yaml
```

Expected: no diff produced by this work.

- [ ] **Step 6: Record the result in `agent-progress.md`**

Add one concise English session record containing:

```md
### 2026-07-15 - Move project repository connection to a dedicated page

- Moved project-scoped GitHub repository selection and analysis from Project Settings to `/dashboard/projects/:projectId/repository`; legacy `settings?tab=github` links redirect to the new route.
- Kept account-scoped GitHub App installation in global Settings and added explicit confirmation before replacing an active project repository.
- Verification: record the numeric focused-test and complete Web-suite totals reported by the commands, followed by `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- Browser verification: record either the authenticated routes and viewport sizes inspected or the exact login redirect limitation.
- No API, database migration, dependency, lockfile, GitHub mutation, Git handoff, deployment, or cloud mutation was performed.
```

- [ ] **Step 7: Run the final harness check**

```bash
pnpm harness:check
```

Expected: `Harness check passed.`

- [ ] **Step 8: Commit only the progress record if it can be isolated from user changes**

If `agent-progress.md` already contains unrelated unstaged edits, leave the new record unstaged and report it. Otherwise:

```bash
git add -- agent-progress.md
git commit -m "Docs: 소스 저장소 화면 검증 기록"
```

Do not stage any other dirty file.

---

## Completion Criteria

- Project Settings renders deployment-target and CI/CD-monitoring settings, but no repository connection or analysis UI.
- `/dashboard/projects/:projectId/repository` owns project repository selection, replacement, and analysis.
- GitHub account installation remains global and is not duplicated on the project page.
- Existing `settings?tab=github` links redirect to the new route.
- Repository replacement requires explicit confirmation; initial connection remains a single explicit selection.
- CI/CD and repository-start guidance point to the correct global or project destination based on responsibility.
- Focused tests, complete Web tests, harness, lint, typecheck, build, and diff checks are reported truthfully.
- No API, shared type, DB migration, dependency, lockfile, GitHub, deployment, or cloud mutation occurs.
