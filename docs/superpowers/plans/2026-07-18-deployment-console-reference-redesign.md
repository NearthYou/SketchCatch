# Deployment Console Reference Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첨부 시안의 파란색·네이비 시각 언어와 요약 중심 정보 구조를 Direct Deployment와 Deployment History에 적용한다.

**Architecture:** `DirectDeploymentScreen`은 기존 API 호출, 선택 상태와 안전 게이트를 계속 소유한다. 순수 이력 집계·필터는 `deployment-presentation.ts`에 두고, 화면은 현재 데이터를 새 헤더 KPI, 단계 흐름, 진행 패널, 검증 요약, 이력 KPI·필터·상세 패널에 전달한다. Terraform, AWS, Git 또는 DB 계약은 변경하지 않는다.

**Tech Stack:** React 18, TypeScript, CSS Modules, Lucide icons, Node test runner, pnpm

## Global Constraints

- 현재 브랜치 `codex/fix-github-auth-boundary`와 현재 worktree에서만 작업한다.
- 별도 worktree와 하위 에이전트를 만들지 않는다.
- 기존 Terraform Plan, 승인, Apply, Destroy, Rollback, 로그, Output 조회와 안전 게이트를 변경하지 않는다.
- 현재 파일의 기존 staged/unstaged 변경을 보존하고 관련 없는 diff를 되돌리거나 커밋하지 않는다.
- 시안의 예시 숫자를 만들지 않고 실제 `Deployment`, `ApplicationRelease`, `ProjectBuildEnvironment` 데이터만 표시한다.
- 평균 실행 시간을 계산할 수 없으면 `집계 전`, Plan 변경 수를 계산할 수 없으면 `계산 전`으로 표시한다.
- 모든 상태는 색상뿐 아니라 아이콘과 텍스트로도 전달한다.
- 클릭 대상은 최소 44px, 본문 텍스트 대비는 4.5:1 이상으로 맞춘다.
- 실제 Terraform Plan, Apply, Destroy, AWS 또는 Git 작업을 검증 과정에서 실행하지 않는다.
- 관련 파일이 이미 다른 작업의 변경을 포함하므로 task별 자동 commit은 하지 않는다. 전체 diff를 검토한 뒤 사용자가 별도로 요청할 때만 커밋한다.

---

## File Structure

- `apps/web/features/workspace/deployment-presentation.ts`: 성공/정리 이력 필터, 합계, 평균 실행 시간의 순수 계산.
- `apps/web/features/workspace/deployment-presentation.test.ts`: 이력 집계와 필터의 단위 테스트.
- `apps/web/features/workspace/DeploymentProgressBar.tsx`: 시안형 네이비 진행 패널의 접근 가능한 표시.
- `apps/web/features/workspace/DirectDeploymentScreen.tsx`: 기존 상태와 handler를 새 배포·이력 화면에 조합.
- `apps/web/features/workspace/workspace.module.css`: 배포 전용 파란색 토큰, KPI, 진행 패널, 검증 요약, 이력 master-detail, 반응형 스타일.
- `apps/web/features/workspace/deployment-three-stage-flow.test.ts`: 화면 구조와 기존 안전 동작을 함께 고정하는 source contract.
- `agent-progress.md`: 최종 검증 명령과 알려진 위험 기록.

---

### Task 1: Deployment History 집계와 필터 계약

**Files:**

- Modify: `apps/web/features/workspace/deployment-presentation.ts`
- Modify: `apps/web/features/workspace/deployment-presentation.test.ts`

**Interfaces:**

- Consumes: `DeploymentHistoryEntry<T>`, `Deployment.planSummary`, `startedAt`, `completedAt`, `getDeploymentDurationMs`.
- Produces: `DeploymentHistoryFilter`, `filterDeploymentHistoryEntries()`, `getDeploymentHistoryMetrics()`.

- [ ] **Step 1: 필터와 집계가 실제 이력만 사용하는 실패 테스트 작성**

```ts
import {
  filterDeploymentHistoryEntries,
  getDeploymentHistoryMetrics,
  type DeploymentHistoryFilter
} from "./deployment-presentation";

test("Deployment History filters completed and unchanged versions without fabricating metrics", () => {
  const entries = getDeploymentHistoryEntries([
    deployment({
      id: "changed",
      status: "SUCCESS",
      startedAt: "2026-07-18T10:00:00.000Z",
      completedAt: "2026-07-18T10:02:00.000Z",
      planSummary: summary({ createCount: 2, deleteCount: 1 })
    }),
    deployment({
      id: "unchanged",
      status: "DESTROYED",
      startedAt: null,
      completedAt: null,
      planSummary: summary()
    })
  ]);

  assert.deepEqual(
    filterDeploymentHistoryEntries(entries, "unchanged").map(({ deployment }) => deployment.id),
    ["unchanged"]
  );
  assert.equal(filterDeploymentHistoryEntries(entries, "complete").length, 2);
  assert.deepEqual(getDeploymentHistoryMetrics(entries), {
    averageDurationMs: 120_000,
    completedCount: 2,
    totalChangeCount: 3,
    totalCount: 2
  });
});
```

- [ ] **Step 2: 테스트를 실행해 export 부재로 실패 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-presentation.test.ts`

Expected: FAIL with missing `filterDeploymentHistoryEntries` or `getDeploymentHistoryMetrics` export.

- [ ] **Step 3: 순수 필터와 집계 구현**

```ts
import { getDeploymentDurationMs } from "./deployment-duration";

export type DeploymentHistoryFilter = "all" | "complete" | "unchanged";

type DeploymentHistoryMetricSource = Pick<
  Deployment,
  "cancelledAt" | "completedAt" | "failedAt" | "planSummary" | "startedAt" | "status" | "updatedAt"
>;

export function filterDeploymentHistoryEntries<
  T extends DeploymentHistorySummary & Pick<Deployment, "planSummary">
>(
  entries: readonly DeploymentHistoryEntry<T>[],
  filter: DeploymentHistoryFilter
): DeploymentHistoryEntry<T>[] {
  if (filter === "all" || filter === "complete") return [...entries];

  return entries.filter(({ deployment }) => getPlanChangeCount(deployment.planSummary) === 0);
}

export function getDeploymentHistoryMetrics<
  T extends DeploymentHistorySummary & DeploymentHistoryMetricSource
>(
  entries: readonly DeploymentHistoryEntry<T>[]
): {
  readonly averageDurationMs: number | null;
  readonly completedCount: number;
  readonly totalChangeCount: number;
  readonly totalCount: number;
} {
  const durations = entries
    .map(({ deployment }) => getDeploymentDurationMs(deployment))
    .filter((duration): duration is number => duration !== null);

  return {
    averageDurationMs:
      durations.length === 0
        ? null
        : Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length),
    completedCount: entries.length,
    totalChangeCount: entries.reduce(
      (total, { deployment }) => total + getPlanChangeCount(deployment.planSummary),
      0
    ),
    totalCount: entries.length
  };
}

function getPlanChangeCount(summary: Deployment["planSummary"]): number {
  if (!summary) return 0;
  return summary.createCount + summary.updateCount + summary.deleteCount + summary.replaceCount;
}
```

- [ ] **Step 4: 테스트 통과와 변경 파일 정합성 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-presentation.test.ts`

Expected: PASS for all deployment presentation tests.

Run: `git diff --check -- apps/web/features/workspace/deployment-presentation.ts apps/web/features/workspace/deployment-presentation.test.ts`

Expected: no output.

---

### Task 2: 시안형 배포 검증 화면

**Files:**

- Modify: `apps/web/features/workspace/DeploymentProgressBar.tsx`
- Modify: `apps/web/features/workspace/DirectDeploymentScreen.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Modify: `apps/web/features/workspace/deployment-three-stage-flow.test.ts`

**Interfaces:**

- Consumes: `directDeploymentFlow`, `selectedDeployment`, `selectedScope`, `buildEnvironment`, `activeProgress`, `DeploymentProgressBar` props, existing action handlers.
- Produces: `.deploymentExecutiveHeader`, `.deploymentExecutiveMetrics`, `.deploymentExecutionPanel`, `.deploymentSettingsLayout`, `.deploymentValidationCards` markup and styles.

- [ ] **Step 1: 새 헤더·KPI·진행 패널·4개 검증 요약의 source contract 작성**

```ts
test("Direct Deployment uses the approved executive validation layout", () => {
  assert.match(directDeploymentSource, /deploymentExecutiveHeader/);
  assert.match(directDeploymentSource, /deploymentExecutiveMetrics/);
  assert.match(directDeploymentSource, /현재 상태/);
  assert.match(directDeploymentSource, /예상 변경 수/);
  assert.match(directDeploymentSource, /deploymentExecutionPanel/);
  assert.match(directDeploymentSource, /deploymentSettingsLayout/);
  assert.match(directDeploymentSource, /deploymentValidationCards/);
  assert.match(directDeploymentSource, /설정 상태/);
  assert.match(directDeploymentSource, /실행 준비/);
  assert.match(workspaceStyles, /--deployment-blue:\s*#1267f4/);
  assert.match(workspaceStyles, /--deployment-navy:\s*#071a36/);
});
```

- [ ] **Step 2: 테스트를 실행해 새 구조가 없어 실패 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-three-stage-flow.test.ts`

Expected: FAIL on `deploymentExecutiveHeader`.

- [ ] **Step 3: 실제 상태를 KPI 값으로 계산**

`renderSetupSection` 안에 기존 상태에서 파생한 값만 추가한다.

```ts
const planChangeCount = selectedDeployment?.planSummary
  ? selectedDeployment.planSummary.createCount +
    selectedDeployment.planSummary.updateCount +
    selectedDeployment.planSummary.deleteCount +
    selectedDeployment.planSummary.replaceCount
  : null;
const currentStatusLabel = selectedDeployment
  ? getDeploymentStatusPresentation(selectedDeployment.status).label
  : "검증 필요";
const executionReadiness =
  selectedStep.state === "done"
    ? "다음 단계로 이동 가능"
    : selectedStep.state === "active" || selectedStep.state === "running"
      ? "현재 단계 진행 중"
      : "선행 단계 확인 필요";
```

- [ ] **Step 4: 배포 제목과 다섯 KPI를 단계 표시 위에 렌더링**

```tsx
<header className={styles.deploymentExecutiveHeader}>
  <div className={styles.deploymentExecutiveTitle}>
    <span aria-hidden="true">
      <ShieldCheck size={22} />
    </span>
    <div>
      <h2>{selectedStepHeading.title}</h2>
      <p>{selectedStepHeading.description}</p>
    </div>
  </div>
  <dl className={styles.deploymentExecutiveMetrics}>
    <Metric label="현재 상태" value={currentStatusLabel} tone="primary" />
    <Metric label="Terraform Plan" value={planStatus.label} />
    <Metric
      label="변경 적용 범위"
      value={formatSelectedDeploymentScope(selectedDeployment?.scope, selectedScope)}
    />
    <Metric
      label="예상 변경 수"
      value={planChangeCount === null ? "계산 전" : `${planChangeCount}개`}
    />
    <Metric
      label="빌드 환경"
      value={needsBuildEnvironment ? formatBuildEnvironmentStatus(buildEnvironment) : "해당 없음"}
      tone={getBuildEnvironmentStatusTone(buildEnvironment)}
    />
  </dl>
</header>
```

`Metric`은 같은 파일의 표시 전용 함수로 추가하고 `dt`, `dd`를 사용한다. 자동 감지 결과를 `full_stack`으로 추정하지 않고, 아직 Deployment가 없으면 `자동 감지`를 그대로 표시한다.

```ts
function formatSelectedDeploymentScope(
  deployedScope: DeploymentScope | undefined,
  selectedScope: DeploymentScope | "auto"
): string {
  return deployedScope ? formatDeploymentScope(deployedScope) : selectedScope === "auto" ? "자동 감지" : formatDeploymentScope(selectedScope);
}

function Metric({
  label,
  tone = "neutral",
  value
}: {
  readonly label: string;
  readonly tone?: DeploymentStatusTone | "primary";
  readonly value: string;
}) {
  return (
    <div data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
```

- [ ] **Step 5: 기존 progressbar를 네이비 실행 패널로 확장**

```tsx
<section className={styles.deploymentExecutionPanel} aria-live="polite">
  <div className={styles.deploymentExecutionIcon} aria-hidden="true">
    <Code2 size={26} />
  </div>
  <div className={styles.deploymentExecutionBody}>
    <div>
      <strong>{progress.title}</strong>
      <p>{progress.detail}</p>
    </div>
    <div
      aria-label={`${progress.title} 예상 진행률`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={displayedPercent}
      aria-valuetext={`${displayedPercent}% · ${progress.detail}`}
      className={styles.deploymentProgressTrack}
      role="progressbar"
    >
      <span style={{ width: `${displayedPercent}%` }} />
    </div>
  </div>
  <output aria-label="예상 진행률">{displayedPercent}%</output>
</section>
```

실행 취소 버튼은 기존 action handler를 계속 사용하므로 progress 컴포넌트 안으로 옮기지 않는다.

- [ ] **Step 6: 설정과 4개 검증 요약을 시안 구조로 조합**

```tsx
<section className={styles.deploymentSettingsSection}>
  <h3>배포 설정</h3>
  <div className={styles.deploymentSettingsLayout}>
    <div className={styles.deploymentSettingsControl}>
      <label htmlFor="deployment-scope-select">실행 타깃 결정 방식</label>
      <SelectMenu
        ariaLabel="실행 타깃 결정 방식"
        disabled={requestState === "loading"}
        emptyLabel="실행 타깃 없음"
        id="deployment-scope-select"
        onChange={(value) => setSelectedScope(value as DeploymentScope | "auto")}
        options={deploymentScopeOptions}
        size={isDeploymentOverlayOpen ? "large" : "regular"}
        tone="workspace"
        value={selectedScope}
      />
      <p>저장된 Terraform과 확인된 프로젝트 실행 타깃을 기준으로 실행 대상을 결정합니다.</p>
    </div>
    <dl className={styles.deploymentPlanSnapshot}>
      <InfoRow label="변경 범위" value={formatSelectedDeploymentScope(selectedDeployment?.scope, selectedScope)} />
      <InfoRow label="Terraform Plan" value={planStatus.label} />
    </dl>
  </div>
</section>

<section className={styles.deploymentValidationSection}>
  <h3>검증 요약</h3>
  <div className={styles.deploymentValidationCards}>
    <ValidationSummary
      description="저장된 배포 기준선과 현재 Board의 차이를 확인합니다."
      label="설정 상태"
      value={settingsStatus.label}
      tone={settingsStatus.tone}
    />
    <ValidationSummary
      description="Source Repository와 빌드 실행 권한 상태를 확인합니다."
      label="빌드 환경"
      value={needsBuildEnvironment ? formatBuildEnvironmentStatus(buildEnvironment) : "해당 없음"}
      tone={needsBuildEnvironment ? getBuildEnvironmentStatusTone(buildEnvironment) : "neutral"}
    />
    <ValidationSummary
      description="Terraform Plan이 계산한 생성·변경·삭제 합계입니다."
      label="변경 내용"
      value={planChangeCount === null ? "계산 전" : `${planChangeCount}개 변경`}
      tone="primary"
    />
    <ValidationSummary
      description="선행 검증과 승인 상태를 기준으로 다음 행동을 안내합니다."
      label="실행 준비"
      value={executionReadiness}
      tone={selectedStep.state === "done" ? "success" : "primary"}
    />
  </div>
</section>
```

`ValidationSummary`는 상태 아이콘과 설명을 함께 렌더링한다.

```tsx
function ValidationSummary({
  description,
  label,
  tone,
  value
}: {
  readonly description: string;
  readonly label: string;
  readonly tone: DeploymentStatusTone | "primary" | "warning";
  readonly value: string;
}) {
  return (
    <article data-tone={tone}>
      <span>{label}</span>
      <DeploymentStatusBadge label={value} tone={tone === "primary" ? "neutral" : tone} />
      <p>{description}</p>
    </article>
  );
}
```

Repository 권한 오류, target prerequisite와 Pre-Deployment Check 결과는 이 섹션 아래의 기존 markup을 유지한다.

- [ ] **Step 7: 파란색·네이비 토큰과 반응형 스타일 추가**

```css
.deploymentConsoleContent {
  --deployment-blue: #1267f4;
  --deployment-blue-soft: #eef5ff;
  --deployment-navy: #071a36;
  --deployment-navy-2: #0b2a57;
}

.deploymentExecutiveHeader {
  background: #fff;
  border: 1px solid #dbe5f2;
  border-radius: 16px;
  display: grid;
  gap: 22px;
  grid-column: 1 / -1;
  padding: 24px 28px;
}

.deploymentExecutiveMetrics {
  border: 1px solid #dbe5f2;
  border-radius: 12px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 0;
  min-width: 0;
}

.deploymentExecutionPanel {
  align-items: center;
  background: var(--deployment-navy);
  border: 1px solid #123a6c;
  border-radius: 14px;
  color: #fff;
  display: grid;
  gap: 18px;
  grid-template-columns: 52px minmax(0, 1fr) 48px;
  padding: 22px 24px;
}

.deploymentValidationCards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 1000px) {
  .deploymentExecutiveMetrics,
  .deploymentValidationCards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .deploymentExecutiveMetrics,
  .deploymentSettingsLayout,
  .deploymentValidationCards {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

기존 검정 accent override보다 뒤에 두어 배포 화면 내부에서만 blue가 적용되게 한다. 본문 색은 `#24344d` 이상으로 진하게 유지한다.

- [ ] **Step 8: 집중 테스트와 typecheck**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-three-stage-flow.test.ts features/workspace/deployment-progress.test.ts`

Expected: PASS.

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: exit 0.

---

### Task 3: 시안형 Deployment History KPI·필터·상세

**Files:**

- Modify: `apps/web/features/workspace/DirectDeploymentScreen.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Modify: `apps/web/features/workspace/deployment-three-stage-flow.test.ts`

**Interfaces:**

- Consumes: `deploymentHistoryEntries`, `filterDeploymentHistoryEntries()`, `getDeploymentHistoryMetrics()`, `formatDeploymentDuration()`, existing detail loading state.
- Produces: `deploymentHistoryMetrics`, `deploymentHistoryFilters`, filtered table, `deploymentHistoryDetailHero`.

- [ ] **Step 1: KPI·필터·네이비 상세 계약의 실패 테스트 작성**

```ts
test("Deployment History uses KPI filters and the approved master-detail hierarchy", () => {
  const historyStart = directDeploymentSource.indexOf("const renderDeploymentHistory");
  const historyEnd = directDeploymentSource.indexOf("const renderHistoryView", historyStart);
  const historySource = directDeploymentSource.slice(historyStart, historyEnd);

  assert.match(historySource, /deploymentHistoryMetrics/);
  assert.match(historySource, /전체 배포/);
  assert.match(historySource, /평균 실행 시간/);
  assert.match(historySource, /deploymentHistoryFilters/);
  assert.match(historySource, /변경 없음/);
  assert.match(historySource, /filteredDeploymentHistoryEntries\.map/);
  assert.match(historySource, /deploymentHistoryDetailHero/);
  assert.match(historySource, /getDeploymentDurationLabel/);
  assert.match(
    workspaceStyles,
    /\.deploymentHistoryDetailHero\s*\{[^}]*background:\s*var\(--deployment-navy\)/s
  );
});
```

- [ ] **Step 2: 테스트를 실행해 실패 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-three-stage-flow.test.ts`

Expected: FAIL on `deploymentHistoryMetrics`.

- [ ] **Step 3: 이력 필터 상태와 파생값 추가**

```ts
const [deploymentHistoryFilter, setDeploymentHistoryFilter] =
  useState<DeploymentHistoryFilter>("all");
const deploymentHistoryMetrics = useMemo(
  () => getDeploymentHistoryMetrics(deploymentHistoryEntries),
  [deploymentHistoryEntries]
);
const filteredDeploymentHistoryEntries = useMemo(
  () => filterDeploymentHistoryEntries(deploymentHistoryEntries, deploymentHistoryFilter),
  [deploymentHistoryEntries, deploymentHistoryFilter]
);
```

선택한 이력이 필터 결과에 없으면 필터된 첫 항목을 표시하되 원래 `selectedHistoryDeploymentId`를 삭제하지 않는다. 필터를 다시 `전체`로 바꾸면 수동 선택을 복원한다.

- [ ] **Step 4: 네 개 KPI와 세 필터를 이력 헤더 아래에 렌더링**

```tsx
<dl className={styles.deploymentHistoryMetrics}>
  <HistoryMetric icon={<Code2 size={20} />} label="전체 배포" value={`${deploymentHistoryMetrics.totalCount}개`} />
  <HistoryMetric icon={<CheckCircle2 size={20} />} label="완료" value={`${deploymentHistoryMetrics.completedCount}개`} />
  <HistoryMetric icon={<ClipboardCheck size={20} />} label="전체 변경 수" value={`${deploymentHistoryMetrics.totalChangeCount}개`} />
  <HistoryMetric
    icon={<Clock3 size={20} />}
    label="평균 실행 시간"
    value={deploymentHistoryMetrics.averageDurationMs === null ? "집계 전" : formatDeploymentDuration(deploymentHistoryMetrics.averageDurationMs)}
  />
</dl>
<div className={styles.deploymentHistoryFilters} aria-label="배포 이력 필터">
  {([
    ["all", "전체"],
    ["complete", "완료"],
    ["unchanged", "변경 없음"]
  ] as const).map(([value, label]) => (
    <button
      aria-pressed={deploymentHistoryFilter === value}
      key={value}
      onClick={() => setDeploymentHistoryFilter(value)}
      type="button"
    >
      {label}
    </button>
  ))}
</div>
```

`HistoryMetric`은 접근 가능한 `dt`와 `dd`를 제공한다.

```tsx
function HistoryMetric({
  icon,
  label,
  value
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <span aria-hidden="true">{icon}</span>
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 테이블을 필터 결과에 연결하고 상세 패널 헤더를 네이비로 변경**

```tsx
{filteredDeploymentHistoryEntries.map(({ deployment, versionLabel }) => /* existing row */)}

<article className={styles.deploymentHistoryDetailPanel} key={deployment.id}>
  <div className={styles.deploymentHistoryDetailHero}>
    <header className={styles.deploymentHistoryDetailHeader}>
      <span
        className={styles.deploymentHistoryStatus}
        data-tone={deployment.status === "DESTROYED" ? "neutral" : "success"}
      >
        <CheckCircle2 aria-hidden="true" size={16} />
        {status.label}
      </span>
      <time dateTime={deployment.createdAt}>{formatDate(deployment.createdAt)}</time>
    </header>
    <div className={styles.deploymentHistoryDetailIntro}>
      <span>선택한 배포</span>
      <h4>{deployment.status === "DESTROYED" ? "정리 완료된 버전" : "배포 완료된 버전"}</h4>
      <p className={styles.deploymentHistoryResultSentence}>
        {formatDeploymentHistoryResult(deployment)}
      </p>
    </div>
  </div>
  <div className={styles.deploymentHistoryDetailContent}>
    <dl className={styles.deploymentHistoryDetailFacts}>
      <div><dt>실행 범위</dt><dd>{formatDeploymentScope(deployment.scope)}</dd></div>
      <div><dt>변경 내용</dt><dd>{formatDeploymentChangeSummary(deployment.planSummary)}</dd></div>
      {release ? (
        <div><dt>앱 릴리즈</dt><dd>{release.version} · {formatApplicationReleaseStatus(release.status)}</dd></div>
      ) : null}
      <div><dt>버전 ID</dt><dd><code title={selectedEntry.versionLabel}>{selectedEntry.versionLabel}</code></dd></div>
      <div>
        <dt>실행 시간</dt>
        <dd>{getDeploymentDurationLabel(deployment)}</dd>
      </div>
      {deployment.approvedByUserId ? (
        <div><dt>요청자</dt><dd>{deployment.approvedByUserId}</dd></div>
      ) : null}
    </dl>
    {outputUrl ? (
      <a className={styles.deploymentHistoryOutputLink} href={outputUrl} rel="noreferrer" target="_blank">
        배포된 서비스 열기
      </a>
    ) : null}
    <details className={styles.deploymentHistoryTechnical}>
      <summary>기술 정보</summary>
      <dl>
        <div><dt>Deployment ID</dt><dd><code title={deployment.id}>{deployment.id}</code></dd></div>
        <div><dt>Terraform artifact</dt><dd><code title={deployment.terraformArtifactId}>{deployment.terraformArtifactId}</code></dd></div>
        {release ? (
          <>
            <div><dt>Commit</dt><dd><code title={release.commitSha}>{formatShortHash(release.commitSha)}</code></dd></div>
            <div><dt>Digest</dt><dd><code title={release.artifactDigest}>sha256:{formatShortHash(release.artifactDigest)}</code></dd></div>
          </>
        ) : null}
      </dl>
    </details>
  </div>
</article>
```

`approvedByUserId`가 식별자뿐이면 `시스템`이라고 바꾸지 않고 실제 값을 표시한다. 값이 없으면 행을 숨긴다.

- [ ] **Step 6: 이력 KPI·필터·상세·반응형 스타일 추가**

```css
.deploymentHistoryMetrics {
  border-bottom: 1px solid #dbe5f2;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  padding: 0 28px;
}

.deploymentHistoryFilters {
  display: flex;
  gap: 8px;
  padding: 20px 28px 14px;
}

.deploymentHistoryFilters button[aria-pressed="true"] {
  background: var(--deployment-blue-soft);
  border-color: var(--deployment-blue);
  color: #0755d6;
}

.deploymentHistoryTable tbody tr[data-selected="true"] {
  background: var(--deployment-blue-soft);
  box-shadow: inset 0 0 0 1px var(--deployment-blue);
}

.deploymentHistoryDetailHero {
  background: var(--deployment-navy);
  color: #fff;
  display: grid;
  gap: 22px;
  padding: 28px;
}

.deploymentHistoryDetailContent {
  background: #fff;
  display: grid;
  gap: 24px;
  padding: 28px;
}
```

1150px 아래에서는 기존처럼 표 아래로 상세 패널을 내리고, 760px 아래에서는 KPI를 두 열, 520px 아래에서는 한 열로 배치한다. 테이블은 `min-width`를 유지해 수평 스크롤을 허용한다.

- [ ] **Step 7: 집중 테스트 실행**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-presentation.test.ts features/workspace/deployment-three-stage-flow.test.ts features/workspace/deployment-history-details.test.ts`

Expected: PASS.

---

### Task 4: Impeccable 디자인 검토와 저장소 검증

**Files:**

- Modify: `apps/web/features/workspace/DirectDeploymentScreen.tsx` only if detector or visual review finds a scoped issue.
- Modify: `apps/web/features/workspace/workspace.module.css` only if detector or visual review finds a scoped issue.
- Modify: `agent-progress.md`

**Interfaces:**

- Consumes: completed Task 1–3 UI and tests.
- Produces: verified responsive, accessible deployment console and concise harness evidence.

- [ ] **Step 1: Impeccable project context와 product register 적용**

Run: `node /Users/bruce/.codex/skills/impeccable/scripts/context.mjs --target apps/web/features/workspace/DirectDeploymentScreen.tsx`

Expected: project context or `NO_PRODUCT_MD`; because this is a scoped existing UI refinement, continue without init if `NO_PRODUCT_MD` is reported.

Read: `/Users/bruce/.codex/skills/impeccable/reference/product.md`

- [ ] **Step 2: 정적 디자인 detector 실행**

Run: `node /Users/bruce/.codex/skills/impeccable/scripts/detect.mjs --json apps/web/features/workspace/DirectDeploymentScreen.tsx apps/web/features/workspace/workspace.module.css`

Expected: JSON output. Fix only findings introduced by this deployment redesign; do not rewrite unrelated legacy CSS.

- [ ] **Step 3: 개발 서버에서 데스크톱·모바일 시각 확인**

Confirm:

- 1440px: KPI 5열, 단계 연결선, 네이비 진행 패널, 설정/검증 요약, 이력 table/detail가 겹치지 않는다.
- 1024px: KPI와 검증 카드가 2열로 줄고 이력 상세가 표 아래로 이동한다.
- 390px: 전체 화면 모달, 한 열 KPI, 수평 스크롤 테이블, 전체 너비 CTA, 닫기 버튼과 focus trap이 유지된다.
- 긴 version ID, Repository URL, 실패 메시지가 컨테이너 밖으로 넘치지 않는다.
- console error와 hydration warning이 없다.

- [ ] **Step 4: 집중 테스트와 전체 필수 검사 실행**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test \
  features/workspace/deployment-presentation.test.ts \
  features/workspace/deployment-progress.test.ts \
  features/workspace/deployment-history-details.test.ts \
  features/workspace/deployment-three-stage-flow.test.ts
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: every command exits 0. If a pre-existing failure occurs, record the exact command and evidence without claiming success.

- [ ] **Step 5: clean-state checklist와 진행 기록 갱신**

Update `agent-progress.md` in English with:

```md
### 2026-07-18 - Redesign the deployment console from the approved reference

- Rebuilt Direct Deployment and Deployment History around real status metrics, a three-step approval flow, an active execution panel, history filters, and selected-version details without changing Terraform or cloud mutation boundaries.
- Focused deployment tests, harness, lint, typecheck, build, visual checks, and diff checks pass. No Terraform, AWS, GitHub, database, or deployment mutation was performed.
```

Run: `pnpm harness:check && git diff --check`

Expected: both exit 0.
