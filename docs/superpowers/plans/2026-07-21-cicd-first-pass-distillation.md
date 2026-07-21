# CI/CD First-Pass Distillation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repeated CI/CD readiness chrome, merge automatic target evidence, and provide one real full-refresh control without changing deployment safety behavior.

**Architecture:** `DeliveryCenterPanel` owns the single refresh button and invokes the existing console refresh coordinator through a typed React handle. The status board and accordion group remove duplicate readiness summaries, while `CicdAutomaticSetupSummary` moves inside the deployment-target accordion.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Node test runner with `tsx`.

## Global Constraints

- Preserve PR review, approved Plan, Repository/AWS Role approval, Activity, Logs, and error recovery behavior.
- Do not change API, shared type, database, migration, AWS, Terraform, or GitHub mutation contracts.
- Keep one black primary action and the existing project color tokens.
- Do not stage or modify unrelated dirty-worktree files.
- Write and observe failing tests before production changes.

---

### Task 1: Lock the simplified information contract

**Files:**
- Modify: `apps/web/features/workspace/cicd-ledger-layout.test.ts`

**Interfaces:**
- Requires: one `전체 새로고침`, no `.statusProgress`, no standalone `자동 설정 결과` accordion.
- Requires: `CicdAutomaticSetupSummary` inside the deployment-target accordion.

- [ ] **Step 1: Add failing source-contract assertions**

Assert that `DeliveryCenterPanel` contains `ref={consoleRef}`, calls `refreshAll()`, and renders `전체 새로고침`; that `CicdPipelineRunsPanel` no longer accepts `onManualRefresh`; and that the standalone automatic accordion and duplicate count expressions are absent.

- [ ] **Step 2: Run the focused test and observe RED**

```bash
pnpm --dir apps/web exec tsx --test features/workspace/cicd-ledger-layout.test.ts
```

Expected: FAIL on the old header badge, status progress, separate automatic accordion, and Pipeline refresh button.

### Task 2: Implement the single refresh and distilled layout

**Files:**
- Modify: `apps/web/features/workspace/DeliveryCenterPanel.tsx`
- Modify: `apps/web/features/workspace/CicdConsoleScreen.tsx`
- Modify: `apps/web/features/workspace/CicdStatusBoard.tsx`
- Modify: `apps/web/features/workspace/CicdPipelineRunsPanel.tsx`
- Modify: `apps/web/features/workspace/delivery-center.module.css`

**Interfaces:**
- Produces: `CicdConsoleScreenHandle = { refreshAll(): Promise<void> }`
- Consumes: the existing `manualRefresh(): Promise<void>` coordinator.

- [ ] **Step 1: Expose the existing refresh coordinator**

Convert `CicdConsoleScreen` to `forwardRef`, add `useImperativeHandle`, and expose `refreshAll` as the existing `manualRefresh` callback. Keep Profile refresh as part of that callback.

- [ ] **Step 2: Connect the single header action**

Create a `consoleRef` in `DeliveryCenterPanel`. The header button awaits `consoleRef.current?.refreshAll()` and falls back to Profile refresh before the console mounts. Show `새로고침 중` while awaiting it.

- [ ] **Step 3: Remove repeated status chrome**

Remove the header readiness badge, status progress markup and CSS, accordion-group counts, and PR readiness fraction. Preserve the status values and next-action row.

- [ ] **Step 4: Merge automatic evidence into deployment target**

Render `CicdAutomaticSetupSummary` below `ProjectDeploymentTargetEditor` within the target accordion under the heading `감지된 배포 정보`. Remove the standalone automatic accordion and route output-related current actions to `deployment-target-title`.

- [ ] **Step 5: Remove Pipeline refresh ownership**

Delete `onManualRefresh`, `isRefreshing`, and `isReadinessRefreshing` from `CicdPipelineRunsPanel`. Keep Pipeline status, run selection, Activity, Logs, outputs, and retry actions unchanged.

- [ ] **Step 6: Run GREEN and related regressions**

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/cicd-ledger-layout.test.ts \
  features/workspace/cicd-console-heading.test.ts \
  features/workspace/cicd-responsive-contract.test.ts \
  features/workspace/delivery-center-integration.test.ts \
  features/workspace/cicd-pipeline-presentation.test.ts \
  features/workspace/cicd-github-account-cta.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Run required repository checks**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 8: Review and commit only scoped files**

Use the repository review workflow, preserve unrelated dirty files, and commit with:

```bash
git commit -m "Refactor: CI/CD 중복 상태와 갱신 동작 정리"
```
