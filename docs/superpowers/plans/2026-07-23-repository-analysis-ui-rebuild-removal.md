# Repository Analysis UI Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or an equivalent test-first workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/workspace/repository`에서 기존 카드·미리보기·후보 목록 표현을 제거하고, 분석·추천·보드 생성 계약만 가진 최소 semantic HTML을 남긴다.

**Architecture:** `RepositoryStartClient`는 현재 API 호출, Project Draft 저장, Repository Analysis Record 저장, navigation을 계속 소유한다. 화면은 CSS Module과 Preview component 없이 form, status, semantic section, select, button만 사용하며 후보 데이터는 선택 값으로만 연결한다.

**Tech Stack:** Next.js client component, React, TypeScript, Node test runner, existing shared Repository Analysis types.

## Global Constraints

- 새 카드, Preview, placeholder, dependency를 추가하지 않는다.
- API response, Template ID·순서·적합도, Project Draft·Board 생성·AI 새 설계 흐름을 바꾸지 않는다.
- 관련 없는 파일과 기존 사용자 변경은 stage하지 않는다.
- 최종 커밋은 `refactor: clear repository analysis result ui` 한 개이며 push/PR은 만들지 않는다.

---

### Task 1: Lock the removal contract before changing JSX

**Files:**
- Modify: `apps/web/app/workspace/repository/repository-start-client.test.ts`

- [x] Add a failing regression that requires an unstyled semantic form/result surface and rejects the old CSS, Preview, card/list, icon, and product-state imports.
- [x] Run only that regression with `pnpm --filter @sketchcatch/web exec tsx --test --test-name-pattern "unstyled semantic" app/workspace/repository/repository-start-client.test.ts` and confirm it fails because the old presentation remains.

### Task 2: Remove presentation JSX while retaining the repository flow

**Files:**
- Modify: `apps/web/app/workspace/repository/repository-start-client.tsx`

- [x] Keep the existing repository load, public analysis, recovery, recommendation, Board save, Analysis Record retry, and AI navigation handlers.
- [x] Replace CSS-bound controls with native labeled URL/branch fields, native selects, buttons, `role="status"`, `role="alert"`, and semantic result sections.
- [x] Replace candidate cards with a single native Template select and preserve candidate order, title, ID, and chosen ID passed to the existing Board-save handlers.
- [x] Remove `RepositoryArchitecturePreview`, the old topbar/product presentation imports, icon wrappers, visual stage wrappers, and preview-diagram helper.
- [x] Run the focused test and confirm it passes.

### Task 3: Remove dedicated legacy presentation assets and stale UI assertions

**Files:**
- Delete: `apps/web/app/workspace/repository/repository-start.module.css`
- Delete: `apps/web/app/workspace/repository/repository-architecture-preview.tsx`
- Delete: `apps/web/app/workspace/repository/repository-architecture-preview.module.css`
- Modify: `apps/web/app/workspace/repository/repository-start-client.test.ts`

- [x] Delete only the files with no remaining consumers.
- [x] Keep function/contract tests for URL analysis, branch passing, recovery, Board generation, Draft revision, Analysis Record persistence, and AI start navigation.
- [x] Remove tests that assert old class names, card layout, Preview, full-width actions, icon wrappers, or old copy composition.
- [x] Run the repository route tests and the related recommendation/handoff tests.

### Task 4: Record the clean baseline and verify the route

**Files:**
- Create: `docs/superpowers/specs/2026-07-23-repository-analysis-ui-rebuild-baseline.md`

- [x] Record preserved semantic/API/Template/Board contracts and every removed legacy UI asset.
- [x] Run focused tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` when possible, and `git diff --check`.
- [x] Use a non-conflicting local port to verify route entry, authenticated session, console, and initial overflow. Success/error/retry browser states need a reproducible API fixture; focused tests cover those states.
- [x] Stage only the files above and commit them as `refactor: clear repository analysis result ui`.
