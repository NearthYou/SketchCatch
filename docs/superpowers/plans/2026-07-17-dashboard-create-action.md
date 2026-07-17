# Dashboard Create Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard 주요 페이지의 `새 프로젝트` 링크를 주변 UI와 어울리는 차분한 톤온톤 회색 행동으로 표시한다.

**Architecture:** 기존 전역 primary button 계약은 유지하고, `작업 현황`과 `내 프로젝트` 헤더 링크에 전용 modifier class를 더한다. 정적 presentation 회귀 테스트로 적용 범위를 고정한다.

**Tech Stack:** Next.js, React, CSS, Node.js test runner

## Global Constraints

- 링크 경로, 문구, 아이콘과 모바일 문구 노출은 유지한다.
- 다른 `dashboardPrimaryAction` 사용처의 스타일은 변경하지 않는다.
- 현재 작업 트리의 다른 Dashboard 변경을 보존한다.

---

### Task 1: Header create action modifier

**Files:**
- Create: `apps/web/features/dashboard/dashboard-create-action-presentation.test.ts`
- Modify: `apps/web/features/dashboard/dashboard-overview.tsx`
- Modify: `apps/web/features/dashboard/dashboard-projects-route.tsx`
- Modify: `apps/web/components/dashboard/dashboard-shell.css`

**Interfaces:**
- Consumes: 기존 `dashboardPrimaryAction` CSS class와 `/workspace/new?fresh=1` 링크 계약
- Produces: 두 페이지 헤더에만 적용되는 `dashboardCreateAction` modifier

- [ ] **Step 1: Write the failing presentation test**

```ts
test("Dashboard 주요 페이지의 새 프로젝트 링크는 차분한 헤더 전용 스타일을 사용한다", () => {
  assert.match(overviewSource, /className="dashboardPrimaryAction dashboardCreateAction"/);
  assert.match(projectsSource, /className="dashboardPrimaryAction dashboardCreateAction"/);
  assert.match(styles, /\.dashboardPrimaryAction\.dashboardCreateAction\s*\{[\s\S]*?min-height:\s*36px;[\s\S]*?border-color:\s*transparent;[\s\S]*?background:\s*var\(--color-surface-strong\);[\s\S]*?box-shadow:\s*none;/);
  assert.match(styles, /\.dashboardPrimaryAction\.dashboardCreateAction:hover\s*\{[\s\S]*?transform:\s*none;/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/dashboard/dashboard-create-action-presentation.test.ts`

Expected: FAIL because the current modifier still uses the rejected white outlined style.

- [ ] **Step 3: Add the modifier to both header links**

```tsx
<Link className="dashboardPrimaryAction dashboardCreateAction" href="/workspace/new?fresh=1">
```

- [ ] **Step 4: Add the scoped tone-on-tone styling**

```css
.dashboardPrimaryAction.dashboardCreateAction {
  min-height: 36px;
  border-color: transparent;
  padding: 0 14px;
  background: var(--color-surface-strong);
  color: var(--color-ink);
  box-shadow: none;
}

.dashboardPrimaryAction.dashboardCreateAction:hover {
  border-color: transparent;
  background: #e5e5e9;
  box-shadow: none;
  transform: none;
}
```

- [ ] **Step 5: Run focused and frontend verification**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/dashboard/dashboard-create-action-presentation.test.ts`

Expected: PASS.

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: exit 0, or report unrelated pre-existing failures exactly.

Run: `pnpm --filter @sketchcatch/web lint`

Expected: exit 0, or report unrelated pre-existing failures exactly.

- [ ] **Step 6: Review the scoped diff**

Run: `git diff -- apps/web/features/dashboard/dashboard-create-action-presentation.test.ts apps/web/features/dashboard/dashboard-overview.tsx apps/web/features/dashboard/dashboard-projects-route.tsx apps/web/components/dashboard/dashboard-shell.css`

Expected: only the modifier test, two class additions, and scoped CSS rules.
