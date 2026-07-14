# Repository CI/CD Resume and ECS Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 분석한 GitHub Repository를 다시 선택·분석하지 않고 CI/CD에 자동 연결한 뒤 ECS Fargate 배포 타깃과 GitOps 감시 설정을 필수 저장하고 같은 분석 결과로 복귀한다.

**Architecture:** 공개 분석 응답에 실제 branch head SHA를 추가하고, target Repository와 일회성 resume key를 GitHub App 서명 state에 묶는다. Web은 구조화된 분석 UI 상태를 30분짜리 `sessionStorage` record로 보존하며 callback은 target Repository만 자동 연결한다. 연결 후 기존 설정 컴포넌트를 callback flow에 조합하고, 두 저장이 성공하면 resume record를 소비해 분석 화면을 복원한다.

**Tech Stack:** TypeScript, Next.js App Router, React, Fastify, Zod, jose JWT, Node test runner via `tsx`, PostgreSQL JSONB-backed deployment target contracts.

## Global Constraints

- 실제 Terraform Plan/Apply, AWS resource mutation, GitHub PR 또는 workflow mutation을 실행하지 않는다.
- GitHub state, installation token, OAuth token, credential과 원본 Repository 파일 내용을 browser storage, DB, 로그 또는 문서에 저장하지 않는다.
- `sessionStorage` resume record는 schema version 1, 30분 TTL, project/repository/resume-key 일치 검증 후 한 번만 소비한다.
- callback은 분석한 target Repository만 자동 연결하며 다른 Repository 선택 목록을 표시하지 않는다.
- `ECS Fargate container app` 기본값만 추가하고 다른 Template 자동 기본값은 만들지 않는다.
- 기존 저장 `ProjectDeploymentTarget`은 자동 기본값으로 덮어쓰지 않는다.
- Board 생성 전 `outputUrl`은 `null`이며 실제 application release는 안전한 HTTPS URL이 없으면 fail closed 처리한다.
- DB migration은 만들지 않는다. `runtime_config` JSONB 안의 nullable field 계약만 변경한다.
- 현재 작업트리의 기존 `agent-progress.md`, `apps/web/next-env.d.ts` 변경을 커밋에 포함하지 않는다.

---

### Task 1: Public Repository Revision Contract

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/routes/ai.ts`
- Create: `apps/api/src/routes/public-repository-analysis-revision.test.ts`

**Interfaces:**
- Produces: `SourceRepositoryAnalysisResult.repositoryRevision: string`
- Produces: `resolvePublicRepositoryRevision(branches, selectedBranch): string | null`
- Consumes later: ECS target defaults and resume validation use the exact commit SHA.

- [ ] **Step 1: Write the failing contract and branch-resolution tests**

```ts
test("public Repository analysis resolves the selected branch head SHA", () => {
  assert.equal(
    resolvePublicRepositoryRevision(
      [
        { name: "main", revision: "a".repeat(40) },
        { name: "develop", revision: "b".repeat(40) }
      ],
      "develop"
    ),
    "b".repeat(40)
  );
});

test("public Repository analysis rejects a branch without a commit SHA", () => {
  assert.equal(resolvePublicRepositoryRevision([{ name: "main", revision: null }], "main"), null);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/routes/public-repository-analysis-revision.test.ts`

Expected: FAIL because `resolvePublicRepositoryRevision` is not exported.

- [ ] **Step 3: Add the shared field and parse GitHub branch revisions**

```ts
export type SourceRepositoryAnalysisResult = {
  repositoryUrl: string;
  repositoryRevision: string;
  defaultBranch: string;
  // existing fields remain unchanged
};

export function resolvePublicRepositoryRevision(
  branches: readonly { name: string; revision: string | null }[],
  selectedBranch: string
): string | null {
  const revision = branches.find((branch) => branch.name === selectedBranch)?.revision ?? null;
  return revision && /^(?:[a-f\d]{40}|[a-f\d]{64})$/iu.test(revision)
    ? revision.toLowerCase()
    : null;
}
```

Update `fetchPublicRepositoryBranchInventory` to read `branch.commit.sha`. Return a controlled analysis error when the selected branch has no valid SHA; never use the branch name as revision.

- [ ] **Step 4: Run focused API test and typecheck**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/routes/public-repository-analysis-revision.test.ts && pnpm --filter @sketchcatch/api typecheck && pnpm --filter @sketchcatch/types typecheck`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/types/src/index.ts apps/api/src/routes/ai.ts apps/api/src/routes/public-repository-analysis-revision.test.ts
git commit -m "Feat: 공개 Repository revision 계약 추가"
```

### Task 2: Target-Bound GitHub App State

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/source-repositories/github-app-state.ts`
- Modify: `apps/api/src/source-repositories/github-app-state.test.ts`
- Modify: `apps/api/src/source-repositories/source-repository-service.ts`
- Modify: `apps/api/src/routes/source-repositories.ts`
- Modify: `apps/web/features/workspace/api.ts`
- Create: `apps/api/src/source-repositories/github-target-connection.test.ts`

**Interfaces:**
- Produces: `CreateGitHubProjectInstallUrlRequest`
- Produces: `GitHubProjectConnectionTarget`
- Produces: project callback response fields `targetRepository` and `resumeKey`
- Produces: `findTargetGitHubRepository(repositories, target)` for exact automatic matching.

- [ ] **Step 1: Extend the existing state test first**

```ts
test("GitHub App project state binds the analyzed Repository and resume key", async () => {
  const { state } = await createGitHubAppState({
    scope: "project",
    projectId: "project-1",
    userId: "user-1",
    targetRepository: { owner: "NearthYou", name: "SketchCatch" },
    resumeKey: "resume-12345678",
    secret: stateSecret,
    now,
    generateNonce: () => "nonce-target"
  });

  const payload = await verifyGitHubAppState({ state, secret: stateSecret, now });
  assert.equal(payload.scope, "project");
  assert.deepEqual(payload.targetRepository, { owner: "nearthyou", name: "sketchcatch" });
  assert.equal(payload.resumeKey, "resume-12345678");
});
```

- [ ] **Step 2: Run state test and verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-state.test.ts`

Expected: FAIL because project state does not accept target fields.

- [ ] **Step 3: Implement signed target fields and request validation**

```ts
export type GitHubProjectConnectionTarget = {
  owner: string;
  name: string;
};

export type CreateGitHubProjectInstallUrlRequest = {
  repositoryUrl: string;
  resumeKey: string;
};
```

Normalize owner/name to lowercase before signing. Validate `resumeKey` with `z.string().trim().min(8).max(128)` and validate the Repository URL server-side as `https://github.com/{owner}/{name}` with no credential, query or fragment.

- [ ] **Step 4: Write the failing exact-target service test**

```ts
test("target matching returns only the analyzed GitHub Repository", () => {
  const target = findTargetGitHubRepository(
    [candidate("NearthYou/SketchCatch"), candidate("NearthYou/Other")],
    { owner: "nearthyou", name: "sketchcatch" }
  );
  assert.equal(target?.fullName, "NearthYou/SketchCatch");
});

test("target matching does not fall back to another Repository", () => {
  assert.equal(
    findTargetGitHubRepository([candidate("NearthYou/Other")], {
      owner: "nearthyou",
      name: "sketchcatch"
    }),
    null
  );
});

test("connecting the same active target is idempotent", async () => {
  const existing = sourceRepositoryRecord({
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "repository-1"
  });
  const repository = sourceRepositoryFixture({ existing: [existing] });

  const connected = await connectGitHubSourceRepository(
    connectInput({
      installationId: "installation-1",
      githubRepositoryId: "repository-1"
    }),
    repository,
    githubClient([candidate("NearthYou/SketchCatch", "repository-1")])
  );

  assert.equal(connected.id, existing.id);
  assert.equal(repository.createdRecords.length, 0);
});
```

- [ ] **Step 5: Run the target test and verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-target-connection.test.ts`

Expected: FAIL because `findTargetGitHubRepository` does not exist.

- [ ] **Step 6: Implement project install and callback response wiring**

`createGitHubInstallUrl` signs `targetRepository` and `resumeKey`. `listGitHubInstallationRepositories` returns them only for project scope. Keep account scope response unchanged. Export the exact-match helper and do not introduce fuzzy name matching. Before creating a new active row, return the existing active row when project ID, installation ID and GitHub Repository ID already match so callback refresh cannot create duplicate connection history.

- [ ] **Step 7: Run focused tests and typechecks**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/github-app-state.test.ts src/source-repositories/github-target-connection.test.ts && pnpm --filter @sketchcatch/api typecheck && pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add packages/types/src/index.ts apps/api/src/source-repositories/github-app-state.ts apps/api/src/source-repositories/github-app-state.test.ts apps/api/src/source-repositories/source-repository-service.ts apps/api/src/source-repositories/github-target-connection.test.ts apps/api/src/routes/source-repositories.ts apps/web/features/workspace/api.ts
git commit -m "Feat: 분석 Repository를 GitHub state에 고정"
```

### Task 3: One-Time Repository Analysis Resume State

**Files:**
- Create: `apps/web/app/workspace/repository/repository-analysis-resume.ts`
- Create: `apps/web/app/workspace/repository/repository-analysis-resume.test.ts`
- Modify: `apps/web/app/workspace/repository/repository-start-client.tsx`
- Modify: `apps/web/app/workspace/repository/repository-start-client.test.ts`

**Interfaces:**
- Produces: `createRepositoryAnalysisResumeKey(): string`
- Produces: `writeRepositoryAnalysisResume(storage, state): void`
- Produces: `readRepositoryAnalysisResume(storage, input): RepositoryAnalysisResumeState | null`
- Produces: `consumeRepositoryAnalysisResume(storage, input): RepositoryAnalysisResumeState | null`

- [ ] **Step 1: Write resume TTL and identity tests**

```ts
test("resume state round-trips once for the same project and Repository", () => {
  const storage = new MemoryStorage();
  writeRepositoryAnalysisResume(storage, fixtureResumeState);

  assert.deepEqual(
    consumeRepositoryAnalysisResume(storage, {
      resumeKey: fixtureResumeState.resumeKey,
      projectId: fixtureResumeState.projectId,
      repositoryUrl: fixtureResumeState.repositoryUrl,
      now: new Date("2026-07-15T00:10:00.000Z")
    }),
    fixtureResumeState
  );
  assert.equal(readStoredValue(storage, fixtureResumeState.resumeKey), null);
});

test("resume state rejects records older than 30 minutes", () => {
  const storage = new MemoryStorage();
  writeRepositoryAnalysisResume(storage, fixtureResumeState);
  assert.equal(
    consumeRepositoryAnalysisResume(storage, {
      resumeKey: fixtureResumeState.resumeKey,
      projectId: fixtureResumeState.projectId,
      repositoryUrl: fixtureResumeState.repositoryUrl,
      now: new Date("2026-07-15T00:31:00.000Z")
    }),
    null
  );
});
```

- [ ] **Step 2: Run resume test and verify RED**

Run: `pnpm --filter @sketchcatch/web exec tsx --test app/workspace/repository/repository-analysis-resume.test.ts`

Expected: FAIL because the resume module does not exist.

- [ ] **Step 3: Implement versioned storage without secrets**

Use key prefix `sketchcatch:repository-analysis-resume:v1:`. Parse JSON defensively, require `schemaVersion === 1`, a valid ISO `createdAt`, 30-minute TTL, exact `projectId`, normalized GitHub Repository URL and resume key. Delete invalid, expired and consumed records.

- [ ] **Step 4: Wire save-before-install and restore-on-return**

Before `window.location.assign`, save `publicAnalysis`, selected template, branch, answers, stage and deployment type. Call:

```ts
await createGitHubSourceRepositoryInstallUrl(projectId, {
  repositoryUrl: publicAnalysis.repositoryUrl,
  resumeKey
});
```

When safe return query parameters contain `resumeKey`, consume the matching record after active Repository load and restore React state without calling `analyzePublicSourceRepository` or `analyzeSourceRepository`.

- [ ] **Step 5: Run focused Web tests and typecheck**

Run: `pnpm --filter @sketchcatch/web exec tsx --test app/workspace/repository/repository-analysis-resume.test.ts app/workspace/repository/repository-start-client.test.ts && pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/web/app/workspace/repository/repository-analysis-resume.ts apps/web/app/workspace/repository/repository-analysis-resume.test.ts apps/web/app/workspace/repository/repository-start-client.tsx apps/web/app/workspace/repository/repository-start-client.test.ts
git commit -m "Feat: Repository 분석 복귀 상태 보존"
```

### Task 4: ECS Fargate Defaults and Nullable Pre-Deployment URL

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/project-release-ledger-contract.test.ts`
- Modify: `apps/api/src/routes/project-release-ledger.ts`
- Modify: `apps/api/src/releases/project-release-ledger-service.ts`
- Modify: `apps/api/src/deployments/direct-application-release-service.ts`
- Modify: `apps/api/src/git-cicd/git-cicd-handoff-service.ts`
- Modify: `apps/api/src/git-cicd/git-cicd-workflows.ts`
- Create: `apps/web/app/projects/[projectId]/settings/project-deployment-target-state.test.ts`
- Modify: `apps/web/app/projects/[projectId]/settings/project-deployment-target-state.ts`
- Modify: `apps/web/app/projects/[projectId]/settings/project-deployment-target-settings-client.tsx`

**Interfaces:**
- Produces: `EcsFargateDeploymentDefaultsInput`
- Produces: `createEcsFargateDeploymentDefaults(input): Partial<ProjectDeploymentTargetDraft>`
- Produces: `EcsFargateRuntimeConfig.outputUrl: string | null`
- Produces: explicit `DEPLOYMENT_OUTPUT_URL_REQUIRED` execution gate.

- [ ] **Step 1: Write failing deterministic-default tests**

```ts
test("ECS defaults use project slug and analyzed Dockerfile evidence", () => {
  assert.deepEqual(
    createEcsFargateDeploymentDefaults({
      projectName: "Audience Live Check",
      repositoryRevision: "a".repeat(40),
      sourceRoot: "apps/api",
      dockerfilePath: "apps/api/Dockerfile"
    }),
    {
      runtimeTargetKind: "ecs_fargate",
      sourceRoot: "apps/api",
      evidencePath: "apps/api/Dockerfile",
      commitSha: "a".repeat(40),
      codeBuildProjectName: "audience-live-check-app-build",
      ecrRepositoryName: "audience-live-check-app",
      clusterName: "audience-live-check-cluster",
      serviceName: "audience-live-check-service",
      containerName: "web",
      healthCheckPath: "/",
      outputUrl: ""
    }
  );
});
```

- [ ] **Step 2: Run defaults test and verify RED**

Run: `pnpm --filter @sketchcatch/web exec tsx --test 'app/projects/[projectId]/settings/project-deployment-target-state.test.ts'`

Expected: FAIL because `createEcsFargateDeploymentDefaults` does not exist.

- [ ] **Step 3: Implement deterministic defaults and preserve saved targets**

Add an optional defaults input to `createDeploymentTargetDraft`. Apply it only when `target === null`. Keep the first verified connection behavior. Treat the UI empty string as API `null` for ECS `outputUrl`.

- [ ] **Step 4: Write failing nullable URL and execution-gate tests**

Add contract assertions that a target can store `outputUrl: null`, and service tests that application release setup throws an error with code `DEPLOYMENT_OUTPUT_URL_REQUIRED` before building a workflow or CodeBuild environment.

- [ ] **Step 5: Run contract/API tests and verify RED**

Run: `pnpm --filter @sketchcatch/types exec tsx --test src/project-release-ledger-contract.test.ts && pnpm --filter @sketchcatch/api test`

Expected: FAIL on the current required URL contract or missing execution gate.

- [ ] **Step 6: Implement nullable storage and fail-closed execution**

Change only ECS Fargate target `outputUrl` to `string | null`. Zod accepts `z.url().max(2048).nullable()`. Project target validation accepts null, but Direct/GitOps application execution must narrow it to a safe HTTPS string or throw `DEPLOYMENT_OUTPUT_URL_REQUIRED`. Do not pass an empty value to workflow or CodeBuild generation.

- [ ] **Step 7: Run focused tests and typechecks**

Run: `pnpm --filter @sketchcatch/web exec tsx --test 'app/projects/[projectId]/settings/project-deployment-target-state.test.ts' && pnpm --filter @sketchcatch/types exec tsx --test src/project-release-ledger-contract.test.ts && pnpm --filter @sketchcatch/api typecheck && pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add packages/types/src/index.ts packages/types/src/project-release-ledger-contract.test.ts apps/api/src/routes/project-release-ledger.ts apps/api/src/releases/project-release-ledger-service.ts apps/api/src/deployments/direct-application-release-service.ts apps/api/src/git-cicd/git-cicd-handoff-service.ts apps/api/src/git-cicd/git-cicd-workflows.ts 'apps/web/app/projects/[projectId]/settings/project-deployment-target-state.test.ts' 'apps/web/app/projects/[projectId]/settings/project-deployment-target-state.ts' 'apps/web/app/projects/[projectId]/settings/project-deployment-target-settings-client.tsx'
git commit -m "Feat: ECS Fargate 배포 기본값 추가"
```

### Task 5: Callback Auto-Connection and Mandatory Settings

**Files:**
- Create: `apps/web/app/integrations/github/callback/github-callback-state.ts`
- Create: `apps/web/app/integrations/github/callback/github-callback-state.test.ts`
- Modify: `apps/web/app/integrations/github/callback/page.tsx`
- Modify: `apps/web/app/integrations/github/callback/github-callback.module.css`
- Modify: `apps/web/app/projects/[projectId]/settings/project-deployment-target-settings-client.tsx`
- Modify: `apps/web/app/projects/[projectId]/settings/project-cicd-monitoring-settings-client.tsx`
- Modify: `apps/web/features/workspace/CicdMonitoringSettings.tsx`

**Interfaces:**
- Produces: callback phases `loading | connecting | configuring | error`
- Produces: `canResumeRepositoryAnalysis({ deploymentTargetSaved, gitOpsMonitoringSaved }): boolean`
- Consumes: exact target response, resume state, ECS defaults and existing settings APIs.

- [ ] **Step 1: Write failing callback flow tests**

```ts
test("callback waits for both required settings", () => {
  assert.equal(
    canResumeRepositoryAnalysis({ deploymentTargetSaved: true, gitOpsMonitoringSaved: false }),
    false
  );
  assert.equal(
    canResumeRepositoryAnalysis({ deploymentTargetSaved: true, gitOpsMonitoringSaved: true }),
    true
  );
});

test("callback target selection never falls back to another Repository", () => {
  assert.equal(selectCallbackTarget([candidate("owner/other")], target("owner/repo")), null);
});
```

- [ ] **Step 2: Run callback test and verify RED**

Run: `pnpm --filter @sketchcatch/web exec tsx --test app/integrations/github/callback/github-callback-state.test.ts`

Expected: FAIL because callback state helpers do not exist.

- [ ] **Step 3: Implement automatic connection phase**

On project callback, locate only the signed target candidate and call `connectGitHubSourceRepository`. Remove the project-scope Repository selection list. Account scope still redirects to global settings. Scrub installation/state from the address bar after successful connection.

- [ ] **Step 4: Mount settings after connection and expose save callbacks**

Add optional props:

```ts
type RequiredSettingsCallbacks = {
  onDirty?: () => void;
  onSaved?: () => void;
};
```

`ProjectDeploymentTargetSettingsClient` and `CicdMonitoringSettings` call `onDirty` on user changes and `onSaved` only after the API save resolves. Callback passes project name, analyzed revision/template defaults, and source root from the resume record.

- [ ] **Step 5: Implement automatic safe return**

When both saved flags become true, show `설정을 저장했습니다. Repository 분석으로 돌아갑니다.` and route to:

```ts
`/workspace/repository?${new URLSearchParams({
  projectId,
  projectName,
  resumeKey
}).toString()}`
```

Do not include GitHub state or installation ID.

- [ ] **Step 6: Run callback and settings tests**

Run: `pnpm --filter @sketchcatch/web exec tsx --test app/integrations/github/callback/github-callback-state.test.ts app/workspace/repository/repository-analysis-resume.test.ts 'app/projects/[projectId]/settings/project-deployment-target-state.test.ts' && pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add apps/web/app/integrations/github/callback/github-callback-state.ts apps/web/app/integrations/github/callback/github-callback-state.test.ts apps/web/app/integrations/github/callback/page.tsx apps/web/app/integrations/github/callback/github-callback.module.css 'apps/web/app/projects/[projectId]/settings/project-deployment-target-settings-client.tsx' 'apps/web/app/projects/[projectId]/settings/project-cicd-monitoring-settings-client.tsx' apps/web/features/workspace/CicdMonitoringSettings.tsx
git commit -m "Feat: GitHub callback 필수 설정 흐름 연결"
```

### Task 6: Board Runtime Name Alignment

**Files:**
- Modify: `packages/types/src/template-definitions.ts`
- Modify: `packages/types/src/template-definitions.test.ts`

**Interfaces:**
- Produces: `createEcsFargateRuntimeNames(projectSlug)` shared deterministic value mapping.
- Ensures: Board AWS values match callback deployment target defaults without changing Terraform local resource names.

- [ ] **Step 1: Write failing Board value test**

```ts
test("ECS Fargate Board uses project-scoped runtime names", () => {
  const diagram = buildTemplateDiagramJson("ecs-fargate-container-app", {
    projectSlug: "audience-live-check",
    shortId: "repository"
  });
  assert.equal(values(diagram, "aws_ecr_repository").name, "audience-live-check-app");
  assert.equal(values(diagram, "aws_ecs_cluster").name, "audience-live-check-cluster");
  assert.equal(values(diagram, "aws_ecs_service").name, "audience-live-check-service");
});
```

- [ ] **Step 2: Run template test and verify RED**

Run: `pnpm --filter @sketchcatch/types exec tsx --test src/template-definitions.test.ts`

Expected: FAIL because current ECS resource values use fixed `fargate-*` names.

- [ ] **Step 3: Implement ECS value overrides**

Use the same slug normalization rules as deployment defaults. Override only ECS template AWS values: ECR `name`, ECS cluster `name`, ECS service `name`, task `family`, container definition `name`, and CloudWatch log group `name`. Preserve Terraform `resourceName` and diagram node IDs.

- [ ] **Step 4: Run template and deployment-default tests**

Run: `pnpm --filter @sketchcatch/types exec tsx --test src/template-definitions.test.ts && pnpm --filter @sketchcatch/web exec tsx --test 'app/projects/[projectId]/settings/project-deployment-target-state.test.ts'`

Expected: PASS with identical project-scoped values.

- [ ] **Step 5: Commit Task 6**

```bash
git add packages/types/src/template-definitions.ts packages/types/src/template-definitions.test.ts
git commit -m "Feat: ECS Board 배포 이름 정합성 적용"
```

### Task 7: Canonical Documentation and Full Verification

**Files:**
- Modify: `docs/product.md`
- Modify: `docs/data-models.md`
- Modify: `docs/architecture.md`
- Modify without staging unrelated pre-existing hunks: `agent-progress.md`

**Interfaces:**
- Documents the exact implemented contracts and safety gates.

- [ ] **Step 1: Update canonical documents**

Document target-bound GitHub state, 30-minute one-time browser resume, exact commit revision, automatic callback connection, mandatory target/monitoring saves, ECS deterministic defaults, nullable pre-deployment output URL and execution-time URL gate.

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  src/source-repositories/github-app-state.test.ts \
  src/source-repositories/github-target-connection.test.ts \
  src/routes/public-repository-analysis-revision.test.ts
pnpm --filter @sketchcatch/web exec tsx --test \
  app/integrations/github/callback/github-callback-state.test.ts \
  app/workspace/repository/repository-analysis-resume.test.ts \
  app/workspace/repository/repository-start-client.test.ts \
  'app/projects/[projectId]/settings/project-deployment-target-state.test.ts'
pnpm --filter @sketchcatch/types exec tsx --test \
  src/project-release-ledger-contract.test.ts \
  src/template-definitions.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 3: Run required repository checks**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
git diff --check
```

Expected: harness, lint, typecheck, build and maintained protection-line tests PASS. If the known three-tier template baseline remains, report only failures reproduced before this feature and do not mark them as fixed.

- [ ] **Step 4: Browser verification**

Verify on `http://localhost:3000` without copying GitHub state into logs:

1. Analyze a public Repository with a Dockerfile.
2. Select `ECS Fargate container app`.
3. Start GitHub connection and return through callback.
4. Confirm no Repository selection list appears.
5. Confirm target and monitoring defaults match analysis evidence.
6. Confirm one saved section does not navigate.
7. Confirm both saved sections restore the existing analysis without a new analysis request.
8. Generate the Board and confirm ECR/ECS names match the saved target.

- [ ] **Step 5: Run adversarial review**

Review against `evaluator-rubric.md`: secret masking, state scope, owner/project authorization, stale resume rejection, no cloud mutation, nullable URL execution gate, and continuation evidence.

- [ ] **Step 6: Update progress and commit docs**

```bash
git add docs/product.md docs/data-models.md docs/architecture.md
git commit -m "Docs: Repository CI/CD 복귀 계약 반영"
```

Append the concise verification record to `agent-progress.md` after the source and canonical documentation commits. Because that file was already modified before this feature, leave it unstaged and report the preserved pre-existing change explicitly.

- [ ] **Step 7: Review current branch changes**

Run a standards and correctness review against the pre-feature commit. Fix every actionable finding, rerun focused tests and required checks, then commit only the fix files.

### Task 8: Temporary Callback-wide ECS Fargate Defaults

**Files:**
- Modify: `apps/web/app/integrations/github/callback/github-callback-state.ts`
- Modify: `apps/web/app/integrations/github/callback/github-callback-state.test.ts`
- Modify: `apps/web/app/integrations/github/callback/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/settings/project-deployment-target-state.ts`
- Modify: `apps/web/app/projects/[projectId]/settings/project-deployment-target-state.test.ts`
- Modify: `apps/web/app/projects/[projectId]/settings/project-deployment-target-settings-client.tsx`

**Interfaces:**
- Produces: `createCallbackEcsDefaults(resume)` that always returns ECS defaults regardless of `selectedTemplateId`.
- Produces: callback-only `preferEcsDefaults` draft mode that switches other runtimes to ECS and fills every required ECS coordinate while preserving an existing ECS output URL.

- [ ] **Step 1: Write failing callback and draft tests**

Add a callback test using a non-ECS `selectedTemplateId` and assert `createCallbackEcsDefaults` still returns the analyzed SHA and Dockerfile path. Add a deployment draft test with an existing Lambda target and assert callback preference returns `ecs_fargate` plus non-empty CodeBuild, ECR, cluster, service, and container values.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  app/integrations/github/callback/github-callback-state.test.ts \
  'app/projects/[projectId]/settings/project-deployment-target-state.test.ts'
```

Expected: FAIL because callback defaults currently return `null` for non-ECS selections and an existing target suppresses ECS defaults.

- [ ] **Step 3: Implement the callback-only preference**

Move the pure ECS-default derivation into `github-callback-state.ts`, remove the selected-template guard, and make the callback pass `preferEcsDefaults`. In `createDeploymentTargetDraft`, use this mode to select `ecs_fargate`, apply analyzed source root, Dockerfile and commit SHA, fill deterministic ECS coordinates, and preserve only an existing ECS `outputUrl`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command again. Expected: all focused tests PASS.

- [ ] **Step 5: Run scoped static checks and commit**

Run `pnpm --filter @sketchcatch/web typecheck`, `pnpm --filter @sketchcatch/web lint`, `pnpm harness:check`, and `git diff --check`. Commit only Task 8 source and test files with `Fix: Callback ECS 기본값 항상 적용`.
