# Terraform 오류 Issues 고정 및 AI 해결 적용 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terraform 오류를 Issues 탭에 고정하고, AI chat dock 기반 해결 가이드와 제한된 안전 적용 흐름을 구현한다.

**Architecture:** shared type과 API explanation payload를 먼저 확장한 뒤, 프론트엔드에서 diagnostics 유지 상태를 프로젝트별 `localStorage`와 연결한다. UI는 Terraform 패널 하단 오류 상세를 제거하고 Issues 탭과 AI chat dock으로 책임을 분리한다.

**Tech Stack:** TypeScript, React, Next.js, Zod, pnpm, localStorage, existing SketchCatch AI explanation API.

---

## Milestone 0. 기준 확인과 작업 격리

**Priority:** P0

**Files:**
- Read: `AGENTS.md`
- Read: `docs/AGENTS.md`
- Read: `agent-progress.md`
- Read: `feature_list.json`

- [ ] `feature/ck/161-terraform-issue-ai-fix` clean worktree에서 작업 중인지 확인한다.
- [ ] `pnpm harness:check`를 실행해 시작 기준선을 확인한다.
- [ ] 기존 dirty worktree의 `feat/ck/152-ai-diagram-editing` 변경은 건드리지 않는다.
- [ ] 구현 범위가 `apps/web`, `apps/api`, `packages/types` 안에 머무는지 확인한다.

## Milestone 1. 타입과 API guidance payload 확장

**Priority:** P0

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/services/aiTerraformErrorExplanation.ts`
- Test: existing API AI/Terraform explanation tests

- [ ] `AiTerraformErrorExplanationResult`에 Well-Architected guidance와 consensus recommendation 필드를 추가한다.
- [ ] `safeFix` metadata를 추가하되 `terraform.trailing_comma`, `terraform.quoted_reference`만 `applicable: true`가 되게 한다.
- [ ] API response schema와 deterministic fallback explanation을 같은 shape로 맞춘다.
- [ ] Amazon Q 전용 신규 인증/환경변수는 만들지 않는다.
- [ ] LLM explanation이 실패해도 deterministic guidance가 유지되게 한다.
- [ ] API 테스트에서 6개 pillar, 적용 가능 진단, 적용 불가 진단을 검증한다.

## Milestone 2. Terraform issue 상태 모델과 localStorage 유지

**Priority:** P0

**Files:**
- Create or Modify: `apps/web/features/workspace/terraform-issues-state.ts`
- Modify: `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- Test: workspace issues state/unit tests

- [ ] diagnostic key 생성 로직을 Issues state에서도 재사용 가능한 helper로 분리한다.
- [ ] 프로젝트별 저장 키 `sketchcatch:terraform-issues:${projectId}`를 사용한다.
- [ ] validation result가 들어오면 같은 key는 갱신하고, 새 key는 추가하며, validation result에 없는 key는 해결된 것으로 제거한다.
- [ ] 코드 편집 이벤트가 들어오면 기존 issue를 삭제하지 않고 `isStale: true`로 표시한다.
- [ ] 새로고침 시 `localStorage`에서 복원하되 파싱 실패나 타입 불일치는 빈 상태로 복구한다.
- [ ] 테스트는 저장, 복원, stale 전환, 해결된 이슈 제거를 포함한다.

## Milestone 3. Terraform 패널 오류 노출 방식 변경

**Priority:** P1

**Files:**
- Modify: `apps/web/features/workspace/TerraformCodePanel.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Test: Terraform panel or workspace right panel tests

- [ ] 하단 Terraform 오류 상세/AI 설명 패널 렌더링을 제거한다.
- [ ] 오류가 존재하면 상단 banner에 Issues 확인 안내와 `Issues 탭으로 이동` 버튼을 표시한다.
- [ ] 버튼은 기존 `onOpenIssues` callback을 호출한다.
- [ ] 코드 편집 시 `setDiagnostics([])` 또는 parent diagnostics clear를 하지 않는다.
- [ ] 대신 parent에 stale 전환 이벤트를 전달하거나 WorkspaceRightPanel에서 편집 이벤트를 받아 stale 처리한다.
- [ ] 오류가 없는 상태에서는 기존 저장/동기화 UX를 유지한다.

## Milestone 4. Issues 탭 UI 개선

**Priority:** P1

**Files:**
- Modify: `apps/web/features/workspace/TerraformIssuesPanel.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Test: Issues panel rendering tests

- [ ] Issues 탭에 severity, source file/line, stale badge, last validated 표시를 추가한다.
- [ ] 각 Terraform issue에 `AI 해결` 버튼을 추가한다.
- [ ] 적용 가능한 진단은 `자동 적용 가능`, 나머지는 `수동 수정 필요`로 표시한다.
- [ ] issue count는 persisted issue state 기준으로 표시한다.
- [ ] empty state는 "표시할 Terraform 이슈가 없습니다"처럼 현재 의미에 맞게 정리한다.

## Milestone 5. AI chat dock 연결

**Priority:** P1

**Files:**
- Modify: `apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx`
- Modify: `apps/web/features/workspace/WorkspaceAiChatDock.tsx`
- Modify: `apps/web/features/workspace/api.ts`
- Test: AI dock/workspace interaction tests

- [ ] Issues panel의 `AI 해결` 클릭을 상위 workspace로 올리는 callback을 추가한다.
- [ ] Workspace AI chat dock에 Terraform issue 요청을 전달하는 prop/state를 추가한다.
- [ ] chat message kind에 Terraform issue/fix 메시지를 추가한다.
- [ ] 메시지는 원인, 영향, 6개 pillar, 최종 권고, 적용 가능 여부를 표시한다.
- [ ] API 호출 실패 시 deterministic/local 안내와 재시도 가능 상태를 보여준다.
- [ ] AI dock은 클릭 즉시 열리고 Terraform issue 메시지 위치로 스크롤된다.

## Milestone 6. 안전 적용 흐름 구현

**Priority:** P1

**Files:**
- Create or Modify: `apps/web/features/workspace/terraform-safe-fixes.ts`
- Modify: `apps/web/features/workspace/TerraformCodePanel.tsx`
- Modify: `apps/web/features/workspace/WorkspaceAiChatDock.tsx`
- Test: safe fix unit tests and workspace integration tests

- [ ] `terraform.trailing_comma` fixer는 diagnostic line의 마지막 comma만 제거한다.
- [ ] `terraform.quoted_reference` fixer는 감지된 quoted reference만 unquote한다.
- [ ] fixer가 line/source를 특정할 수 없으면 적용 불가로 반환한다.
- [ ] `적용` 클릭 시 Terraform editor code를 변경한다.
- [ ] 변경 직후 validation을 다시 실행한다.
- [ ] validation이 통과하거나 해당 diagnostic이 사라지면 기존 save/sync pipeline을 호출한다.
- [ ] validation 실패 시 코드는 유지하되 Issues 탭에 최신 diagnostics를 표시하고 실패 메시지를 chat dock에 남긴다.
- [ ] 실제 AWS apply/destroy나 cloud mutation은 호출하지 않는다.

## Milestone 7. 검증과 문서 정리

**Priority:** P2

**Files:**
- Modify as needed: `docs/data-models.md`
- Modify as needed: `agent-progress.md`
- Modify as needed: `session-handoff.md`

- [ ] shared type/API 계약이 바뀌면 `docs/data-models.md`에 AI explanation result와 Terraform issue state를 반영한다.
- [ ] `pnpm harness:check`를 실행한다.
- [ ] `pnpm lint`를 실행한다.
- [ ] `pnpm typecheck`를 실행한다.
- [ ] `pnpm build`를 실행한다.
- [ ] `git diff --check`를 실행한다.
- [ ] 실행한 검증과 남은 리스크를 `agent-progress.md`에 기록한다.

## Acceptance Scenarios

- [ ] Terraform validation error가 생기면 Terraform 패널 하단 상세 오류가 보이지 않고 상단 Issues 안내가 보인다.
- [ ] `Issues 탭으로 이동`을 누르면 바로 Issues 탭이 열린다.
- [ ] Terraform 코드를 편집해도 기존 issue가 사라지지 않고 `재검증 필요`로 남는다.
- [ ] 브라우저 새로고침 후에도 프로젝트별 issue가 복원된다.
- [ ] 재검증에서 오류가 해결되면 해당 issue가 제거된다.
- [ ] `AI 해결`을 누르면 AI chat dock에 Terraform issue guidance가 생긴다.
- [ ] guidance에는 운영 우수성, 보안, 신뢰성, 성능 효율성, 비용 최적화, 지속 가능성이 모두 표시된다.
- [ ] `terraform.trailing_comma`, `terraform.quoted_reference`만 적용 가능하다.
- [ ] 적용 클릭 후 코드 수정, 재검증, 저장/다이어그램 동기화가 이어진다.
- [ ] 적용 불가 진단은 설명만 제공하고 자동 수정하지 않는다.

## Implementation Norms

1. User-Accepted Change 없이는 Terraform 코드를 바꾸지 않는다.
2. UI 컴포넌트에 Terraform 실행이나 cloud mutation 책임을 넣지 않는다.
3. safe fix는 deterministic rule-based 로직으로 제한한다.
4. AI 설명 실패가 Issues 표시 실패로 번지지 않게 한다.
5. persisted issue state는 RDS source of truth처럼 취급하지 않는다.
6. `localStorage`는 프로젝트별 key로 격리한다.
7. 새 Amazon Q 인프라 의존성은 이번 브랜치에서 만들지 않는다.
8. 타입 변경은 `packages/types`에서 시작해 API와 web으로 흘린다.
9. 테스트는 "사라지지 않아야 함"과 "해결되면 사라져야 함"을 모두 포함한다.
10. 오류 메시지에는 secrets나 환경변수 값을 그대로 노출하지 않는다.

