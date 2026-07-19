# 현재 프로젝트 배포 자동 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 배포 버튼은 현재 Board의 Direct Deployment를 열고, CI/CD는 Board provenance에 연결된 Repository를 자동 사용하며 중복 Source Repository 카드를 표시하지 않는다.

**Architecture:** `WorkspaceRightPanel`이 일반 진입 화면을 `deployment`로 명시한다. CI/CD 상태는 `ProjectDeliveryProfile`을 단일 기준으로 읽어 `sourceRepository`, `monitoringConfig`, `readiness`를 함께 갱신하고, Backend의 프로젝트 소유권·활성 상태 검증은 그대로 유지한다.

**Tech Stack:** Next.js, React, TypeScript, Node test runner, CSS Modules

## Global Constraints

- 현재 프로젝트의 `RepositoryAnalysisRecord.sourceRepositoryId`와 일치하는 활성 Repository만 자동 사용한다.
- Repository가 없으면 다른 Repository로 자동 대체하지 않는다.
- Direct Deployment와 Git/CI/CD의 기존 승인·권한·안전 게이트를 변경하지 않는다.
- 공유 작업공간의 기존 미커밋 파일은 수정하거나 stage하지 않는다.

---

### Task 1: 배포 진입과 중복 Repository 카드 제거

**Files:**
- Modify: `apps/web/features/workspace/delivery-center-integration.test.ts`
- Modify: `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- Modify: `apps/web/features/workspace/DeliveryCenterPanel.tsx`
- Modify: `apps/web/features/workspace/delivery-center.module.css`
- Delete: `apps/web/features/workspace/delivery-repository-freshness.ts`
- Delete: `apps/web/features/workspace/delivery-repository-freshness.test.ts`

**Interfaces:**
- Consumes: `DeploymentConsoleShell.initialActiveScreen`, `ProjectDeliveryProfile`
- Produces: 일반 배포 진입의 명시적 `deployment` 화면과 Repository 카드가 없는 Delivery 연결 화면

- [x] **Step 1: 실패하는 통합 계약 테스트 작성**

```ts
test("일반 배포 진입은 이전 CI/CD 탭 대신 현재 Board 배포를 연다", () => {
  assert.match(
    rightPanelSource,
    /initialActiveScreen=\{initialView === "deployment" \? "cicd" : "deployment"\}/
  );
});

test("Delivery는 Board Repository를 다시 선택하는 카드를 표시하지 않는다", () => {
  assert.doesNotMatch(panelSource, /delivery-repository-title/);
  assert.doesNotMatch(panelSource, /Repository 다시 분석/);
  assert.doesNotMatch(panelSource, /readinessAction:\s*"select_repository"/);
});
```

- [x] **Step 2: 테스트가 기존 구현에서 실패하는지 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery-center-integration.test.ts`

Expected: 일반 배포의 기본 화면과 Repository 카드 assertion이 실패한다.

- [x] **Step 3: 일반 배포 화면을 명시하고 Repository 카드 삭제**

```tsx
initialActiveScreen={initialView === "deployment" ? "cicd" : "deployment"}
```

`DeliveryCenterPanel`에서 `repositoryHref`, freshness 계산, `Source Repository` article, `shortSha`, 관련 import를 제거한다. `delivery-center.module.css`의 단일 GitHub 카드 grid를 한 열로 바꾸고 Repository 카드 전용 `.definitionList`와 `.warning` 규칙을 제거한다.

- [x] **Step 4: 삭제된 freshness helper의 사용처가 없는지 확인**

Run: `rg -n "delivery-repository-freshness|getDeliveryRepositoryFreshness" apps/web`

Expected: 출력 없음.

- [x] **Step 5: 통합 계약 테스트 통과 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery-center-integration.test.ts`

Expected: 모든 테스트 PASS.

### Task 2: CI/CD Repository 상태를 Delivery Profile로 단일화

**Files:**
- Modify: `apps/web/features/workspace/delivery-center-integration.test.ts`
- Modify: `apps/web/features/workspace/CicdConsoleScreen.tsx`

**Interfaces:**
- Consumes: `getProjectDeliveryProfile(projectId): Promise<ProjectDeliveryProfile>`
- Produces: `loadDeliveryState(): Promise<{ repository; monitoringConfig; readiness; githubInstallationAccess }>`

- [x] **Step 1: 실패하는 Repository 단일 기준 테스트 작성**

```ts
test("CI/CD는 별도 Repository 목록 대신 Board Delivery Profile을 사용한다", () => {
  assert.doesNotMatch(cicdConsoleSource, /listSourceRepositories/);
  assert.doesNotMatch(cicdConsoleSource, /getGitCicdMonitoringConfig/);
  assert.match(cicdConsoleSource, /profile\.sourceRepository/);
  assert.match(cicdConsoleSource, /profile\.monitoringConfig/);
  assert.match(cicdConsoleSource, /profile\.readiness/);
});
```

- [x] **Step 2: 테스트가 기존의 독립 Repository 선택을 검출하는지 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery-center-integration.test.ts`

Expected: `listSourceRepositories`와 `getGitCicdMonitoringConfig` assertion이 실패한다.

- [x] **Step 3: Delivery Profile loader 추가**

```ts
const loadDeliveryState = useCallback(async () => {
  const profile = await getProjectDeliveryProfile(projectId);
  const githubInstallationAccess = profile.sourceRepository
    ? null
    : deriveGitHubInstallationAccessState(await listGitHubAccountInstallations());
  return {
    repository: profile.sourceRepository,
    monitoringConfig: profile.monitoringConfig,
    readiness: profile.readiness,
    githubInstallationAccess
  };
}, [projectId]);
```

초기 로드와 수동 새로고침에서 이 loader를 호출하고 네 상태를 같은 결과로 갱신한다. `listSourceRepositories`와 `getGitCicdMonitoringConfig` import 및 호출을 제거한다. Delivery Profile 로드 실패 시 기존 readiness 오류와 실행 차단을 유지한다.

- [x] **Step 4: 단일 기준 테스트와 Backend provenance 테스트 실행**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery-center-integration.test.ts`

Expected: 모든 테스트 PASS.

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/delivery/project-delivery-profile-service.test.ts`

Expected: Board provenance가 없는 Repository를 재사용하지 않는 테스트를 포함해 모든 테스트 PASS.

### Task 3: 전체 검증과 작업 기록

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: Task 1~2 변경과 검증 결과
- Produces: 재현 가능한 검증 기록

- [x] **Step 1: Web 정적 검증**

Run: `pnpm --filter @sketchcatch/web lint`

Expected: exit code 0.

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: exit code 0.

- [x] **Step 2: 저장소 전체 검증**

Run: `pnpm harness:check`

Expected: `Harness check passed.`

Run: `pnpm lint`

Expected: exit code 0.

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm build`

Expected: exit code 0.

Run: `git diff --check`

Expected: 출력 없음.

- [x] **Step 3: 현재 작업만 기록**

`agent-progress.md`의 Session Record 위에 현재 프로젝트 배포 자동 연결, Repository 카드 제거, 실행한 검증과 미검증 항목을 English로 추가한다. 기존 다른 작업의 내용을 수정하지 않는다.
