# Workspace AI Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Workspace AI chat UI with a new AI Workbench while preserving every existing AI, Terraform, persistence, and explicit-approval contract.

**Architecture:** Keep `WorkspaceAiChatDock.tsx` as the state/controller boundary for the existing API and data flow, but replace its presentation tree with a new `WorkspaceAiWorkbench` shell and dedicated workbench result primitives. Desktop uses an inset nonmodal work window with a vertical three-mode rail and a flat transcript/artifact flow; mobile uses a full-screen single-column dialog with the same three modes as a horizontal tab list.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, Node test runner, Lucide React.

## Global Constraints

- Ignore the current AI chat layout, CSS, component composition, design tokens, and visual treatment; do not incrementally restyle them.
- Preserve the existing functional/data/API contracts, including the three independent `설계 제안`, `오류 분석`, and `에이전트 리뷰` scopes.
- Preserve project-scoped history, composer state, request cancellation, stale-result protection, Terraform fingerprint checks, single/all safe-fix approval, and Board preview/apply approval boundaries.
- Preserve the `WorkspaceAiChatDockProps` integration seam, message cap of 80, scope-aware legacy-message restoration, single/multiple clarification choices, and duplicate-submit prevention.
- Preserve request isolation by scope, cancel-all on project switch/unmount, first-open-only focus transfer, Escape close, launcher focus restoration, conditional follow-scroll, and `data-terraform-leave-guard-ignore`.
- Preserve Repository Analysis template context, Board fingerprint plus revision checks, preview-only Draft/Patch behavior, post-approval Terraform refresh, and immediate save.
- Desktop must remain nonmodal: the open AI Workbench must not close or block the Architecture Board or right panel.
- Mobile must be a full-screen modal surface with focus containment, safe-area spacing, and no horizontal overflow.
- Do not invent follow-up APIs, fake streaming, fake success, automatic Board/Terraform mutation, or AI-triggered Deployment.
- Preserve all unrelated and prior-agent changes already present in the dirty worktree.
- Use TDD at each new seam, run targeted tests frequently, and commit each independently reviewable task.

---

### Task 1: Stabilize the functional baseline

**Files:**
- Modify: `apps/web/components/notifications/DeploymentNotificationCenter.tsx`
- Modify: `apps/web/features/diagram-editor/WorkspaceProjectBar.tsx`
- Modify: `apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx`
- Modify: `apps/web/features/workspace/workspace-ai-result-presentation.test.ts`
- Test: `apps/web/components/notifications/deployment-notification-center-placement.test.ts`
- Test: `apps/web/features/workspace/workspace-ai-context-bridge.test.ts`

**Interfaces:**
- Consumes: the current dirty-tree AI provider chain, notification placement, Terraform AI bridge, and safe-fix changes.
- Produces: a committed functional baseline that the visual rewrite can safely preserve.

- [ ] **Step 1: Extend failing structural tests**

Add assertions that the notification context provider wraps the subtree in both authenticated and unauthenticated states, that the notification panel does not nest a `<header>` inside the project bar `<header>`, that project state is keyed or guarded synchronously by `projectId`, and that rule fallback provider attempts use the API-emitted `succeeded` status.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web test -- deployment-notification-center-placement.test.ts workspace-ai-context-bridge.test.ts workspace-ai-result-presentation.test.ts
```

Expected: at least one new assertion fails for the pre-fix source.

- [ ] **Step 3: Make the baseline fixes**

Keep `DeploymentNotificationProvider` mounted regardless of authentication, replace the nested notification `<header>` with a non-landmark container, synchronously isolate draft-manager state by project, and align the rule-fallback fixture with the API contract.

- [ ] **Step 4: Verify the baseline**

Run the focused tests above, API provider tests, Web typecheck, and API typecheck. Expected: exit 0.

- [ ] **Step 5: Commit the existing functional work**

Stage all current prior-agent functional changes and the fixes, inspect the staged diff, then commit:

```bash
git commit -m "Feat: Workspace AI 작업을 채팅으로 통합"
```

---

### Task 2: Build the new AI Workbench shell

**Files:**
- Create: `apps/web/features/workspace/WorkspaceAiWorkbench.tsx`
- Create: `apps/web/features/workspace/workspace-ai-workbench.module.css`
- Create: `apps/web/features/workspace/workspace-ai-workbench-contract.test.ts`
- Modify: `apps/web/features/workspace/WorkspaceAiChatDock.tsx`

**Interfaces:**
- Consumes: `WorkspaceAiChatScope`, scope definitions, active request status, mobile-surface state, close/clear/cancel/select callbacks, transcript/footer React nodes.
- Produces: `WorkspaceAiWorkbench`, a presentation-only surface that owns header, mode rail, status line, transcript viewport, and footer slots.

- [ ] **Step 1: Write a failing shell contract test**

Assert that `WorkspaceAiChatDock.tsx` imports `WorkspaceAiWorkbench`, does not render the legacy `aiChatDock`/`aiChatChrome` tree, and that the new shell contains a labelled vertical desktop tab rail, a tabpanel, a status `aria-live` region, and a mobile full-screen rule.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web test -- workspace-ai-workbench-contract.test.ts
```

Expected: failure because the new workbench component and CSS contract are absent.

- [ ] **Step 3: Implement the shell**

Create a presentation-only `WorkspaceAiWorkbench` with explicit props for active scope, status, mobile modality, right-panel state, callbacks, and `children`/`footer`. Use an inset desktop work window, a vertical mode rail, a flat work area, and a horizontal mobile tab list. The full-screen overlay must use `pointer-events: none` on desktop and the work window must use `pointer-events: auto`; mobile reverses the overlay to an interactive full-screen surface.

- [ ] **Step 4: Replace the controller's outer render tree**

Keep all state and event handlers in `WorkspaceAiChatDock.tsx`, but delegate all outer layout, tab buttons, status, clear, close, transcript container, and footer placement to the new shell.

- [ ] **Step 5: Verify and commit**

Run the new contract test, existing conversation/status/request/consolidation tests, and Web typecheck. Commit:

```bash
git commit -m "Refactor: AI 작업실 기본 구조 교체"
```

---

### Task 3: Replace transcript, workflow artifacts, and composer presentation

**Files:**
- Create: `apps/web/features/workspace/WorkspaceAiWorkbenchResults.tsx`
- Modify: `apps/web/features/workspace/WorkspaceAiChatDock.tsx`
- Modify: `apps/web/features/workspace/workspace-ai-workbench.module.css`
- Modify: `apps/web/features/workspace/workspace-ai-workbench-contract.test.ts`
- Test: `apps/web/features/workspace/workspace-ai-chat-consolidation.test.ts`
- Test: `apps/web/features/workspace/workspace-ai-result-presentation.test.ts`

**Interfaces:**
- Consumes: `LlmExplanation`, `AiTerraformPreviewExplanationResult`, `AiTerraformErrorExplanationResult`, `TerraformDiagnostic`, and the existing presentation-model helpers.
- Produces: flat workbench messages, choices, result artifacts, technical details, code diff, approval tray, contextual task actions, and draft-only composer.

- [ ] **Step 1: Write failing presentation tests**

Assert that the workbench uses new message/artifact/approval/composer classes, renders error-analysis and agent-review actions inside the workbench, keeps the draft composer unavailable for scopes whose API does not support follow-up input, and no longer imports `workspace.module.css` or `WorkspaceAiPanelPieces` from `WorkspaceAiChatDock.tsx`.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web test -- workspace-ai-workbench-contract.test.ts workspace-ai-chat-consolidation.test.ts workspace-ai-result-presentation.test.ts
```

Expected: the new assertions fail against the partially migrated render tree.

- [ ] **Step 3: Implement new result primitives**

Create workbench-specific explanation, check-list, next-step, technical-details, Terraform preview, and Terraform issue result components. Reuse only the existing result data helpers and API result types; do not reuse old card markup or old CSS classes.

- [ ] **Step 4: Rebuild the transcript and actions**

Render assistant text as flat transcript copy, user input as a compact message, questions as choice groups, generated changes as bordered artifacts, and approvals as explicit action rows. Place `선택 오류 분석`, `모두 분석`, `적용 가능한 항목 모두 수정`, `에이전트 리뷰`, `수정안 적용`, `Board에 적용`, cancel, stale regeneration, and request stop in their existing functional handlers.

- [ ] **Step 5: Rebuild the draft composer**

Use a growing textarea with a six-line visual maximum, separate microphone and send controls, visible voice status, Enter-to-submit/Shift+Enter newline behavior, and no composer in error/review scopes without follow-up APIs.

- [ ] **Step 6: Verify and commit**

Run the focused tests, Web typecheck, and targeted ESLint for the new/modified files. Commit:

```bash
git commit -m "Refactor: AI 작업실 대화와 결과 UI 재구축"
```

---

### Task 4: Responsive behavior, interaction invariants, and obsolete UI cleanup

**Files:**
- Modify: `apps/web/features/workspace/workspace-ai-workbench.module.css`
- Modify: `apps/web/features/workspace/workspace-ai-chat-launcher.module.css`
- Modify: `apps/web/features/workspace/WorkspaceAiChatDock.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Modify: `apps/web/features/workspace/workspace-ai-workbench-contract.test.ts`
- Modify: `apps/web/features/workspace/workspace-ai-context-bridge.test.ts`

**Interfaces:**
- Consumes: `context.isRightPanelOpen`, existing mobile focus trap, launcher focus restoration, and right-panel AI context interaction.
- Produces: final desktop/mobile layout with simultaneous Board/right-panel interaction and no used legacy AI-chat selectors.

- [ ] **Step 1: Add failing responsive and interaction assertions**

Assert desktop nonmodal pointer behavior, right-panel-aware inset placement without closing the panel, mobile `100dvh`/safe-area/full-screen behavior, reduced-motion handling, launcher focus restoration, and absence of used legacy `aiChat*` selectors.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web test -- workspace-ai-workbench-contract.test.ts workspace-ai-context-bridge.test.ts workspace-ai-chat-consolidation.test.ts
```

Expected: at least one new layout or cleanup assertion fails.

- [ ] **Step 3: Complete responsive and accessibility behavior**

Keep the desktop workbench inside the Board utility layer and shift it left of the right panel without closing either surface. At the mobile breakpoint, switch to one full-screen column, horizontal tabs, safe-area footer, and focus containment. Preserve Escape close, launcher focus restoration, `aria-busy`, `aria-live`, keyboard tab navigation, and reduced motion.

- [ ] **Step 4: Remove obsolete chat styling**

Delete legacy AI-chat selector blocks from `workspace.module.css` only after confirming no remaining production import references them. Preserve styles used by non-chat legacy panels until their owners are removed separately.

- [ ] **Step 5: Verify and commit**

Run the focused tests, Web lint, and Web typecheck. Commit:

```bash
git commit -m "Fix: AI 작업실 반응형 상호작용 정리"
```

---

### Task 5: Documentation, browser QA, and full verification

**Files:**
- Modify: `docs/gg/feat-gg-409-architecture-board-compiler-chat/001_WorkspaceAI채팅리팩토링결정_gg.md`
- Modify: `docs/gg/011_WorkspaceAI채팅QA매뉴얼_gg.md`
- Modify: `agent-progress.md`
- Modify: `feature_list.json`

**Interfaces:**
- Consumes: the final implemented UI and the canonical AI chat functional contract.
- Produces: current design/QA documentation and fresh completion evidence.

- [ ] **Step 1: Update the canonical decision and QA docs**

Document the new AI Workbench layout, the user-instruction/ADR rule that desktop chat no longer closes the right panel, the three independent modes, mobile full-screen behavior, and explicit approval boundaries. Remove obsolete QA steps that expect Inspector/Terraform panels to close.

- [ ] **Step 2: Run browser QA**

On the local `/workspace` route, verify at desktop, tablet, and mobile widths: open/close/focus restore; all three modes; draft request and cancel; error-analysis selection and action visibility; agent-review action visibility; stale-result blocking; Board interaction; right-panel interaction; mobile focus containment; no horizontal overflow; no new console errors.

- [ ] **Step 3: Run the full verification gates**

Run:

```bash
pnpm harness:check
pnpm --filter @sketchcatch/web test
pnpm --filter @sketchcatch/api test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: every command exits 0 with no failed tests.

- [ ] **Step 4: Update progress evidence and commit**

Record exact command results and browser QA evidence in the harness files, inspect the final diff for all pre-existing changes, and commit:

```bash
git commit -m "Docs: AI 작업실 QA 결과 정리"
```
