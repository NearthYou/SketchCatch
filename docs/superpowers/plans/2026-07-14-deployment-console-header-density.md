# Deployment Console Header Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확장 배포 콘솔의 중복 제목을 제거하고 중앙 경로 선택과 더 큰 Stepper 번호를 제공한다.

**Architecture:** `DeploymentConsoleShell`의 경로 탐색 구조와 상태 로직은 유지하고 확장 모달의 제목 행만 제거한다. 기존 CSS Module 선택자를 조정해 경로 탐색을 중앙 상단 행으로 만들고, `DirectDeploymentScreen`의 Stepper 원과 연결선을 함께 확대한다.

**Tech Stack:** React, TypeScript, CSS Modules, Node test runner, pnpm

## Global Constraints

- `배포`와 `CI/CD`의 선택 상태, `localStorage`, 콜백, 접근성 속성을 변경하지 않는다.
- 각 배포 단계의 콘텐츠, 버튼 위치, API 호출, 승인 및 실행 기능을 변경하지 않는다.
- 기존 Workspace 색상 토큰, 글꼴, 테두리, 모서리 스타일을 재사용한다.
- 모바일에서도 두 경로 선택 버튼과 세 단계가 가로 스크롤 없이 보여야 한다.
- 공유 워크트리의 기존 staged/unstaged 변경을 보존하고 구현 소스는 별도로 커밋하지 않는다.

---

### Task 1: 상단 탐색과 Stepper 크기 회귀 테스트

**Files:**
- Modify: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`

**Interfaces:**
- Consumes: `DeploymentConsoleShell.tsx`, `workspace.module.css`의 소스 문자열
- Produces: 제목 행 제거, 중앙 탐색, 40px/36px Stepper와 연결선 정렬에 대한 회귀 검증

- [x] **Step 1: 실패하는 테스트 작성**

```ts
test("deployment modal removes the redundant title and centers the route selector", () => {
  const expandedBodyRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentExpandedBody",
    stylesSource.indexOf("/* Direct Deployment console */")
  );
  const routeNavigationRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentExpandedBody .deploymentConsoleScreenNavigation",
    stylesSource.indexOf("/* Direct Deployment console */")
  );

  assert.doesNotMatch(deploymentShellSource, /deploymentExpandedTitleRow/);
  assert.doesNotMatch(deploymentShellSource, /IaC Operations|배포 콘솔/);
  assert.match(expandedBodyRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(routeNavigationRule, /justify-content:\s*center;/);
  assert.match(routeNavigationRule, /min-height:\s*64px;/);
});

test("deployment stepper uses larger readable stage markers", () => {
  const stepIndexRule = getCssRule(stylesSource, "deploymentStepIndex");
  const connectorRule = getCssRule(stylesSource, "deploymentStepNavigation li + li::before");

  assert.match(stepIndexRule, /height:\s*40px;/);
  assert.match(stepIndexRule, /width:\s*40px;/);
  assert.match(stepIndexRule, /font-size:\s*13px;/);
  assert.match(connectorRule, /top:\s*19px;/);
});
```

- [x] **Step 2: 테스트를 실행해 RED 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`

Expected: 제목 행이 남아 있고 탐색과 Stepper 크기가 기존 값이므로 새 단언이 실패한다.

### Task 2: 제목 제거, 중앙 탐색, Stepper 확대

**Files:**
- Modify: `apps/web/features/workspace/DeploymentConsoleShell.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Test: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`

**Interfaces:**
- Consumes: `activeScreen`, `selectScreen`, `screenContent`, `deploymentStepIndex`
- Produces: 제목 없는 상단 경로 선택과 데스크톱 40px·모바일 36px 단계 표식

- [x] **Step 1: 확장 모달 제목 행 제거**

```tsx
<div className={styles.deploymentExpandedBody}>{screenContent}</div>
```

- [x] **Step 2: 모달 행과 중앙 경로 선택 조정**

```css
.deploymentExpandedBody {
  grid-template-rows: auto minmax(0, 1fr);
}

.deploymentExpandedBody .deploymentConsoleScreenNavigation {
  align-items: center;
  justify-content: center;
  margin: 0;
  min-height: 64px;
  padding: 8px 72px;
  width: 100%;
}
```

경로 버튼은 최소 44px 높이와 14px 글자 크기를 사용하고, 기존 활성 배경색과 `aria-pressed` 상태를 유지한다. 닫기 버튼은 우측 상단 중앙에 맞춰 배치한다.

- [x] **Step 3: Stepper 표식과 연결선 확대**

```css
.deploymentStepButton {
  grid-template-rows: 40px auto;
}

.deploymentStepIndex {
  font-size: 13px;
  height: 40px;
  width: 40px;
}

.deploymentStepNavigation li + li::before {
  left: calc(-50% + 25px);
  top: 19px;
  width: calc(100% - 50px);
}
```

모바일에서는 원을 36px로 유지하고 연결선의 `top`, `left`, `width`를 원 중심에 맞춘다.

- [x] **Step 4: 테스트를 실행해 GREEN 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts`

Expected: 전체 집중 테스트가 통과한다.

- [x] **Step 5: 정적 검증 실행**

Run: `pnpm harness:check && pnpm lint && pnpm typecheck && pnpm build`

Expected: 네 명령이 모두 exit code 0으로 종료한다.

- [x] **Step 6: 반응형 브라우저 확인**

데스크톱과 390px 폭에서 경로 선택이 중앙에 있고 닫기 버튼과 겹치지 않으며, 세 단계 원과 연결선이 잘리지 않는지 확인한다. 실제 배포·Terraform·AWS 동작은 실행하지 않는다.
