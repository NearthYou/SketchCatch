# Workspace AI 대화 경험 재구축 구현 계획

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 삭제 상태를 유지한 `/workspace/ai`에 선택 의미를 보존하는 대화 UI, presentation-only AWS Resource Orbit, Compiler Diagram 기반 최종 Preview를 새 책임 경계로 구현한다.

**Architecture:** retained `useAiStartWorkflow`가 대화·요청·Compiler·승인 경계를 소유하고, 새 route client shell은 이를 순수 선택 모델과 presentation mapper에 연결한다. 장식 Orbit은 catalog-backed Resource icon만 사용하지만 실제 추천을 표현하지 않으며, 최종 결과는 `compileArchitectureDraftProposal(...).diagram`만 읽기 전용 viewer에 전달한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, `@xyflow/react`, Node `tsx --test`.

---

### Task 1: 선택 누적 계약을 순수 모델로 고정

**Files:**

- Create: `apps/web/app/workspace/ai/selected-option-model.ts`
- Create: `apps/web/app/workspace/ai/selected-option-model.test.ts`

1. 질문별 single selection, stable ID, 순서, 시각을 검증하는 실패 테스트를 작성한다.
2. 같은 질문 재클릭은 원본 상태를 반환하고, 같은 label의 다른 질문은 별도 기록하는 최소 모델을 구현한다.
3. 직접 입력·음성 입력은 모델 호출 경계 밖에 남는 것을 shell interaction model 테스트로 고정한다.

### Task 2: option-to-resource presentation mapper 구현

**Files:**

- Create: `apps/web/app/workspace/ai/option-resource-presentation.ts`
- Create: `apps/web/app/workspace/ai/option-resource-presentation.test.ts`
- Read: `apps/web/features/resource-settings/catalog.ts`

1. 실제 catalog의 `/Resource-Icons_07312025/` AWS 항목만 후보가 되는 실패 테스트를 작성한다.
2. 10개 초기 구성과 선택당 2~4개 교체 규칙을 stable hash로 구현한다.
3. serverless, compute, database, storage, container, network, messaging, security, observability hint와 unknown fallback을 검증한다.

### Task 3: 새 대화 shell과 장식 stage 구성

**Files:**

- Modify: `apps/web/app/workspace/ai/page.tsx`
- Create: `apps/web/app/workspace/ai/workspace-ai-shell.tsx`
- Create: `apps/web/app/workspace/ai/conversation-transcript.tsx`
- Create: `apps/web/app/workspace/ai/workspace-ai-composer.tsx`
- Create: `apps/web/app/workspace/ai/selected-option-trail.tsx`
- Create: `apps/web/app/workspace/ai/decorative-aws-orbit.tsx`
- Create: `apps/web/app/workspace/ai/workspace-ai.module.css`
- Create: `apps/web/app/workspace/ai/workspace-ai-presentation.test.ts`

1. option click만 선택을 먼저 기록한 뒤 기존 `submitPrompt`로 즉시 전달한다.
2. transcript auto-follow는 사용자가 하단에 있을 때만 수행하고 composer는 Enter/Shift+Enter/IME와 최대 6줄을 지킨다.
3. Orbit은 `aria-hidden`, pointer 제외, 2~3개 CSS orbit, 짧은 반응, mobile 밀도 축소, reduced-motion 정적 교체를 구현한다.
4. candidate exclusion은 실제 progress candidate ID와 label이 있을 때 대화 action 영역에서만 제공한다.

### Task 4: Compiler Diagram 전용 읽기 모드와 최종 Preview

**Files:**

- Modify: `apps/web/features/diagram-editor/types.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`
- Modify: `apps/web/features/diagram-editor/diagram-editor.module.css`
- Create: `apps/web/app/workspace/ai/final-architecture-preview.tsx`
- Create: `apps/web/features/diagram-editor/diagram-viewer-mode.test.ts`

1. DiagramEditor의 viewer 정책을 순수 계약으로 테스트하고 편집 rail/history/save/mutation controls를 제거한다.
2. pan/zoom/fit만 허용하고 Compiler proposal의 `diagram`을 source와 preview로 동일하게 전달한다.
3. metadata, assumptions, warnings, fallback/Compiler diagnostics를 접근 가능한 details로 제공한다.
4. 다시 생성과 명시적 Board 적용을 final action으로 제공하고 승인 전 저장이 일어나지 않게 유지한다.

### Task 5: 요청 취소·retry와 route entry 완성

**Files:**

- Modify: `apps/web/app/workspace/ai/use-ai-start-workflow.ts`
- Modify: `apps/web/app/workspace/ai/use-ai-start-workflow.test.ts`
- Modify: `apps/web/app/workspace/ai/page.tsx`

1. stream, JSON draft, patch 요청에 stale/abort guard를 적용한다.
2. 오류·취소·retry 동안 shell의 선택 기록이 유지되는 interaction model을 검증한다.
3. `projectId`, `projectName` query를 retained existing-project 입력으로 안전하게 연결한다.

### Task 6: 결정과 용어 문서 갱신

**Files:**

- Create: `docs/adr/0014-workspace-ai-semantic-selection-and-preview-boundary.md`
- Modify: `docs/adr/README.md`
- Modify: `CONTEXT.md`
- Modify: `agent-progress.md`
- Modify: `feature_list.json`

1. ADR 0014가 `0012-structured-draft-progress-view.md`를 supersede한다고 명시한다.
2. Selected Option Trail, Decorative Resource Orbit, final Architecture Draft Preview의 정확성·승인 경계를 구분한다.
3. 완료 범위와 검증 근거만 tracker에 기록한다.

### Task 7: 검증, 브라우저 QA, 단일 커밋

**Files:**

- Verify only; unrelated dirty docs are excluded from staging.

1. 새 route 테스트와 관련 workflow/compiler/diagram 테스트를 실행한다.
2. `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, 가능한 `pnpm test`, `git diff --check`를 실행한다.
3. 390×844, breakpoint 전후, 1024×768, 1440×900에서 실제 route를 검증하고 reduced-motion·overflow·console을 확인한다.
4. 관련 파일만 stage해 `feat: rebuild workspace AI conversation experience` 단일 커밋을 만들고 push/PR은 만들지 않는다.
