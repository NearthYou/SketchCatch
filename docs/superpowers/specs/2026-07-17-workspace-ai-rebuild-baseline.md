# `/workspace/ai` 재구축 기준점

작성일: 2026-07-17
기준 HEAD: `77706796`
범위: 새 UI를 만들기 전 기능 도달성 감사, 미사용 계약 제거, 기존 표현 계층 삭제

## 이 기준점의 목적

이 변경은 `/workspace/ai`의 새 화면을 구현하지 않는다. 기존 JSX, CSS, 전용 표현 컴포넌트와 DOM/CSS 기반 UI 테스트를 제거하고, 다음 UI가 다시 연결해야 할 제품 기능과 안전 경계만 남긴다. 현재 `page.tsx`는 의도적으로 `null`을 반환하는 임시 route shell이다.

기존 UI를 새 UI의 레퍼런스 구현으로 사용하지 않는다. 삭제된 레이아웃, progress panel, 모바일 pane, 시각 토큰과 Compiler summary를 복원하지 않는다.

## 감사 방법

각 계약을 다음 순서로 추적했다.

`사용자 진입점 → 화면 action → workflow → API client → route/service → shared type → 저장/navigation → 테스트`

import 또는 테스트가 남아 있다는 사실만으로 사용 중이라고 판정하지 않았다. UI 삭제 전 실제 product route에서 도달 가능한지, 다른 화면의 production consumer가 있는지, 승인·취소·stale 거부 같은 안전 책임인지로 A/B/C를 분류했다.

## 실제 사용자 진입 경로

### 새 프로젝트

1. `/workspace/new`의 AI 시작 action을 선택한다.
2. `sketchcatch.newProjectDraft` sessionStorage에 `projectName`, `startMode: "ai"`, `updatedAt`을 저장한다.
3. `/workspace/ai`로 이동한다.
4. workflow는 저장된 draft가 없으면 `/workspace/new`로 되돌린다.

새 UI는 이 storage key와 validation/복귀 계약을 다시 연결해야 한다.

### 기존 프로젝트와 Repository

1. Repository 화면의 “AI로 새 설계 만들기” link가 `/workspace/ai?projectId=...&projectName=...`를 만든다.
2. 기존 route는 query를 `existingProject`와 Repository return URL로 변환했다.
3. workflow는 이 mode에서 sessionStorage를 사용하지 않고 기존 프로젝트 JSON Draft API를 사용한다.

임시 null shell은 query를 읽지 않지만, 새 UI는 `projectId`, `projectName`, `/workspace/repository` 복귀 계약을 복원해야 한다. 이 경로는 실제 production 진입이므로 legacy/unreachable branch가 아니다.

## A. 유지한 기능 계약

### 대화와 입력

- assistant clarification과 follow-up suggestion
- 각 `AiStartMessage`의 stable `id`
- `selectionMode: "single"`과 suggestion 배열
- 질문 답변, draft follow-up, patch clarification, 일반 prompt routing의 기존 분기 순서
- text 입력과 확정 전 voice transcript의 구분
- 대화 최대 80개 제한
- 승인된 대화를 project별 Workspace AI Chat localStorage namespace로 넘기는 계약

### 요청 lifecycle

- 새 프로젝트 stream의 `AbortController`
- request identity로 이전 요청의 progress/result를 거부하는 stale 방지
- 마지막 요청 재시도
- cancel 후 last-good candidate projection 유지
- 기존 프로젝트의 JSON Draft 경로
- patch preview 요청과 clarification

현재 abort는 client fetch와 proxy upstream transport를 끊고 stale result를 거부한다. backend의 Amazon Q 생성 작업 자체까지 중단하는 계약은 아니다.

### 후보 제외와 undo

- 서버가 발급한 실제 candidate ID, Resource type, label tuple
- `provisionalArchitectureJson`과 `excludableCandidateIds`만 전달하는 최소 candidate snapshot
- 증가하는 `sequence`와 현재 snapshot 전체 교체
- 서버 allowlist, dangling edge/reference 검증, 빈 graph 방지
- 제외를 request에 포함해 재생성하고 마지막 제외를 undo하는 계약

중간의 장식용 AWS icon은 candidate가 아니다. Orbit의 icon을 클릭하거나 숨긴다고 exclusion request를 만들면 안 된다.

### final Preview와 승인

- Architecture Draft/Patch 결과를 Compiler proposal로 변환
- Compiler가 성공한 뒤에만 final Preview를 공개
- `compilationProposal.diagram`을 명시적 사용자 승인 뒤 저장
- 새 프로젝트 생성 성공 후 저장 실패 시 동일 project ID로 재시도
- 저장 뒤 Workspace로 이동하고 승인된 대화를 인계
- 실제 AWS Resource catalog와 `ArchitectureJson → DiagramJson` adapter

## B. 제거한 미사용 기능과 계약

### 기존 표현 계층

- `/workspace/ai` client JSX 전체
- route 전용 CSS와 디자인 토큰
- progress/empty/final preview JSX
- 모바일 `대화/진행 중인 초안` pane
- 후보 제외 overlay를 포함한 old AI preview component
- DOM 구조, CSS selector, source order를 검사하던 UI 테스트
- route 전용 Compiler summary JSX/CSS

### progress 표현 모델

- 단계 label과 placeholder 문구
- confirmed requirement 카드와 pending question count
- progress history와 final added/removed diff
- 중간 `ArchitectureJson → DiagramJson` 변환
- mobile pane 자동 전환 state/effect
- 4초 final diff timer

### server/API의 UI 전용 필드

- `ArchitectureDraftProgressStage`와 event/snapshot의 `stage`
- `confirmedRequirements`
- `pendingQuestions`
- clarification 직전의 별도 progress event
- 관련 requirement summary/pending question 생성 helper

stream은 제거하지 않았다. 후보 제외에 필요한 서버 candidate snapshot과 terminal result/error만 유지했다.

### 실제 consumer가 없던 계약

- `CreateArchitectureDraftRequest.dynamicQuestionAnswers`: Repository prompt에 동일 답변이 이미 포함되고 service에서는 old progress summary에만 사용됐다.
- `CreateArchitectureDraftRequest.templateFallback`: production producer와 service consumer가 없었다.
- hook의 읽히지 않던 `errorMessage` state/return
- `hasDraftResources`
- test에서만 사용하던 progress exclusion wrapper
- 외부 consumer가 없던 coordinator getter

## C. 다른 화면 때문에 유지하거나 이동한 기능

### Repository 미리보기

old `AiDraftBoardPreview`는 Repository 화면이 사용하고 있었다. AI route CSS에 매달린 채 삭제하지 않고, Repository-local read-only `RepositoryArchitecturePreview`와 CSS로 분리했다. Repository에는 `diagram` prop만 남겼으며 AI progress 전용 exclusion overlay는 이전하지 않았다.

### Compiler

route-only `ArchitectureBoardCompilationSummary`는 삭제했다. 반면 다음은 실제 Board/DiagramEditor consumer가 있으므로 유지했다.

- Compiler proposal과 compile 함수
- `architecture-board-compilation-preview.ts`
- 해당 preview mapper의 테스트와 index export

### 공유 API와 storage

- JSON Draft API는 Repository, Workspace AI Chat Dock, Workspace AI Panel에서도 사용하므로 유지했다.
- Patch API, compiler, diagram adapter, chat routing, draft follow-up도 공유 기능으로 유지했다.
- project별 chat storage key 생성 함수는 `WorkspaceAiChatDock.tsx`에서 중립적인 `workspace-ai-chat-storage.ts`로 이동해 AI start model이 presentation component를 역방향 import하지 않게 했다.
- 전역 notification center와 `/workspace/ai` placement는 root layout 소유이므로 건드리지 않았다.

## 새 UI가 복원하면 안 되는 것

- 삭제된 desktop split layout과 mobile progress tabs
- old CSS module, `--ai-*` 토큰, old card/empty/loading/final 화면
- 단계별 server progress를 장식 animation의 데이터 원천으로 사용하는 연결
- confirmed requirement/pending question progress summary
- progress history 또는 final diff toast
- Compiler metric summary를 final Preview 옆에 자동 복원하는 구성
- old source/CSS regex UI 테스트
- old progress 구현 계획을 복사용 reference로 사용하는 방식

## 다음 UI의 option 누적 계약

이 기준점에서는 구현하지 않는다.

- assistant 질문의 option을 클릭한 경우에만 현재 대화 세션에 기록한다.
- 직접 입력과 voice 입력은 option 누적 대상이 아니다.
- 질문 message의 stable ID와 option source를 함께 기록한다.
- 질문 하나당 option 하나만 선택할 수 있다.
- 같은 문구라도 다른 질문에서 클릭하면 별도 기록이다.
- 클릭 순서를 보존한다.
- request 실패 뒤에도 이미 선택한 기록을 유지한다.
- option 클릭은 기존 답변 전송 동작을 그대로 수행한다.

현재 구현은 suggestion 문자열만 `submitPrompt`로 보내므로 질문 ID와 클릭 출처가 유실되고, `selectionMode: "single"`도 실제로 강제하지 않는다. 새 UI는 이 미완성 동작을 복사하지 말고 위 계약을 구현해야 한다.

## 장식용 AWS icon/Orbit 계약

이 기준점에서는 구현하지 않는다.

- option 선택에 따라 EC2, RDS, Lambda 등 실제 AWS Resource icon 구성이 달라진다.
- 중간 icon은 대화 중 지루함을 줄이는 장식이며 실제 설계나 확정 Resource를 의미하지 않는다.
- 중간 구성은 틀릴 수 있다.
- final Preview만 Compiler 결과의 실제 Resource와 catalog icon을 사용한다.
- 장식 icon과 candidate exclusion을 연결하지 않는다.

## 알려진 기능 gap

이번 cleanup에서 기능 확장이나 별도 bug fix로 바꾸지 않은 항목이다.

- 기존 프로젝트 JSON Draft와 patch 요청은 새 프로젝트 stream과 같은 abort/stale coordinator를 사용하지 않는다.
- `retryDraft`는 현재 새 프로젝트 stream의 last request만 재시도한다.
- candidate exclusion은 새 프로젝트 stream에만 연결되어 있다.
- direct `/workspace/ai?projectId=...` 진입에는 route-level auth/project 존재 확인이 없다.
- 승인 성공 문구가 실제 save보다 먼저 transcript에 추가된다.
- session draft key/type 선언이 새 프로젝트 화면과 AI model에 중복돼 있다.

새 UI 재구축은 이 gap을 “보존된 안전 계약”으로 오해하지 않아야 한다.

## 삭제·이동 파일

삭제:

- `apps/web/app/workspace/ai/workspace-ai-start-client.tsx`
- `apps/web/app/workspace/ai/workspace-ai-start.module.css`
- `apps/web/app/workspace/ai/workspace-ai-start-client.test.ts`
- `apps/web/app/workspace/ai/ai-draft-board-preview.tsx`
- `apps/web/features/architecture-board-compiler/architecture-board-compilation-summary.tsx`
- `apps/web/features/architecture-board-compiler/architecture-board-compilation-summary.module.css`
- `docs/superpowers/plans/2026-07-17-ai-draft-progress-preview.md`

추가/이동:

- `apps/web/app/workspace/repository/repository-architecture-preview.tsx`
- `apps/web/app/workspace/repository/repository-architecture-preview.module.css`
- `apps/web/features/workspace/workspace-ai-chat-storage.ts`

임시 shell:

- `apps/web/app/workspace/ai/page.tsx`

## 검증

실행 결과:

- rebuild evidence Web 기능 테스트: 55/55 통과
- API stream route/Architecture Draft service 테스트: 77/77 통과
- Web 전체 `features`/`components` 회귀: 528/528 통과
- `pnpm harness:check`: 통과
- `pnpm lint`: 5/5 package 통과
- `pnpm typecheck`: 5/5 package 통과
- `pnpm build`: 5/5 package 통과. `/workspace/ai`는 정적 `null` route로 prerender됐다.
- `git diff --check`: 통과
- repository-wide `rg`: 삭제된 UI/summary/progress 계약의 production reference 없음. 본 문서의 삭제 기록과 `dynamicQuestionAnswers`를 전송하지 않는다는 부재 assertion만 남았다.
- 독립 diff 리뷰: Critical/Important/Minor finding 없음, Ready

`apps/web/app/workspace/repository/repository-start-client.test.ts`의 source 문자열 계약 2건은 이 cleanup 이전 기준 HEAD에서도 `repository-start-client.tsx`에 없던 Compiler/명시 승인 코드를 기대한다. 관련 없는 Repository 기능을 변경해 테스트를 맞추지 않았고, 이 변경의 evidence command에서 제외했다. Repository preview의 실제 이동은 typecheck과 production build로 검증했다.
