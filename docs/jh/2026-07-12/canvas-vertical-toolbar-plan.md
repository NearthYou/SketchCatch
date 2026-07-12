# Canvas Vertical Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Architecture Board 하단 가로 툴바를 캔버스 왼쪽 세로 중앙 툴바로 변경한다.

**Architecture:** 기존 `DiagramEditor` 마크업과 버튼 동작은 유지하고 `canvasToolbar` 및 `toolbarGroup`의 배치 CSS만 세로 방향으로 변경한다. 소스 계약 테스트로 위치·방향·반응형 안전 여백을 고정하고 실제 브라우저에서 데스크톱과 모바일 레이아웃을 확인한다.

**Tech Stack:** React 19, Next.js 16, CSS Modules, Node test runner with `tsx`

## Global Constraints

- 현재 브랜치에서 작업하고 다른 미커밋 변경을 보존한다.
- 툴바는 `workspace` 왼쪽 16px, 세로 중앙에 고정한다.
- 모바일에서는 왼쪽 안전 여백을 10px로 줄인다.
- 세 그룹과 모든 버튼의 순서, 접근성 이름, 상태, 이벤트 핸들러를 변경하지 않는다.
- 새 의존성을 추가하지 않는다.

---

### Task 1: 세로 툴바 레이아웃 계약

**Files:**
- Modify: `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`
- Modify: `apps/web/features/diagram-editor/diagram-editor.module.css`

**Interfaces:**
- Consumes: 기존 `.canvasToolbar`, `.toolbarGroup`, `@media (max-width: 640px)` 스타일
- Produces: 왼쪽 세로 중앙 툴바의 CSS 계약

- [ ] **Step 1: 실패하는 레이아웃 테스트 작성**

```ts
test("canvas tools dock vertically along the left center", () => {
  assert.match(
    diagramEditorCssSource,
    /\.canvasToolbar\s*\{[^}]*align-items:\s*center;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*left:\s*16px;[^}]*top:\s*50%;[^}]*transform:\s*translateY\(-50%\);/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.toolbarGroup\s*\{[^}]*display:\s*inline-flex;[^}]*flex-direction:\s*column;/s
  );
  assert.match(
    diagramEditorCssSource,
    /@media \(max-width:\s*640px\)[\s\S]*?\.canvasToolbar\s*\{[^}]*left:\s*10px;/s
  );
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-editor-layout.test.ts`

Expected: `canvas tools dock vertically along the left center`가 `flex-direction: column` 또는 `left: 16px` 부재로 실패한다.

- [ ] **Step 3: 최소 CSS 구현**

```css
.canvasToolbar {
  align-items: center;
  background: var(--workspace-surface);
  border: 1px solid var(--workspace-line);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(23, 23, 23, 0.12);
  display: flex;
  flex-direction: column;
  gap: 6px;
  left: 16px;
  max-height: calc(100% - 32px);
  padding: 5px;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: fit-content;
  z-index: 12;
}

.toolbarGroup {
  align-items: center;
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  padding: 3px;
}
```

기존 `background`, `border`, `border-radius`, `box-shadow` 선언은 그대로 유지하고 `bottom`, 가로 중앙 정렬용 `left: 50%`, `max-width`, `min-height`, `translateX`만 제거한다.

```css
@media (max-width: 640px) {
  .canvasToolbar {
    left: 10px;
    max-height: calc(100% - 20px);
  }
}
```

- [ ] **Step 4: 집중 테스트 통과 확인**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-editor-layout.test.ts`

Expected: 전체 테스트 통과.

- [ ] **Step 5: 브라우저 레이아웃 검증**

Playwright CLI로 실제 Workspace fixture를 열고 1280×720 및 390×844에서 다음을 확인한다.

```text
desktop: toolbar left = canvas left + 16px, vertical center aligned
mobile: toolbar left = canvas left + 10px, toolbar height <= canvas height - 20px
all: three groups ordered 편집 도구 → History → Viewport; buttons remain clickable and focusable
```

- [ ] **Step 6: 저장소 필수 검사**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: 모두 exit code 0. 기존 무관한 경고가 있으면 정확히 기록한다.

- [ ] **Step 7: 구현 커밋**

```bash
git add apps/web/features/diagram-editor/diagram-editor-layout.test.ts apps/web/features/diagram-editor/diagram-editor.module.css
git commit -m "Fix: 캔버스 도구를 왼쪽 세로로 배치"
```
