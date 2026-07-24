# 자동 정리 원본·정리본 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 Board와 Reverse Engineering 자동 정리에서 후보 목록과 SVG 이미지를 제거하고, 같은 실제 Board에서 원본과 단일 정리본만 전환·비교하게 한다.

**Architecture:** Compiler는 여러 안전한 배치를 내부적으로 평가하되 Preview 경계에는 가장 높은 순위의 결과 하나만 복사한다. 일반 Board와 Reverse Engineering은 동일하게 `원본`/`정리본` 상태만 보유하며, 전환은 Preview Diagram만 바꾸고 명시적 적용 전에는 저장하지 않는다.

**Tech Stack:** TypeScript, React, Next.js, React Flow, Node test runner

## Global Constraints

- Resource·관계·설정·containment 의미는 자동 정리 전후에 같아야 한다.
- 후보 ID, 후보 목록, thumbnail, SVG 비교 이미지는 사용자 화면에 표시하지 않는다.
- `원본`과 `정리본`은 나란히 표시하지 않고 같은 Board에서 전환한다.
- 기존 서버 CAS 저장과 stale preview 차단 경계는 유지한다.
- 현재 작업 트리의 관련 없는 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: 일반 Board Preview를 단일 정리본 계약으로 축소

**Files:**
- Modify: `apps/web/features/architecture-board-compiler/board-auto-organize-preview.ts`
- Modify: `apps/web/features/diagram-editor/BoardAutoOrganizePreviewPanel.tsx`
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`
- Modify: `apps/web/features/diagram-editor/diagram-editor.module.css`
- Test: `apps/web/features/architecture-board-compiler/board-auto-organize-preview.test.ts`
- Test: `apps/web/features/diagram-editor/BoardAutoOrganizePreviewPanel.test.ts`

**Interfaces:**
- Consumes: `BoardAutoOrganizeCandidateSet`의 이미 정렬된 첫 결과
- Produces: `BoardAutoOrganizePreviewSession.organizedResult`, `원본`/`정리본` 전환, 기존 `applyBoardAutoOrganizeCandidate` 저장 경계

- [ ] **Step 1: 후보 선택과 SVG 이미지가 없어야 한다는 렌더링 테스트를 작성한다.**

```ts
assert.match(html, />원본</);
assert.match(html, />정리본</);
assert.doesNotMatch(html, /정리안 1|정리안 2|<svg|role="img"/);
```

- [ ] **Step 2: Preview session이 첫 안전 결과 하나만 노출하는 테스트를 작성하고 실패를 확인한다.**

```ts
assert.equal(session.organizedResult.id, candidateSet.candidates[0]!.id);
assert.equal("candidates" in session, false);
assert.equal("selectedCandidateId" in session, false);
```

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/architecture-board-compiler/board-auto-organize-preview.test.ts features/diagram-editor/BoardAutoOrganizePreviewPanel.test.ts`

Expected: 기존 다중 후보와 SVG UI 때문에 FAIL.

- [ ] **Step 3: Preview session과 Panel을 단일 정리본으로 변경한다.**

```ts
return {
  sessionId: candidateSet.sessionId,
  originalDiagram: structuredClone(originalDiagram),
  organizedResult: structuredClone(candidateSet.candidates[0]!),
  activeView: "organized",
  sourceFingerprint: candidateSet.sourceFingerprint,
  sourceDraftRevision,
  viewportBeforePreview: structuredClone(viewportBeforePreview)
};
```

후보 선택 callback과 SVG thumbnail helper를 삭제하고, `원본`과 `정리본` 버튼을 모든 화면에서 표시한다.

- [ ] **Step 4: 집중 테스트를 다시 실행해 PASS를 확인한다.**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/architecture-board-compiler/board-auto-organize-preview.test.ts features/diagram-editor/BoardAutoOrganizePreviewPanel.test.ts`

Expected: PASS.

### Task 2: Reverse Engineering을 단일 정리본으로 축소

**Files:**
- Modify: `apps/web/features/workspace/ReverseEngineeringPanel.tsx`
- Modify: `apps/web/features/workspace/ReverseEngineeringResultPanel.tsx`
- Modify: `apps/web/features/workspace/reverse-engineering-apply-flow.ts`
- Modify: `apps/web/features/workspace/reverse-engineering.module.css`
- Test: `apps/web/features/workspace/ReverseEngineeringResultPanel.test.tsx`
- Test: `apps/web/features/workspace/reverse-engineering-apply-flow.test.ts`
- Test: `apps/web/features/workspace/reverse-engineering-placement-flow.test.ts`

**Interfaces:**
- Consumes: replace/append 각각의 최고 순위 `BoardAutoOrganizeCandidate`
- Produces: `ReverseEngineeringPlacement`의 `original`/`compiled` 두 상태와 기존 적용 application

- [ ] **Step 1: Reverse 결과 패널에 두 전환 버튼만 있고 후보 목록이 없다는 테스트를 작성한다.**

```ts
assert.match(html, />원본</);
assert.match(html, />정리본</);
assert.doesNotMatch(html, /정리안 1|정리안 2|Board 정리안 선택/);
```

- [ ] **Step 2: 기존 테스트를 실행해 후보 목록 때문에 실패하는지 확인한다.**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/ReverseEngineeringResultPanel.test.tsx features/workspace/reverse-engineering-apply-flow.test.ts features/workspace/reverse-engineering-placement-flow.test.ts`

Expected: 기존 후보 props와 목록 때문에 FAIL.

- [ ] **Step 3: replace/append별 단일 정리본만 상태로 보관한다.**

```ts
type ReverseEngineeringOrganizedPreviews = {
  readonly append: BoardAutoOrganizeCandidate | null;
  readonly replace: BoardAutoOrganizeCandidate;
};
```

후보 선택 함수·ID·props·CSS를 삭제하고, 적용 mode를 바꾸면 해당 mode의 단일 정리본을 미리보기한다.

- [ ] **Step 4: Reverse 집중 테스트를 다시 실행해 PASS를 확인한다.**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/ReverseEngineeringResultPanel.test.tsx features/workspace/reverse-engineering-apply-flow.test.ts features/workspace/reverse-engineering-placement-flow.test.ts`

Expected: PASS.

### Task 3: 회귀 및 저장 경계 검증

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: Task 1과 Task 2의 단일 정리본 Preview
- Produces: 검증 증거와 다음 작업자가 읽을 짧은 상태 기록

- [ ] **Step 1: 관련 Compiler, DiagramEditor, Reverse Engineering 회귀를 실행한다.**

Run: `pnpm --filter @sketchcatch/web exec tsx --test "features/architecture-board-compiler/*.test.ts" "features/diagram-editor/*.test.ts" "features/workspace/*reverse-engineering*.test.ts" "features/workspace/ReverseEngineeringResultPanel.test.tsx"`

Expected: PASS.

- [ ] **Step 2: 저장소 필수 검사를 실행한다.**

Run: `pnpm harness:check`

Run: `pnpm lint`

Run: `pnpm typecheck`

Run: `pnpm build`

Run: `git diff --check`

Expected: 각 명령의 실제 결과를 읽고, 기존 실패가 있으면 이번 변경과 구분해 기록한다.

- [ ] **Step 3: `agent-progress.md`에 변경 범위와 검증 결과를 영어로 짧게 기록한다.**

```md
### 2026-07-20 - Simplify auto-arrange comparison

- Removed candidate galleries and inline SVG thumbnails from Board auto-arrange.
- Reused one original/organized Board toggle in normal and Reverse Engineering flows.
- Preserved visual-only semantics and stale server-apply protection.
```
