# Delivery Target Warning Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배포 타깃 저장 성공을 Direct Deployment에 즉시 반영하고, 오래된 선행 설정 경고와 모호한 누락 안내를 제거한다.

**Architecture:** 기존 API와 안전 게이트는 유지한다. `ProjectDeploymentTargetEditor`의 성공 callback을 `DeliveryCenterPanel`과 `DeploymentConsoleShell`을 거쳐 저장 revision으로 전달하고, `DirectDeploymentScreen`은 revision 변경 시 화면에 남아 있던 prerequisite만 제거한다. 누락된 자동 입력 값은 편집기 안에서 별도로 분류해 고급 설정을 열고 한국어 해결 안내를 표시한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, tsx

## Global Constraints

- 배포 타깃 저장은 Terraform 실행, Git 변경, PR 생성, AWS Resource 변경을 시작하지 않는다.
- Direct Deployment는 Plan 준비 전 최신 target 조회, confirmed build config 확인, AWS connection 일치 검사를 계속 수행한다.
- API, DB schema, shared contract, dependency와 lockfile은 변경하지 않는다.
- 현재 작업 트리의 API와 Repository Analysis 관련 사용자 변경은 수정하거나 stage하지 않는다.

---

### Task 1: 저장 완료 신호와 오래된 경고 무효화

**Files:**
- Modify: `apps/web/features/workspace/delivery-center-integration.test.ts`
- Modify: `apps/web/features/workspace/deployment-three-stage-flow.test.ts`
- Modify: `apps/web/features/workspace/DeliveryCenterPanel.tsx`
- Modify: `apps/web/features/workspace/DeploymentConsoleShell.tsx`
- Modify: `apps/web/features/workspace/DirectDeploymentScreen.tsx`

**Interfaces:**
- Consumes: `ProjectDeploymentTargetEditor.onSaved?: () => void`
- Produces: `DeliveryCenterPanel.onDeploymentTargetSaved?: () => void`, `DirectDeploymentScreenProps.deploymentTargetSavedRevision?: number`

- [ ] **Step 1: 저장 성공 신호의 실패 테스트 작성**

`delivery-center-integration.test.ts`에 다음 계약을 추가한다.

```ts
test("saved deployment target invalidates the stale Direct Deployment prerequisite", () => {
  assert.match(panelSource, /onDeploymentTargetSaved/);
  assert.match(panelSource, /onSaved=\{handleDeploymentTargetSaved\}/);
  assert.match(shellSource, /deploymentTargetSavedRevision/);
  assert.match(shellSource, /onDeploymentTargetSaved=\{\(\) =>/);
});
```

`deployment-three-stage-flow.test.ts`의 기존 full-stack test는 새 버튼 문구와 revision 의존성을 요구한다.

```ts
assert.match(directDeploymentSource, /CI\/CD 설정으로 이동/);
assert.match(directDeploymentSource, /deploymentTargetSavedRevision/);
assert.match(deploymentShellSource, /deploymentTargetSavedRevision=\{deploymentTargetSavedRevision\}/);
```

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery-center-integration.test.ts features/workspace/deployment-three-stage-flow.test.ts
```

Expected: `onDeploymentTargetSaved` 또는 `deploymentTargetSavedRevision` 계약이 없어 FAIL.

- [ ] **Step 3: 최소 저장 신호 구현**

`DeliveryCenterPanel`에 optional callback을 받고 성공 시에만 profile reload와 상위 알림을 함께 수행한다.

```tsx
function handleDeploymentTargetSaved(): void {
  reload();
  onDeploymentTargetSaved?.();
}

<ProjectDeploymentTargetEditor
  initialProfile={profile}
  onSaved={handleDeploymentTargetSaved}
  projectId={projectId}
/>
```

`DeploymentConsoleShell`에서 revision을 소유하고 두 화면에 연결한다.

```tsx
const [deploymentTargetSavedRevision, setDeploymentTargetSavedRevision] = useState(0);

<DirectDeploymentScreen
  {...directProps}
  deploymentTargetSavedRevision={deploymentTargetSavedRevision}
  onOpenDeliverySetup={() => {
    selectScreen("cicd");
    window.requestAnimationFrame(() =>
      document.getElementById("deployment-target-title")?.scrollIntoView({ block: "start" })
    );
  }}
/>

<DeliveryCenterPanel
  onDeploymentTargetSaved={() =>
    setDeploymentTargetSavedRevision((revision) => revision + 1)
  }
  ...
/>
```

`DirectDeploymentScreen`은 새 revision을 props로 받고 기존 prerequisite reset effect의 dependency에 포함한다.

```tsx
readonly deploymentTargetSavedRevision?: number | undefined;

deploymentTargetSavedRevision = 0,

useEffect(() => {
  setDeploymentTargetPrerequisite(null);
}, [deploymentTargetSavedRevision, projectId, selectedAwsConnectionId, selectedScope]);
```

경고 버튼 문구는 실제 동작에 맞게 바꾼다.

```tsx
<button onClick={onOpenDeliverySetup} type="button">
  CI/CD 설정으로 이동
</button>
```

- [ ] **Step 4: GREEN 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery-center-integration.test.ts features/workspace/deployment-three-stage-flow.test.ts
```

Expected: 두 파일의 모든 test PASS.

- [ ] **Step 5: 변경 파일만 커밋**

```bash
git add apps/web/features/workspace/delivery-center-integration.test.ts apps/web/features/workspace/deployment-three-stage-flow.test.ts apps/web/features/workspace/DeliveryCenterPanel.tsx apps/web/features/workspace/DeploymentConsoleShell.tsx apps/web/features/workspace/DirectDeploymentScreen.tsx
git commit -m "Fix: 배포 타깃 저장 상태 동기화"
```

### Task 2: 누락된 자동 입력 안내와 고급 설정 표시

**Files:**
- Modify: `apps/web/features/workspace/delivery/project-deployment-target-state.test.ts`
- Modify: `apps/web/features/workspace/delivery/ProjectDeploymentTargetEditor.tsx`
- Modify: `apps/web/features/workspace/delivery/ProjectDeploymentTargetAdvancedSettings.tsx`

**Interfaces:**
- Consumes: `MissingDeploymentTargetFieldKey[]`
- Produces: `ProjectDeploymentTargetAdvancedSettings.revealMissingFields: boolean`

- [ ] **Step 1: 누락 안내의 실패 테스트 작성**

`project-deployment-target-state.test.ts`의 presentation 계약에 다음 검증을 추가한다.

```ts
test("missing inferred fields reveal advanced settings with actionable Korean guidance", () => {
  assert.match(editorSource, /const missingAdvancedFieldKeys/);
  assert.match(editorSource, /revealMissingFields=\{/);
  assert.match(editorSource, /자동 입력되지 않은 설정을 확인하세요/);
  assert.match(advancedSettingsSource, /open=\{revealMissingFields \|\| undefined\}/);
  assert.match(editorSource, /빌드 기준 파일/);
  assert.match(editorSource, /확정 commit/);
  assert.match(editorSource, /ECS 클러스터/);
});
```

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery/project-deployment-target-state.test.ts
```

Expected: missing advanced guidance 계약이 없어 FAIL.

- [ ] **Step 3: 최소 안내 구현**

`ProjectDeploymentTargetEditor`에서 AWS 연결을 제외한 누락 값을 분리한다.

```tsx
const missingAdvancedFieldKeys = useMemo(
  () => missingFieldKeys.filter((key) => key !== "aws_connection"),
  [missingFieldKeys]
);
```

누락 label을 한국어 중심으로 바꾸고 상태 문구와 badge를 분기한다.

```tsx
const missingFieldLabels = {
  aws_connection: "AWS 연결",
  source_root: "소스 시작 폴더",
  build_evidence_path: "빌드 기준 파일",
  confirmed_commit_sha: "확정 commit",
  codebuild_project: "CodeBuild 프로젝트",
  ecr_repository: "ECR 저장소",
  ecs_cluster: "ECS 클러스터",
  ecs_service: "ECS 서비스",
  container: "ECS 컨테이너"
  // 기존 다른 runtime label도 같은 방식으로 유지
};
```

```tsx
<span className={styles.requiredBadge}>
  {missingAdvancedFieldKeys.length > 0 ? "자동 입력 확인 필요" : "2개 항목"}
</span>

<ProjectDeploymentTargetAdvancedSettings
  draft={draft}
  lockedSystemFields={lockedSystemFields}
  revealMissingFields={requestState === "idle" && missingAdvancedFieldKeys.length > 0}
  updateDraft={updateDraft}
/>
```

누락 상태 메시지는 다음처럼 표시한다.

```tsx
{missingAdvancedFieldKeys.length > 0
  ? `자동 입력되지 않은 설정을 확인하세요: ${missingAdvancedFieldKeys
      .map((key) => missingFieldLabels[key])
      .join(", ")}`
  : `필수 항목을 확인하세요: ${missingFieldKeys
      .map((key) => missingFieldLabels[key])
      .join(", ")}`}
```

고급 설정은 자동 입력 누락 시에만 강제로 연다.

```tsx
export function ProjectDeploymentTargetAdvancedSettings({
  draft,
  lockedSystemFields,
  revealMissingFields = false,
  updateDraft
}: {
  readonly draft: ProjectDeploymentTargetDraft;
  readonly lockedSystemFields: ReadonlySet<SystemManagedField>;
  readonly revealMissingFields?: boolean | undefined;
  readonly updateDraft: DraftUpdater;
}) {
  return (
    <details className={styles.advancedSettings} open={revealMissingFields || undefined}>
```

- [ ] **Step 4: GREEN 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery/project-deployment-target-state.test.ts
```

Expected: 모든 test PASS.

- [ ] **Step 5: 변경 파일만 커밋**

```bash
git add apps/web/features/workspace/delivery/project-deployment-target-state.test.ts apps/web/features/workspace/delivery/ProjectDeploymentTargetEditor.tsx apps/web/features/workspace/delivery/ProjectDeploymentTargetAdvancedSettings.tsx
git commit -m "Fix: 배포 타깃 누락 안내 개선"
```

### Task 3: 통합 검증과 하네스 기록

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: Task 1과 Task 2의 완료된 UI 동작
- Produces: 재현, 테스트, 안전 경계가 기록된 세션 증거

- [ ] **Step 1: 관련 Web 회귀 검증**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/delivery-center-integration.test.ts features/workspace/deployment-three-stage-flow.test.ts features/workspace/deployment-preparation-error.test.ts features/workspace/delivery/project-deployment-target-state.test.ts
```

Expected: 모든 test PASS.

- [ ] **Step 2: 필수 저장소 검증**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: 모든 command exit 0. 기존 작업자의 병렬 변경으로 실패하면 변경 파일과 무관한지 구체적으로 기록한다.

- [ ] **Step 3: 진행 기록 갱신**

`agent-progress.md`에 다음 사실을 영어로 기록한다.

```markdown
### 2026-07-19 - Synchronize saved Delivery targets with Direct Deployment

- Cleared stale Direct Deployment prerequisite presentation after a successful target save while retaining the fresh target and AWS connection safety checks before Plan preparation.
- Renamed the navigation-only setup action and revealed missing inferred settings with actionable Korean labels.
- Recorded focused and repository-wide verification results. No API contract, DB migration, dependency, Terraform execution, AWS mutation, or deployment was performed.
```

- [ ] **Step 4: 최종 하네스와 상태 확인**

Run:

```bash
pnpm harness:check
git status --short --branch
```

Expected: harness PASS. 이번 작업 파일과 사전에 존재한 병렬 변경만 표시된다.

- [ ] **Step 5: 기록 파일만 커밋**

```bash
git add agent-progress.md
git commit -m "Docs: 배포 타깃 동기화 검증 기록"
```
