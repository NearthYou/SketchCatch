# Parameter Dropdown Clipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 Resource 파라미터 드롭다운이 필드 목록 경계에서 잘리지 않고 선택지를 표시하게 한다.

**Architecture:** 필수·추가·nested 파라미터가 공유하는 `.parameterFieldList`에서 팝업 클리핑을 제거한다. `SelectMenu` 자체와 Region/AZ 전용 컴포넌트의 동작 계약은 유지하고, 소스 계약과 실제 브라우저 레이아웃을 함께 검증한다.

**Tech Stack:** Next.js 16, React 19, CSS Modules, Node.js `node:test`, Playwright CLI

## Global Constraints

- 현재 브랜치에서 작업한다.
- 병행 중인 Terraform 관련 변경을 수정하거나 stage하지 않는다.
- 새 런타임 의존성을 추가하지 않는다.
- 공유 `SelectMenu`의 키보드, 포커스, ARIA 계약을 변경하지 않는다.

---

### Task 1: 공통 파라미터 드롭다운 클리핑 제거

**Files:**
- Modify: `apps/web/features/parameter-input/parameter-panel-source.test.ts`
- Modify: `apps/web/features/parameter-input/ParameterInputPanel.module.css`

**Interfaces:**
- Consumes: 필수 및 추가 파라미터가 공유하는 CSS Module 클래스 `parameterFieldList`
- Produces: enum/reference/nested 드롭다운이 필드 그룹 경계 밖에 표시될 수 있는 레이아웃 계약

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

`parameter-panel-source.test.ts`의 dense layout 테스트에서 다음 계약을 사용한다.

```ts
assert.match(parameterFieldListRule, /\boverflow:\s*visible;/);
assert.doesNotMatch(parameterFieldListRule, /\boverflow:\s*hidden;/);
```

필수·추가·nested 경로가 공통 `ParameterField`와 `SelectMenu`로 수렴하는지도 소스 계약으로 확인한다.

- [ ] **Step 2: RED 확인**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/parameter-input/parameter-panel-source.test.ts
```

Expected: 기존 `.parameterFieldList { overflow: hidden; }` 때문에 실패한다.

- [ ] **Step 3: 최소 CSS 수정**

```css
.parameterFieldList {
  border: 1px solid var(--workspace-line, #f0f0f3);
  border-radius: 8px;
  display: grid;
  gap: 0;
  overflow: visible;
}
```

- [ ] **Step 4: GREEN 및 관련 테스트 확인**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/parameter-input/parameter-panel-source.test.ts components/ui/select-menu-source.test.ts features/resource-settings/resource-settings-panel.test.ts
```

Expected: 모든 테스트가 통과한다.

- [ ] **Step 5: 브라우저 전수 매트릭스 검증**

필수 enum, 필수 reference, 추가 enum/reference, nested select/reference, Region, Availability Zone을 열어 메뉴의 bounding box가 필드 목록에 의해 잘리지 않는지 확인한다. 메뉴가 다음 필드 위에 표시되고 선택 및 키보드 탐색이 가능한지도 확인한다.

- [ ] **Step 6: 저장소 필수 검사와 커밋**

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm harness:check
git diff --check
```

Expected: 모든 명령이 exit code 0으로 끝난다. 병행 작업 파일은 커밋에서 제외한다.
