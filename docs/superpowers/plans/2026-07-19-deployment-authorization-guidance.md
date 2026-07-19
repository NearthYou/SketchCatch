# Deployment Authorization Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 배포 단계와 AWS에서 승인할 Pending CodeConnection을 정확한 문구로 안내한다.

**Architecture:** 기존 순수 프런트엔드 helper에서 `DeploymentStage`별 제목·설명을 계산하고, AWS connection ID로 콘솔에 표시되는 connection 이름을 계산한다. API 계약과 배포 실행 로직은 변경하지 않고 React 컴포넌트는 계산된 표현만 렌더링한다.

**Tech Stack:** TypeScript, React, Next.js, Node test runner

## Global Constraints

- AWS SDK와 Terraform 실행 로직을 프런트엔드에 추가하지 않는다.
- Repository 접근은 실제 checkout 성공 전까지 검증 완료로 표시하지 않는다.
- 새로운 runtime dependency와 DB migration을 추가하지 않는다.
- 작업은 현재 `dev` branch에서 테스트 우선으로 수행한다.

---

### Task 1: Deployment stage presentation

**Files:**
- Modify: `apps/web/features/workspace/deployment-progress.test.ts`
- Modify: `apps/web/features/workspace/deployment-progress.ts`

**Interfaces:**
- Consumes: `DeploymentStage`, `DeploymentProgressOperation`
- Produces: `getDeploymentProgress(input): DeploymentProgress | null`의 정확한 `title`과 `detail`

- [x] **Step 1: Write the failing tests**

```ts
test("preflight progress describes safety checks instead of cloud apply", () => {
  const progress = getDeploymentProgress({
    deployment: createDeployment({ activeStage: "preflight", status: "RUNNING" }),
    isStarting: false,
    logs: [],
    nowMs: fixedNowMs,
    operationHint: "plan"
  });
  assert.equal(progress?.title, "배포 전 안전 검사 중");
  assert.match(progress?.detail ?? "", /Repository 실행 조건/);
});

test("application release progress does not regress to a Plan title", () => {
  const progress = getDeploymentProgress({
    deployment: createDeployment({ activeStage: "application_release", status: "RUNNING" }),
    isStarting: false,
    logs: [],
    nowMs: fixedNowMs,
    operationHint: "plan"
  });
  assert.equal(progress?.title, "애플리케이션 릴리즈 중");
  assert.match(progress?.detail ?? "", /Artifact/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-progress.test.ts`

Expected: FAIL because current fallback title/detail use the Plan operation and Apply description.

- [x] **Step 3: Implement explicit stage presentation**

```ts
function getStageTitle(
  operation: DeploymentProgressOperation,
  activeStage: DeploymentStage
): string {
  if (activeStage === "preflight") return "배포 전 안전 검사 중";
  if (activeStage === "application_release") return "애플리케이션 릴리즈 중";
  if (activeStage === "rollback") return "배포 롤백 중";
  return OPERATION_TITLES[operation];
}
```

Add matching explicit `getStageDetail` branches for `preflight`, `application_release`, and `rollback`, then return `getStageTitle(operation, activeStage)` from `getDeploymentProgress`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-progress.test.ts`

Expected: PASS.

### Task 2: Exact AWS Pending connection guidance

**Files:**
- Modify: `apps/web/features/dashboard/github-codebuild-authorization-state.test.ts`
- Modify: `apps/web/features/dashboard/github-codebuild-authorization-state.ts`
- Modify: `apps/web/app/dashboard/settings/settings-dashboard-client.test.ts`
- Modify: `apps/web/app/dashboard/settings/settings-dashboard-client.tsx`

**Interfaces:**
- Consumes: `AwsCodeConnectionResponse.codeConnection.awsConnectionId`
- Produces: `getAwsCodeConnectionDisplayName(awsConnectionId: string): string`

- [x] **Step 1: Write the failing test**

```ts
test("AWS approval guidance identifies the exact generated connection name", () => {
  assert.equal(
    getAwsCodeConnectionDisplayName("ee0c1542-4627-481e-a6b5-433b16f50f3b"),
    "sketchcatch-ee0c1542-github"
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/dashboard/github-codebuild-authorization-state.test.ts app/dashboard/settings/settings-dashboard-client.test.ts`

Expected: FAIL because the helper is not exported.

- [x] **Step 3: Implement and render the exact name**

```ts
export function getAwsCodeConnectionDisplayName(awsConnectionId: string): string {
  return `sketchcatch-${awsConnectionId.replaceAll("-", "").slice(0, 8)}-github`;
}
```

Import this helper in `settings-dashboard-client.tsx`. In the Pending fallback, replace `GitHub 승인 필요` with `AWS에서 {name} Pending 연결을 선택한 뒤 Update pending connection을 눌러 주세요.` while preserving the setup, refresh, and disconnect actions.

- [x] **Step 4: Run focused tests**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/dashboard/github-codebuild-authorization-state.test.ts app/dashboard/settings/settings-dashboard-client.test.ts features/workspace/deployment-progress.test.ts`

Expected: PASS.

### Task 3: Verification and delivery

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: completed source and test changes
- Produces: verified `dev` commit pushed to `origin/dev`

- [x] **Step 1: Run project checks**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: every command exits 0.

- [x] **Step 2: Record evidence**

Append a concise English entry to `agent-progress.md` with deployment ID, public URL verification, changed behavior, and successful commands.

- [x] **Step 3: Commit and push**

```bash
git add docs/superpowers/specs/2026-07-19-deployment-authorization-guidance-design.md docs/superpowers/plans/2026-07-19-deployment-authorization-guidance.md apps/web/features/workspace/deployment-progress.test.ts apps/web/features/workspace/deployment-progress.ts apps/web/features/dashboard/github-codebuild-authorization-state.test.ts apps/web/features/dashboard/github-codebuild-authorization-state.ts apps/web/app/dashboard/settings/settings-dashboard-client.test.ts apps/web/app/dashboard/settings/settings-dashboard-client.tsx agent-progress.md
git commit -m "Fix: 배포 승인 및 진행 안내 개선"
git push origin dev
```

Expected: commit succeeds and `origin/dev` advances to the new commit.
