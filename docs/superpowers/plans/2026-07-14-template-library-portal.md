# Template Library Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspace의 Template 전체보기 모달을 body Portal로 분리하고 64px 상단 네비게이터 아래에 안정적으로 배치한다.

**Architecture:** `TemplateLibraryModal`의 React 소유권은 `TemplatesPanel`에 유지하되 DOM만 `createPortal`로 `document.body` 아래에 렌더링한다. Portal에서 기존 `.leftRail` CSS 변수와 selector를 상속할 수 없으므로 모달 전용 CSS Module로 스타일 책임을 이동한다.

**Tech Stack:** React 19, React DOM `createPortal`, Next.js Client Component, CSS Modules, Node test runner

## Global Constraints

- 화면 문구와 접근성 이름은 `템플릿 전체보기`로 통일한다.
- 상단 프로젝트 네비게이터 높이는 정확히 `64px`로 유지한다.
- 딤 오버레이는 `inset: 64px 0 0`으로 네비게이터 아래만 덮는다.
- 데스크톱 모달 최대 높이는 `calc(100dvh - 112px)`로 제한한다.
- Template 카드 즉시 적용과 전체보기 모달 열기 동작은 계속 분리한다.
- 전체보기 진입 버튼의 `aria-label`과 visible 기능명은 `템플릿 전체보기`로 통일한다.
- Modal은 초기/복원 포커스, Escape, 양방향 Tab 순환, body 형제 `inert`, body scroll lock을 setup/cleanup 대칭으로 관리한다.
- 닫기 버튼은 `:focus-visible`에 2px outline을 제공한다.
- 새 런타임 의존성을 추가하지 않는다.

---

### Task 1: Template 전체보기 Portal

**Files:**
- Modify: `apps/web/features/resource-settings/resource-settings-panel.test.ts`
- Modify: `apps/web/features/resource-settings/index.tsx`
- Create: `apps/web/features/resource-settings/template-library-modal.module.css`
- Modify: `apps/web/features/diagram-editor/diagram-editor.module.css`

**Interfaces:**
- Consumes: `TemplateLibraryModal({ onClose, onTemplateApply, templates })`
- Produces: `createPortal(modal, document.body)`와 `template-library-modal.module.css`의 `overlay`, `dialog`, `header`, `closeButton` 클래스

- [x] **Step 1: 문구와 Portal/CSS 계약을 검증하는 실패 테스트 작성**

```ts
const modalStyles = readLocalFile("template-library-modal.module.css");

test("workspace Template 전체보기 uses a body Portal below the project navigator", () => {
  assert.match(panelSource, /import \{ createPortal \} from "react-dom"/);
  assert.match(panelSource, /aria-label="템플릿 전체보기"/);
  assert.match(panelSource, /return createPortal\([\s\S]*document\.body/);

  const overlayStyle = readCssRule(modalStyles, ".overlay");
  const dialogStyle = readCssRule(modalStyles, ".dialog");
  assert.match(overlayStyle, /inset:\s*64px 0 0/);
  assert.match(dialogStyle, /max-height:\s*calc\(100dvh - 112px\)/);
});
```

- [x] **Step 2: 집중 테스트를 실행해 기존 구현 때문에 실패하는지 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/resource-settings-panel.test.ts
```

Expected: `createPortal` import, `템플릿 전체보기` 문구 또는 새 CSS Module 파일이 없어 FAIL.

- [x] **Step 3: 최소 Portal 구현과 전용 스타일 추가**

```tsx
import { createPortal } from "react-dom";
import modalStyles from "./template-library-modal.module.css";

function TemplateLibraryModal({
  onClose,
  onTemplateApply,
  templates
}: {
  readonly onClose: () => void;
  readonly onTemplateApply: (template: BoardTemplate) => void;
  readonly templates: readonly BoardTemplate[];
}) {
  return createPortal(
    <div className={modalStyles.overlay} role="presentation">
      <section
        aria-label="템플릿 전체보기"
        aria-modal="true"
        className={modalStyles.dialog}
        role="dialog"
      >
        <div className={modalStyles.header}>
          <div>
            <span>Template library</span>
            <h2>템플릿 전체보기</h2>
            <p>선택하면 현재 보드를 백업하고 템플릿 구조로 덮어씁니다.</p>
          </div>
          <button className={modalStyles.closeButton} onClick={onClose} type="button">
            닫기
          </button>
        </div>

        <TemplateGallery
          actionLabel="현재 Board에 적용"
          onSelect={(templateId) => {
            const template = templates.find((candidate) => candidate.id === templateId);
            if (template) onTemplateApply(template);
          }}
          templates={templates}
        />
      </section>
    </div>,
    document.body
  );
}
```

```css
.overlay {
  align-items: center;
  background: rgba(23, 23, 23, 0.42);
  box-sizing: border-box;
  display: flex;
  font-family: "Pretendard", "Noto Sans KR", Inter, Geist, sans-serif;
  inset: 64px 0 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 120;
}

.dialog {
  background: var(--workspace-surface, #ffffff);
  border: 1px solid var(--workspace-line-strong, #dcdee0);
  border-radius: 12px;
  box-shadow: 0 32px 80px -32px rgba(23, 23, 23, 0.34);
  box-sizing: border-box;
  color: var(--workspace-text, #171717);
  max-height: calc(100dvh - 112px);
  max-width: 960px;
  overflow: auto;
  padding: 24px;
  width: 100%;
}

.header {
  align-items: start;
  border-bottom: 1px solid var(--workspace-line, #f0f0f3);
  display: flex;
  gap: 24px;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 18px;
}

.header h2,
.header p {
  margin: 4px 0 0;
}

.header p {
  color: var(--workspace-muted, #60646c);
  font-size: 13px;
}

.closeButton {
  background: var(--workspace-surface, #ffffff);
  border: 1px solid var(--workspace-line-strong, #dcdee0);
  border-radius: 8px;
  color: var(--workspace-text, #171717);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  min-height: 36px;
  padding: 0 12px;
}

.closeButton:hover,
.closeButton:focus-visible {
  background: var(--workspace-surface-muted, #fafafa);
  outline: none;
}

@media (max-width: 760px) {
  .overlay {
    padding: 12px;
  }

  .dialog {
    max-height: calc(100dvh - 88px);
    padding: 16px;
  }
}
```

기존 `diagram-editor.module.css`의 `.leftRail :global(.templateModal*)` 규칙은 Portal DOM과 더 이상 일치하지 않으므로 제거한다.

- [x] **Step 4: 집중 테스트를 다시 실행해 통과 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/resource-settings-panel.test.ts
```

Expected: 모든 `resource-settings-panel` 테스트 PASS.

- [x] **Step 5: Web 회귀 검사 실행**

Run:

```bash
pnpm --filter @sketchcatch/web test
pnpm --filter @sketchcatch/web typecheck
pnpm --filter @sketchcatch/web lint
```

Expected: 테스트와 typecheck는 0 failures, lint는 새 오류 없음.

- [x] **Step 6: 하네스와 diff 검증 후 커밋**

Run:

```bash
pnpm harness:check
git diff --check
git status --short
```

Expected: 하네스와 diff 검사 PASS, 변경 파일은 이 계획에 명시한 범위와 진행 기록뿐임.

Commit:

```bash
git add apps/web/features/resource-settings/index.tsx \
  apps/web/features/resource-settings/resource-settings-panel.test.ts \
  apps/web/features/resource-settings/template-library-modal.module.css \
  apps/web/features/diagram-editor/diagram-editor.module.css \
  docs/superpowers/plans/2026-07-14-template-library-portal.md \
  agent-progress.md
git commit -m "Fix: 템플릿 전체보기 모달 레이어 정리"
```

---

### Task 2: Review Fix Wave — 기능명과 Modal 접근성

**Files:**
- Modify: `apps/web/features/resource-settings/resource-settings-panel.test.ts`
- Modify: `apps/web/features/resource-settings/index.tsx`
- Create: `apps/web/features/resource-settings/template-library-modal-accessibility.ts`
- Create: `apps/web/features/resource-settings/template-library-modal-accessibility.test.ts`
- Modify: `apps/web/features/resource-settings/template-library-modal.module.css`
- Modify: `docs/superpowers/specs/2026-07-14-template-library-portal-design.md`
- Modify: `docs/superpowers/plans/2026-07-14-template-library-portal.md`
- Modify: `agent-progress.md`
- Append ignored report: `.superpowers/sdd/template-library-portal-task-1-report.md`

**Interfaces:**
- Produces: 정확히 `템플릿 전체보기`인 진입 버튼 이름과 visible `strong`
- Produces: `useRef`/`useEffect` 기반 focus lifecycle, Escape, Tab trap, body sibling `inert`, scroll lock, cleanup
- Produces: latest close callback ref와 mount-only lifecycle effect
- Produces: Node `EventTarget` fake DOM에서 실행되는 dependency-free behavioral regression
- Produces: `.closeButton:focus-visible`의 2px outline

- [x] **Step 1: 진입 버튼 블록의 새 명칭 계약을 테스트하고 RED 확인**

  Focused result: 6/7 PASS, 옛 `aria-label` 때문에 새 블록 계약 1건 FAIL.

- [x] **Step 2: 기능명 통일 후 focused GREEN 확인**

  Focused result: 7/7 PASS. 비교/Board 비적용 안내는 `small`에 유지.

- [x] **Step 3: focus lifecycle과 keyboard trap 계약을 테스트하고 RED/GREEN 확인**

  RED: 7/8 PASS, `useEffect`/`useRef` 계약 부재로 1건 FAIL.
  GREEN: 8/8 PASS after active-element capture, close-button focus, Escape, Tab/Shift+Tab cycle, listener cleanup, and focus restoration.

- [x] **Step 4: body sibling inert와 scroll lock 계약을 테스트하고 RED/GREEN 확인**

  RED: 8/9 PASS, body overflow/inert 상태 보존 부재로 1건 FAIL.
  GREEN: 9/9 PASS after symmetric inert/overflow setup and cleanup.

- [x] **Step 5: close button visible focus ring 계약을 테스트하고 RED/GREEN 확인**

  RED: 9/10 PASS because the existing rule used `outline: none`.
  GREEN: 10/10 PASS with a 2px outline and 2px offset.

- [x] **Step 6: review 후 stable lifecycle과 behavioral helper를 RED/GREEN으로 보강**

  RED: combined focused suite 8/10 PASS. Missing helper module and stable React wrapper each failed as expected.
  GREEN: combined focused suite 10/10 PASS. Fake DOM dispatches Escape/Tab/Shift+Tab and verifies focus, existing inert values, overflow, cleanup, latest close callback, and listener removal.

- [x] **Step 7: Web 전체 회귀 검사**

```bash
pnpm --filter @sketchcatch/web test
pnpm --filter @sketchcatch/web typecheck
pnpm --filter @sketchcatch/web lint
```

Expected: 새 실패 없음. 알려진 bundled-Node locale timestamp 1건만 기존 실패로 유지.

- [x] **Step 8: 하네스, diff, report와 commit 검증**

```bash
pnpm harness:check
git diff --check
git status --short
```

Expected: 검사 PASS, 변경 범위는 fix wave 파일뿐이며 `apps/api/drizzle/**`는 변경하지 않음.
