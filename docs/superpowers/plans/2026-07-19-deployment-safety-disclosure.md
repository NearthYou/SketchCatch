# 배포 안전성 검사 결과 접기·펼치기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배포 안전성 검사 결과의 제목은 항상 보이게 유지하면서 설명, Trivy 상태, 통계, Finding을 기본적으로 접어 둔다.

**Architecture:** `DeploymentPreDeploymentSummary`의 표현 구조만 네이티브 `<details>/<summary>`로 바꾼다. 기존 검사 데이터 계산과 Finding 동작은 유지하고, CSS module에서 제목 행의 상호작용·chevron·본문 간격·reduced motion을 담당한다.

**Tech Stack:** React 19, TypeScript, CSS Modules, Node.js test runner, pnpm

## Global Constraints

- `HIGH`, `MEDIUM`, `LOW` 상태 배지와 `배포 안전성 검사 결과` 제목은 항상 표시한다.
- 최초 렌더링에서는 상세 내용을 접어 둔다.
- 접기·펼치기는 표현 상태만 바꾸며 배포 승인, Plan, Apply, API 호출에는 영향을 주지 않는다.
- 별도 React 상태나 새 dependency를 추가하지 않는다.
- 기존 작업 트리의 관련 없는 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: 배포 안전성 검사 결과 disclosure

**Files:**
- Create: `apps/web/features/workspace/deployment-preflight-disclosure.test.ts`
- Modify: `apps/web/features/workspace/DirectDeploymentScreen.tsx:2310-2370`
- Modify: `apps/web/features/workspace/workspace.module.css:3467-3545`

**Interfaces:**
- Consumes: `AiPreDeploymentAnalysisResult`, `CheckFinding`, `styles.deploymentPreflightSummary`, `styles.deploymentGateHeader`
- Produces: 기본 닫힘 상태의 네이티브 disclosure와 `deploymentPreflightBody`, `deploymentPreflightChevron` CSS module class

- [x] **Step 1: 기본 접힘 구조를 요구하는 실패 테스트 작성**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const deploymentSource = readFileSync(
  fileURLToPath(new URL("DirectDeploymentScreen.tsx", import.meta.url)),
  "utf8"
);
const workspaceStyles = readFileSync(
  fileURLToPath(new URL("workspace.module.css", import.meta.url)),
  "utf8"
);

test("pre-deployment results are collapsed by default behind an accessible summary", () => {
  const componentStart = deploymentSource.indexOf("function DeploymentPreDeploymentSummary");
  const componentEnd = deploymentSource.indexOf(
    "function DeploymentPreDeploymentFindingItem",
    componentStart
  );
  const componentSource = deploymentSource.slice(componentStart, componentEnd);

  assert.match(
    componentSource,
    /<details className=\{styles\.deploymentPreflightSummary\} data-level=\{gateLevel\}>/
  );
  assert.match(
    componentSource,
    /<summary className=\{styles\.deploymentGateHeader\}>[\s\S]*?배포 안전성 검사 결과[\s\S]*?<\/summary>/
  );
  assert.match(componentSource, /className=\{styles\.deploymentPreflightBody\}/);
  assert.match(componentSource, /className=\{styles\.deploymentPreflightChevron\}/);
  assert.doesNotMatch(componentSource, /<details[^>]*\sopen(?:=|\s|>)/);
});

test("pre-deployment disclosure styles expose focus and reduced-motion states", () => {
  assert.match(workspaceStyles, /\.deploymentGateHeader:focus-visible/);
  assert.match(
    workspaceStyles,
    /\.deploymentPreflightSummary\[open\] \.deploymentPreflightChevron/
  );
  assert.match(
    workspaceStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.deploymentPreflightChevron/
  );
});
```

- [x] **Step 2: 테스트를 실행해 기능 부재로 실패하는지 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-preflight-disclosure.test.ts
```

Expected: 첫 번째 테스트가 `<details>` 구조를 찾지 못하고 실패한다.

- [x] **Step 3: 네이티브 disclosure 구조와 스타일 구현**

`DeploymentPreDeploymentSummary`의 반환 구조를 다음 형태로 변경한다.

```tsx
function DeploymentPreDeploymentSummary({
  analysis,
  onOpenFindingTerraformSource
}: {
  readonly analysis: AiPreDeploymentAnalysisResult;
  readonly onOpenFindingTerraformSource: (finding: CheckFinding) => TerraformSourceLocation | null;
}) {
  const failCount = countChecklistItems(analysis, "fail");
  const warningCount = countChecklistItems(analysis, "warning");
  const gateLevel = getPreDeploymentGateLevel(analysis);

  return (
    <details className={styles.deploymentPreflightSummary} data-level={gateLevel}>
      <summary className={styles.deploymentGateHeader}>
        <span className={styles.deploymentGateBadge}>{gateLevel.toUpperCase()}</span>
        <strong>배포 안전성 검사 결과</strong>
        <span className={styles.deploymentPreflightChevron} aria-hidden="true" />
      </summary>
      <div className={styles.deploymentPreflightBody}>
        <p>{analysis.summary}</p>
        {analysis.deepScan ? (
          <p className={styles.deploymentHint} data-testid="pre-deployment-deep-scan-status">
            {analysis.deepScan.status === "running"
              ? "핵심 안전검사 완료 · Trivy 심층검사 진행 중"
              : analysis.deepScan.status === "complete"
                ? "핵심 안전검사 및 Trivy 심층검사 완료 · 결과 병합됨"
                : analysis.deepScan.status === "failed"
                  ? (analysis.deepScan.message ?? "Trivy 심층검사를 완료하지 못했습니다.")
                  : "핵심 안전검사 완료"}
          </p>
        ) : null}
        <div className={styles.deploymentPreflightStats} aria-label="배포 전 검사 요약">
          <span>
            <strong>{analysis.findings.length}</strong>
            발견 항목
          </span>
          <span>
            <strong>{failCount}</strong>
            실패
          </span>
          <span>
            <strong>{warningCount}</strong>
            주의
          </span>
        </div>
        {analysis.findings.length > 0 ? (
          <ul className={styles.deploymentPreflightFindings}>
            {analysis.findings.map((finding) => (
              <DeploymentPreDeploymentFindingItem
                finding={finding}
                key={finding.id}
                onOpenFindingTerraformSource={onOpenFindingTerraformSource}
              />
            ))}
          </ul>
        ) : (
          <p className={styles.deploymentHint}>표시할 Check Finding이 없습니다.</p>
        )}
      </div>
    </details>
  );
}
```

CSS module에 다음 상호작용을 추가하고, 최상위 카드의 기존 `gap`과 `padding`은 본문과 제목 행으로 이동한다.

```css
.deploymentPreflightSummary {
  background: var(--workspace-surface, #ffffff);
  border: 1px solid var(--workspace-line, #f0f0f3);
  border-radius: var(--radius-card);
  min-width: 0;
  overflow: hidden;
}

.deploymentGateHeader {
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: 8px;
  min-width: 0;
  padding: 20px;
}

.deploymentGateHeader::-webkit-details-marker {
  display: none;
}

.deploymentGateHeader::marker {
  content: "";
}

.deploymentGateHeader:hover {
  background: var(--workspace-surface-muted, #fafafa);
}

.deploymentGateHeader:focus-visible {
  outline: 2px solid var(--workspace-text, #171717);
  outline-offset: -3px;
}

.deploymentPreflightBody {
  display: grid;
  gap: 16px;
  padding: 0 20px 20px;
}

.deploymentPreflightChevron {
  border-bottom: 2px solid currentColor;
  border-right: 2px solid currentColor;
  color: var(--workspace-muted, #60646c);
  flex: 0 0 auto;
  height: 8px;
  margin-left: auto;
  transform: rotate(45deg);
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  width: 8px;
}

.deploymentPreflightSummary[open] .deploymentPreflightChevron {
  transform: rotate(-135deg);
}

@media (prefers-reduced-motion: reduce) {
  .deploymentPreflightChevron {
    transition: none;
  }
}
```

- [x] **Step 4: 집중 테스트와 Web 정적 검사 실행**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-preflight-disclosure.test.ts
pnpm --filter @sketchcatch/web lint
pnpm --filter @sketchcatch/web typecheck
```

Expected: disclosure 테스트 2개와 lint/typecheck가 모두 통과한다.

- [x] **Step 5: 전체 필수 검사 실행**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: 모든 명령이 exit code 0으로 완료된다.

- [x] **Step 6: 구현 변경을 현재 `dev` 작업 트리에 유지**

사용자가 현재 `dev`에서 바로 작업하도록 지정했고 같은 작업 트리에 다른 미커밋 변경이 있으므로, 구현 커밋과 Git 통합 작업은 수행하지 않는다.

```bash
git status --short
```
