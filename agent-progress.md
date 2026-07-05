# 에이전트 진행 로그

이 파일은 새 세션이 이전 대화 기억 없이도 저장소의 현재 작업 상태를 복구하기 위한 지속 상태다. 제품 범위의 정답은 `docs/product.md`, 계약의 정답은 `docs/data-models.md`, 실행 경계의 정답은 `docs/architecture.md`에 둔다. 이 파일은 "지금 에이전트 작업이 어디까지 검증되었는가"만 기록한다.

## 현재 검증된 상태

- Repository root directory: `./` (local repository root)
- Standard startup path: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1`
- Standard verification path for code/infrastructure changes: `pnpm lint`, `pnpm typecheck`, `pnpm build`
- Lightweight harness verification: `pnpm harness:check` or `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1`
- Current harness feature list: `feature_list.json`
- Current handoff note: `session-handoff.md`
- Highest priority unfinished harness feature: `HARNESS-007`
- Current blocker: none

### 2026-07-05 - Issue #161 Terraform 오류 AI 해결 변경 이동

- Goal: `feat/ck/152-ai-diagram-editing`에 섞여 있던 Terraform 오류 Issues/AI 해결 변경을 `feature/ck/161-terraform-issue-ai-fix` worktree로 옮기고, AI 다이어그램 수정 흐름과 분리해 커밋 가능한 상태로 만든다.
- Completed:
  - Terraform 오류 AI 설명 타입/API/테스트, Issues 상태 저장, safe fix, Issues 패널/AI chat dock 연결, 관련 문서를 #161 worktree로 이동했다.
  - `WorkspaceAiChatDock` 충돌은 #161의 기존 초안/시뮬레이션 흐름을 기준으로 해소하고 Terraform Issue AI 요청/결과 표시만 추가했다.
  - #152 AI 다이어그램 브랜치의 patch preview 및 `saveDiagramNow` 의존성은 #161 범위가 아니므로 가져오지 않았다.
- Verification run:
  - `pnpm harness:check` - sandbox EPERM 후 권한 재실행으로 passed before conflict resolution.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiTerraformErrorExplanation.test.ts src/services/aiProviderRouter.test.ts` - passed, 12 tests.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-safe-fixes.test.ts features/workspace/terraform-issues-state.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-error-explanation-panel.test.ts` - passed, 47 tests.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - failed once on AI diagram branch-only `context.saveDiagramNow`, then passed after removing that dependency.
  - `pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - 실제 AWS apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - 실제 Amazon Q 인증/환경 연동은 기존 AI provider/fallback 계약 안에서만 테스트했다.

### 2026-07-04 - PR #151 리뷰 대응

- Goal: PR #151에 남은 review thread를 반영해 프로젝트별 AI 채팅 기록 저장과 Terraform 참조 기반 area 부모 추론을 보정한다.
- Completed:
  - `WorkspaceAiChatDock`에서 `projectId` 전환 직후 이전 프로젝트 메시지가 새 프로젝트 저장소 키로 덮어써지지 않도록, 로드 완료 프로젝트를 ref로 추적하고 저장 effect를 guard 처리했다.
  - `workspace-ai-diagram-adapter`의 Terraform 참조 매칭을 `.id`뿐 아니라 `.arn`, `.name`, `.execution_arn`까지 인식하도록 확장했다.
  - 프로젝트 전환 저장 guard와 Terraform 참조 suffix 매칭 회귀 테스트를 추가했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-guardrail-warning.test.ts --test-name-pattern "storage skips"` - passed.
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-diagram-adapter.test.ts --test-name-pattern "common Terraform reference attributes"` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
- Known risks:
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the route type import was restored before commit.
  - GitHub review thread에는 별도 resolve/comment를 남기지 않았다.

### 2026-07-04 - AI 채팅 입력 보조 문구 제거

- Goal: AI 채팅 입력 영역에서 `정보가 부족하면 질문부터 할게요`, `더 정확히: 공개 여부...`, `메시지` 라벨, 입력칸 placeholder를 제거하고, 채팅 패널 폭은 이전 floating dock 크기로 되돌린다.
- Completed:
  - `WorkspaceAiChatDock`에서 prompt guide 보조 문구, 입력 라벨, placeholder를 제거하고 textarea에는 화면에 보이지 않는 `aria-label`만 남겼다.
  - 기존 `WorkspaceAiPanel` prompt guide에서도 같은 보조 문구와 tiny hint를 제거했다.
  - `aiChatDock` 폭을 다시 `min(860px, ...)` 제한으로 복구해 하단 패널이 과하게 길어지지 않게 했다.
  - 제거된 tiny hint CSS와 dock guide 3열 레이아웃을 정리했다.
  - source-based UI 테스트가 제거된 문구와 floating dock 폭을 회귀 검증하게 했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-guardrail-warning.test.ts apps\web\features\workspace\workspace-right-panel-layout.test.ts` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the route type import was restored before commit.
  - Visual browser screenshot was not captured in this turn.

### 2026-07-04 - AI 채팅 Dock 입력 영역 레이아웃 보정

- Goal: 하단 AI 채팅창이 가로 공간을 꽉 쓰고, 안내 문구는 위쪽 compact 영역으로 빠지며, 남는 공간은 메시지/채팅 영역이 차지하게 한다.
- Completed:
  - `WorkspaceAiChatDock`의 prompt guide에 dock 전용 class를 추가해 오른쪽 패널의 기존 AI panel guide와 스타일 영향 범위를 분리했다.
  - AI chat dock을 `left: 24px`, `right: 24px`, `width: auto`로 바꿔 오른쪽 패널 상태를 고려한 가용 폭 전체를 사용하게 했다.
  - composer를 `guide full-width row + textarea/send row` 구조로 바꾸고, prompt guide를 더 얇은 compact 스타일로 조정했다.
  - 좁은 화면에서는 guide와 composer가 1열로 접히도록 media rule을 보정했다.
  - source-based layout regression test를 추가해 prompt guide가 다시 왼쪽 열을 차지하거나 dock 폭이 제한되는 회귀를 잡게 했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-right-panel-layout.test.ts` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - In-app browser was unavailable in this session, so visual screenshot verification could not be captured.
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the route type import was restored before commit.
  - Existing unrelated dirty changes remain in agent progress, AWS connection files, API requirement resolution, API client, AI guide doc, and `api-client-error-message.test.ts`.

### 2026-07-04 - AI 초안 리소스 수량 반영

- Goal: `EC2 3개`, `S3 5개`처럼 자연어에 명시된 리소스 수량이 Architecture Draft에 실제 노드 개수로 반영되게 한다.
- Completed:
  - 자연어에서 EC2/서버/인스턴스와 S3/버킷/스토리지 주변의 숫자 및 한국어 수량 표현을 안정적으로 추출하는 수량 resolver를 추가했다.
  - 요청 수량에 맞춰 `app-server`, `app-server-2`와 `upload-bucket`, `upload-bucket-2`처럼 결정적인 ID와 위치를 가진 반복 노드를 생성하게 했다.
  - EC2 여러 개와 S3 여러 개 사이의 저장 연결, CloudFront 전달 연결, DB 연결, IAM/AMI/로그/알람 연결이 누락되지 않도록 관계선을 반복 생성하게 했다.
  - `서비스`의 `세`처럼 일반 단어 안의 글자가 수량으로 오인되지 않도록 count parsing 조건을 보정했다.
- Verification run:
  - Red before fix: `.\apps\api\node_modules\.bin\tsx.CMD --test apps\api\src\routes\ai.test.ts --test-name-pattern "requested EC2 and S3 counts"` failed because the draft still generated only one EC2 node.
  - `.\apps\api\node_modules\.bin\tsx.CMD --test apps\api\src\routes\ai.test.ts --test-name-pattern "architecture-draft"` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - 수량은 현재 지원 리소스 중 EC2 실행 공간과 S3 저장 공간에 우선 적용된다.
  - `agent-progress.md`는 기존 dirty history와 섞여 있어 이번 feature commit에는 포함하지 않는다.
  - 기존 unrelated dirty changes remain in AWS connection files, API client, API requirement resolution, AI guide doc, and `api-client-error-message.test.ts`.

### 2026-07-04 - AI clarification 선택지 확장

- Goal: `웹사이트 하나 배포하고 싶어` clarification에서 선택지가 너무 한정적인 문제를 줄이고, 더 다양한 웹서비스 유형을 고를 수 있게 한다.
- Completed:
  - 웹사이트 종류 선택지를 3개에서 6개로 확장했다: 소개/랜딩, 블로그/콘텐츠, 문의/예약/신청, 로그인/마이페이지, 상품 판매/결제, 운영자 관리 화면.
  - 방문자 기능 선택지를 3개에서 6개로 확장했다: 보기만, 검색/필터, 파일 업로드, 게시글/회원 정보 저장, 주문/결제, 운영자 확인.
  - 운영 기준에 `운영자가 장애를 빨리 알아야 해요`를 추가했다.
  - 새 선택지가 구현 리스트와 자연어 draft prompt에 반영되도록 검색/필터, 결제/주문, 운영자 관리, 운영 알림 문맥을 추가했다.
- Verification run:
  - Red before fix: `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-clarification.test.ts` failed because options were still limited to 3 and commerce/admin choices had no implementation context.
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-clarification.test.ts` - passed.
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-guardrail-warning.test.ts` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `agent-progress.md` has unrelated existing dirty history and should not be staged with the feature commit.
  - Existing unrelated dirty changes remain in AWS connection files, API client, API requirement resolution, AI guide doc, and `api-client-error-message.test.ts`.
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the route type import was restored before commit.

### 2026-07-04 - AI clarification 멀티 선택 보정

- Goal: `웹사이트 하나 배포하고 싶어` clarification에서 예약/신청과 로그인/마이페이지처럼 동시에 성립할 수 있는 항목을 하나만 고르게 하지 않고 여러 개 선택할 수 있게 한다.
- Completed:
  - 첫 질문과 방문자 기능 질문에 `selectionMode: "multiple"`을 추가하고, 추천 답안 문구에 `여러 개 선택 가능`을 표시했다.
  - 채팅 추천 칩을 여러 개 토글한 뒤 `선택 완료`로 한 번에 전송하게 UI 상태와 스타일을 추가했다.
  - 한 답변에 포함된 여러 선택지를 각각 저장하고, 답변 요약은 질문별로 묶어서 표시하게 했다.
  - 선택 조합이 자연어 draft prompt와 구현 리스트에 모두 반영되도록 `문의/예약/신청`, `로그인/마이페이지`, `파일 업로드`, `게시글/회원 정보 저장` 조건을 독립적으로 계산하게 했다.
- Verification run:
  - Red before fix: `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-clarification.test.ts` failed because one answer was stored as one custom label and `selectionMode` was missing.
  - Red before fix: `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-guardrail-warning.test.ts` failed because chat suggestion chips had no multi-select state or submit action.
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-clarification.test.ts` - passed.
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-guardrail-warning.test.ts` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `agent-progress.md` itself already has unrelated dirty history and should not be staged with the feature commit unless reviewed separately.
  - Existing unrelated dirty changes remain in AWS connection files, API client, API requirement resolution, AI guide doc, and `api-client-error-message.test.ts`.
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the route type import was restored before commit.

### 2026-07-04 - AI 질문 선택지 중복 제거와 예약/신청 해석 보정

- Goal: `웹사이트 하나 배포하고 싶어` clarification 흐름에서 `문의/예약/신청`과 `로그인/마이페이지`가 같은 축에 섞여 보이는 문제를 줄인다.
- Completed:
  - 첫 질문 선택지를 `소개/랜딩 페이지`, `문의만 받는 사이트`, `예약/신청을 관리하는 서비스`로 바꿔 목적 선택지가 겹치지 않게 했다.
  - 로그인/마이페이지는 방문자 기능 질문의 별도 선택지로 옮겼다.
  - 예약/신청 선택 후 생성되는 prompt와 구현 리스트에 사용자별 상태 확인, 로그인/마이페이지, 데이터 저장 맥락이 들어가게 했다.
  - 직접 `예약/신청을 관리하는 웹사이트`라고 입력해도 backend가 `backend_with_db`와 auth/database/server facts로 해석하게 keyword rules를 보강했다.
- Verification run:
  - Red before fix: `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-clarification.test.ts` failed because old options still included `문의/예약/신청을 받는 사이트` and `로그인/마이페이지가 있는 서비스`.
  - Red before fix: `.\apps\api\node_modules\.bin\tsx.CMD --test apps\api\src\routes\ai.test.ts --test-name-pattern "beginner-friendly prompt wording"` failed because `예약/신청` prompt returned `static_site`.
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps\web\features\workspace\workspace-ai-clarification.test.ts` - passed.
  - `.\apps\api\node_modules\.bin\tsx.CMD --test apps\api\src\routes\ai.test.ts --test-name-pattern "beginner-friendly prompt wording"` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
- Known risks:
  - Documentation-only `agent-progress.md` update is mixed with existing unrelated dirty changes and should not be staged unless reviewed separately.
  - Existing unrelated dirty changes remain in AWS connection files, API client, AI guide doc, and `api-client-error-message.test.ts`.

### 2026-07-04 - 자연어 다이어그램 003 문서 ResourceDefinition 최신화

- Goal: dev 최신화 후 AI 다이어그램 변환 경로가 shared `ResourceDefinition`과 Terraform identity를 어떻게 쓰는지 `003_자연어다이어그램생성구현정리.md`에 반영한다.
- Completed:
  - `workspace-ai-diagram-adapter` 설명을 hardcoded map이 아니라 shared definition lookup 기준으로 바꿨다.
  - `ResourceDefinition과 Terraform identity 연결` 섹션을 추가해 domain `ResourceType`, Terraform `blockType/resourceType`, Web catalog presentation 책임을 분리해 설명했다.
  - API/Web reverse mapping, catalog script module resolution, 관련 regression test와 읽는 순서/주의사항을 최신 코드 기준으로 보강했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed before edits after sandbox cache failure rerun outside sandbox.
  - Markdown link target and line-anchor range scan - passed for 286 links.
  - `git diff --check -- docs/ck/ai/003_자연어다이어그램생성구현정리.md` - passed with line-ending warning only.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after edits.
- Known risks:
  - Documentation-only change. Existing unrelated dirty changes remain outside this doc update and should not be staged with this commit.

### 2026-07-04 - dev ResourceDefinition 호환 보강

- Goal: dev에서 들어온 shared `ResourceDefinition`/Terraform catalog 흐름을 AI 다이어그램 변환 경로에 맞춰 적용한다.
- Completed:
  - `packages/types/src/resource-definitions.ts`에 AI Draft가 쓰는 IAM, KMS, CloudWatch, API Gateway, Lambda Permission domain `ResourceType` 매핑을 보강했다.
  - Web `workspace-ai-diagram-adapter`와 API `diagram-to-architecture`의 hardcoded Terraform type map을 제거하고 shared definition 조회로 대체했다.
  - catalog 생성 스크립트가 VM에서 Web 파일을 실행할 때 해당 파일 기준 `require`를 사용하도록 고쳐 workspace subpath export를 해석하게 했다.
  - hardcoded map 재도입을 막는 회귀 테스트를 API/Web에 추가했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts apps/web/features/resource-settings/catalog.test.ts` - passed, 21 tests.
  - `.\apps\api\node_modules\.bin\tsx.CMD --test apps/api/src/services/diagram-to-architecture.test.ts apps/api/src/services/terraform/infrastructure-graph.test.ts` - passed, 12 tests.
  - `npm exec --package=pnpm@11.8.0 -- pnpm catalog:check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - 기존 unrelated dirty changes는 AWS connection 검증 파일, API client, AI 요구사항 해석 파일, AI 문서에 남아 있으며 이번 커밋 범위에서 제외한다.

### 2026-07-04 - 자연어 다이어그램 003 문서 라인별 함수 해설 보강

- Goal: `docs/ck/ai/003_자연어다이어그램생성구현정리.md`의 Architecture Draft service pipeline을 표 요약이 아니라 코드 라인별 해설로 다시 정리한다.
- Completed:
  - 기존 `5.1 함수별 역할` 표를 제거했다.
  - `## 5. API 흐름` 아래를 `5.1 Service Pipeline 한 줄씩 뜯기` 섹션으로 바꿨다.
  - `createArchitectureDraft` 내부 각 줄, `normalizeArchitectureDraftRequest`, `resolveArchitectureRequirement`, `createDraftFromRequirementFacts`, `applyOperatingConditionConfig`, `applyGuardrailMetadata`의 주요 실행 줄을 순서대로 설명했다.
  - route 단계의 `addArchitectureDraftLlmExplanation`은 구조 결정이 아니라 설명 보강이라는 경계를 덧붙였다.
- Verification run:
  - `pnpm harness:check` - failed because `pnpm` is not installed in PATH.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1` - failed because the helper also requires `pnpm`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after rerun with approval.
  - Markdown link target and line-anchor range scan - passed for 259 links.
  - Remaining file-link-without-`#L` scan - passed.
  - Table-removal scan for `함수별 역할` and `| 함수 | 책임 | 결과 |` - passed.
  - `git diff --check -- docs/ck/ai/003_자연어다이어그램생성구현정리.md` - passed with line-ending warning only.
- Known risks:
  - Documentation-only change. Source code line numbers can drift after future edits, so this document's `#L` anchors need rechecking when referenced files move.

### 2026-07-04 - 자연어 다이어그램 003 문서 라인 링크 보강

- Goal: `docs/ck/ai/003_자연어다이어그램생성구현정리.md`의 코드 참조 링크를 실제 파일 line anchor로 바꿔 코드 읽는 사람이 바로 이동할 수 있게 한다.
- Completed:
  - 기존 파일 단위 링크를 타입, route, service 함수, frontend handler, 테스트 시작 라인으로 세분화했다.
  - 전체 흐름, 요청 계약, frontend 책임, API 흐름, fact 해석, 리소스 조립, 운영 조건, deterministic 보장, preview/apply 경계, 테스트 포인트, 읽는 순서에 line anchor 링크를 추가했다.
  - 문서 내 Markdown 링크 222개가 실제 파일을 가리키고, `#L` line anchor가 각 파일 라인 범위 안에 있는지 확인했다.
  - 파일만 가리키고 line anchor가 없는 문서 링크가 남아 있지 않음을 확인했다.
- Verification run:
  - `pnpm harness:check` - failed because `pnpm` is not installed in PATH.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1` - failed because the helper also requires `pnpm`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - failed in sandbox with `ENOTCACHED`, then passed after rerun with approval.
  - Markdown link target and line-anchor range scan - passed for 222 links.
  - Remaining file-link-without-`#L` scan - passed.
  - `git diff --check -- docs/ck/ai/003_자연어다이어그램생성구현정리.md` - passed with line-ending warning only.
- Known risks:
  - Source code line numbers can drift after future edits, so this document's `#L` anchors need rechecking when referenced files move.
  - Documentation-only change. Existing unrelated worktree changes remain outside this doc update.

### 2026-07-04 - 자연어 다이어그램 003 문서 최신화

- Goal: `docs/ck/ai/003_자연어다이어그램생성구현정리.md`를 최신 fact 기반 자연어 다이어그램 생성 구현에 맞춰 정리한다.
- Completed:
  - fixed scenario score 방식이 아니라 `requirementFacts` 기반 조립이라는 점을 문서 상단과 API 흐름에 명확히 적었다.
  - `selectedDraftPattern`은 대표 라벨이고 실제 생성 기준은 아니라는 경계를 추가했다.
  - 모호한 자연어는 preview 전에 질문으로 멈추고, 명확한 S3/CloudFront 같은 단서는 바로 초안 요청이 가능하다는 예시를 추가했다.
  - 동등 문장 결정성, 지원 리소스만 생성, unsupported 대체/제외 warning 기준을 테스트 포인트와 주의사항에 반영했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after sandbox `ENOTCACHED` rerun outside sandbox.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - Documentation-only change. Existing unrelated worktree changes remain outside this doc update.

### 2026-07-04 - Architecture Draft 자연어 전용 생성 전환

- Goal: Architecture Draft 생성에서 별도 보조 선택 UI와 request field를 제거하고, 자연어 요구사항 단서만으로 지원 리소스를 조립하는 deterministic 생성 흐름으로 전환한다.
- Completed:
  - `CreateArchitectureDraftRequest`를 `prompt` 전용 계약으로 바꾸고 API Zod validation도 prompt-only로 정리했다.
  - 기존 고정 scenario score/selection 계약을 제거하고, `resolveArchitectureRequirement`가 뽑은 `requirementFacts` 조합을 기반으로 `ArchitectureJson`을 조립하게 했다.
  - `selectedScenario`/`scenarioScores` metadata를 `selectedDraftPattern` 대표 라벨과 `requirementFacts`로 대체해 UI와 LLM 설명이 실제 생성 기준을 드러내게 했다.
  - 예산, 방문자 규모, 보호 수준은 별도 선택값이 아니라 자연어 단서에서 `operatingProfile`로 계산해 config에 반영하게 했다.
  - Workspace AI Chat Dock, 기존 AI Panel, app workspace draft panel에서 scenario/budget/traffic/security 선택 UI를 제거하고 draft 요청은 `{ prompt }`만 보내게 했다.
  - 요구사항이 부족하면 preview를 만들지 않고 질문/추천 답변 흐름을 먼저 거치도록 기존 clarification/follow-up 흐름과 맞췄다.
  - 같은 요구사항을 다르게 말한 5개 prompt가 같은 `ArchitectureJson`을 반환하는 회귀 테스트를 추가했다.
  - `docs/data-models.md`와 `docs/ck/ai/003_자연어다이어그램생성구현정리.md`에 prompt-only 계약과 fact 기반 생성 흐름을 정리했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api test -- --test-name-pattern "architecture-draft"` - passed with 452 API tests.
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web test -- workspace-ai-guardrail-warning.test.ts workspace-ai-clarification.test.ts workspace-ai-draft-follow-up.test.ts ai-workspace-api.test.ts` - passed with 288 web tests after sandbox `ENOTCACHED` rerun outside sandbox.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed after sandbox `ENOTCACHED` rerun outside sandbox.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed after sandbox `ENOTCACHED` rerun outside sandbox.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed after sandbox `ENOTCACHED` rerun outside sandbox.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed after sandbox `ENOTCACHED` rerun outside sandbox.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after sandbox `ENOTCACHED` rerun outside sandbox.
  - `git diff --check` - passed with line-ending warnings only.
- Evidence recorded:
  - No `.env` values, AWS credentials, DB passwords, private keys, or real tokens were printed or committed.
  - No Terraform apply/destroy, CloudFormation stack mutation, AWS SDK live call, Git/CI/CD handoff, or Deployment action was run.
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.
- Known risks:
  - Dedicated code review was skipped because there is no Tier 1 review tool in this harness and Tier 2 escalation criteria were not met.
  - Existing unrelated worktree changes remain in AWS connection verification files, `apps/web/lib/api-client.ts`, `apps/web/features/workspace/api-client-error-message.test.ts`, and `docs/ck/ai/002_아키텍처다이어그램검수가이드.md`; they are intentionally excluded from this commit.

### 2026-07-04 - Architecture Draft 추가 질문 대기 흐름 보정

- Goal: Architecture Draft 생성 중 추가 질문이 필요한 경우 바로 미리보기를 띄우지 않고, 사용자의 답변을 실제 생성 조건에 반영한 뒤 초안을 보여주게 한다.
- Completed:
  - Workspace AI Chat Dock에 `draftFollowUpSession` 상태를 추가해 경고성 질문 답변을 일반 프롬프트가 아니라 대기 중인 질문의 응답으로 처리하게 했다.
  - `low_budget_rds_cost` 질문에서 `DB 없이 다시 만들기` 또는 같은 의도의 답변을 받으면 `api_server` 요청으로 재생성하고, DB 포함 진행 답변은 대기 중인 초안을 그때 미리보기로 띄우게 했다.
  - 경고 질문 생성/답변 해석을 `workspace-ai-draft-follow-up.ts` 순수 로직으로 분리하고 회귀 테스트를 추가했다.
  - 추가 질문이 남아 있으면 `context.setPreviewDiagram`을 호출하지 않도록 미리보기 적용 경로를 `showDraftPreview`로 분리했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-draft-follow-up.test.ts` - failed before fixing `DB 없이 다시 만들기`, then passed after fix.
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-draft-follow-up.test.ts features/workspace/workspace-ai-guardrail-warning.test.ts` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web test` - passed with 288 tests.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Evidence recorded:
  - No `.env` values, AWS credentials, DB passwords, private keys, or real tokens were printed or committed.
  - No Terraform apply/destroy, CloudFormation stack mutation, AWS SDK live call, Git/CI/CD handoff, or Deployment action was run.
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.
- Known risks:
  - Existing unrelated worktree changes remain in AWS connection verification files, `apps/web/lib/api-client.ts`, `apps/web/features/workspace/api-client-error-message.test.ts`, and `docs/ck/ai/002_아키텍처다이어그램검수가이드.md`; they are intentionally excluded from this commit.

### 2026-07-04 - CloudFormation Role 검증 UX 및 STS 전파 지연 보정

- Goal: AWS 콘솔 Quick Create로 Role Stack을 만든 뒤 Account ID 기반 `verify-created-role` 검증에서 일시적인 STS 실패가 곧바로 400으로 보이고, 프론트가 이를 공통 "입력값 형식" 오류로 숨기는 문제를 줄인다.
- Completed:
  - AWS Role 검증의 첫 `AssumeRole` 단계에 짧은 재시도를 추가해, CloudFormation Stack 생성 직후 IAM Role 전파가 늦는 경우를 흡수하도록 했다.
  - AWS 연결 검증 실패 메시지들을 Web API client 번역 테이블에 추가해 `AWS Role connection test failed`가 generic `bad_request` 문구로 보이지 않게 했다.
  - `features/**/*.test.ts` glob에 포함되는 위치에 API client 오류 메시지 회귀 테스트를 추가했다.
  - STS `AssumeRole` transient failure가 두 번 난 뒤 성공하는 테스트를 추가하고 RED/GREEN을 확인했다.
- Verification run:
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/aws-connections/aws-connection-test-service.test.ts` - failed before fix with `AWS Role connection test failed`, then passed after fix.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/api-client-error-message.test.ts` - failed before fix with generic `입력값 형식을 확인해주세요.`, then passed after fix.
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/aws-connections.test.ts` - passed.
  - `.\node_modules\.bin\eslint.CMD apps/api/src/aws-connections/aws-connection-test-service.ts apps/api/src/aws-connections/aws-connection-test-service.test.ts apps/web/lib/api-client.ts apps/web/features/workspace/api-client-error-message.test.ts` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/api/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed after restoring `apps/web/next-env.d.ts`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Evidence recorded:
  - No `.env` values, AWS credentials, DB passwords, private keys, or real tokens were printed or committed.
  - No Terraform apply/destroy, CloudFormation stack mutation, AWS SDK live call, Git/CI/CD handoff, or Deployment action was run.
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.
- Known risks:
  - If production verification still fails after retry, the next likely causes are a wrong `SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN`, missing caller-side `sts:AssumeRole` permission, or a CloudFormation stack created in a different AWS account than the entered Account ID.

### 2026-07-04 - 운영 조건 기반 Architecture Draft config 반영

- Goal: 예산, 트래픽, 보호 수준 보조 선택이 단순 설명이 아니라 실제 Architecture Draft 리소스 config에 반영되도록 한다.
- Completed:
  - Architecture Draft 생성 후 `EC2`, `RDS`, `S3`, `CLOUDFRONT`, `LAMBDA`, `CLOUDWATCH_LOG_GROUP` config를 `budgetLevel`, `trafficLevel`, `securityPriority`에 따라 결정적으로 조정하도록 변경했다.
  - 낮은 예산/작은 트래픽은 `t3.micro`, `db.t4g.micro`, 작은 스토리지, 낮은 로그 보존 기간, `forceDestroy` 같은 연습 비용 정리 값을 쓰고, 보통 예산/보통 트래픽/높은 보호는 `t3.small`, `db.t3.small`, 더 큰 스토리지, 긴 로그 보존, 공개 접근 차단 값을 쓰도록 고정했다.
  - API route 테스트에 운영 조건별 backend/static/serverless config 차이를 검증하는 회귀 테스트를 추가했다.
  - `docs/data-models.md`에 보조 선택값이 Architecture Draft 생성 조건이라는 계약을 기록했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api exec tsx --test src/routes/ai.test.ts --test-name-pattern "changes backend parameters|changes delivery"` - failed before fix for unchanged/missing config, then passed after fix.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
- Known risks:
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.
  - Existing unrelated worktree change remains in `docs/ck/ai/002_아키텍처다이어그램검수가이드.md` and is intentionally excluded from this commit.

### 2026-07-04 - 보조 선택 기반 웹사이트 초안 보정

- Goal: `웹사이트 하나 배포하고 싶어`처럼 자연어는 부족하지만 보조 선택에서 `api_server` 또는 `backend_with_db`를 명시한 경우, 보조 선택을 실제 Architecture Draft 힌트로 사용하게 한다.
- Completed:
  - API 시나리오 결정에서 generic 웹사이트 요청은 `auto`일 때만 추가 확인이 필요하도록 유지하고, 명시 보조 선택이 있으면 해당 시나리오로 초안을 생성하도록 고쳤다.
  - `api_server` 선택과 `backend_with_db` 선택이 서로 다른 `ArchitectureJson`을 만들고, DB 선택 시 RDS/KMS가 포함되는 회귀 테스트를 추가했다.
  - Workspace AI 채팅 dock은 보조 선택이 `auto`가 아닐 때 generic 웹사이트 문장을 질문 흐름으로 가로채지 않고 API 요청으로 보내도록 고쳤다.
  - `docs/data-models.md`에 명시 보조 선택은 부족한 자연어 단서를 채우는 힌트로 사용한다는 계약을 보강했다.
- Verification run:
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - failed before fix with the new helper-choice regression test returning 400 instead of 200, then passed with 28 tests after the fix.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-clarification.test.ts` - failed before fix because explicit helper choices still triggered clarification, then passed with 3 tests after the fix.
  - `.\node_modules\.bin\eslint.CMD apps/api/src/services/aiArchitectureScenarioResolution.ts apps/api/src/routes/ai.test.ts apps/web/features/workspace/WorkspaceAiChatDock.tsx apps/web/features/workspace/workspace-ai-clarification.ts apps/web/features/workspace/workspace-ai-clarification.test.ts` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/api/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - 보조 선택은 아키텍처와 관련 있는 generic 웹사이트 요청에서만 부족한 단서로 사용한다. `연습용 구조를 만들어줘`처럼 아키텍처 대상 자체가 불명확한 요청은 여전히 질문/거절 흐름을 탄다.
  - `next build`가 `apps/web/next-env.d.ts`를 일시 변경했지만 원래 dev route reference로 복구했다.
  - Existing unrelated worktree change remains in `docs/ck/ai/002_아키텍처다이어그램검수가이드.md` and is intentionally excluded from this commit.

### 2026-07-04 - 웹사이트 요구사항 질문 흐름 추가

- Goal: `웹사이트 하나 배포하고 싶어`처럼 아키텍처 단서가 부족한 입력을 정적 사이트로 바로 생성하지 않고, 초보자도 답할 수 있는 질문 흐름으로 필요한 조건을 먼저 모은다.
- Completed:
  - API Architecture Draft 시나리오 결정에서 일반적인 웹사이트 요청은 화면만 필요한지, 파일 업로드가 필요한지, 로그인/데이터 저장이 필요한지 확인하기 전까지 `400 bad_request`로 차단하도록 했다.
  - Workspace AI 채팅 dock에 3단계 질문 세션을 추가해 사이트 목적, 방문자 행동, 운영 기준을 추천 답안 버튼으로 차례로 묻고, 마지막에 구현 리스트를 확인받도록 했다.
  - 사용자가 `그대로 진행` 등으로 승인하면 모은 답변을 결정적인 `CreateArchitectureDraftRequest`로 변환해 초안을 생성하고, 다시 생성도 같은 요청을 재사용하도록 했다.
  - 선택지/라벨에서 `트래픽`, `보안`, `기본`, `높게`처럼 모호한 표현을 `방문자`, `보호 기준`, `공개 자료 중심`, `로그인/개인정보 보호 우선`처럼 사용자 언어로 바꿨다.
  - `docs/data-models.md`에 부족한 웹사이트 요구사항은 질문과 구현 리스트 확인을 거친 뒤 초안을 요청해야 한다는 계약을 기록했다.
- Verification run:
  - `.\node_modules\.bin\eslint.CMD apps/api/src/services/aiArchitectureScenarioResolution.ts apps/api/src/routes/ai.test.ts apps/web/features/workspace/WorkspaceAiChatDock.tsx apps/web/features/workspace/workspace-ai-clarification.ts apps/web/features/workspace/workspace-ai-clarification.test.ts apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts apps/web/features/workspace/workspace-ai-panel-options.ts apps/web/features/workspace/WorkspaceAiPanel.tsx apps/web/app/workspace/workspace-options.ts apps/web/app/workspace/ArchitectureDraftPanel.tsx` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/api/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed after fixing optional `suggestions` property creation.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-clarification.test.ts` - passed with 3 tests.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts` - passed with 5 tests.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - 질문 흐름은 현재 `WorkspaceAiChatDock` 중심으로 동작하며, 이전 패널 컴포넌트는 문구/선택지만 맞췄다.
  - `next build`가 `apps/web/next-env.d.ts`를 일시 변경했지만 원래 dev route reference로 복구했다.
  - Existing unrelated worktree change remains in `docs/ck/ai/002_아키텍처다이어그램검수가이드.md` and is intentionally excluded from this commit.

### 2026-07-04 - Terraform AWS catalog check 줄바꿈 보정

- Goal: Windows checkout 줄바꿈 때문에 `apps/web/features/parameter-input/catalog.generated.ts`가 Terraform AWS catalog 생성 기준과 맞지 않는 것으로 판정되는 문제를 막는다.
- Completed:
  - `scripts/generate-terraform-aws-catalog.mjs`의 `--check` 비교에서 CRLF를 LF로 정규화해 실제 catalog 내용 drift만 실패하도록 수정했다.
  - `pnpm catalog:generate`로 현재 generated catalog를 다시 만들고, `catalog.generated.ts`는 Git blob 기준 변경이 없음을 확인했다.
  - 기존 사용자 변경인 `docs/ck/ai/002_아키텍처다이어그램검수가이드.md`는 이번 커밋 범위에서 제외한다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm catalog:check` - failed before fix with "Generated catalog is out of date."
  - `npm exec --package=pnpm@11.8.0 -- pnpm catalog:generate` - regenerated `catalog.generated.ts`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm catalog:check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.
  - Existing unrelated worktree change remains in `docs/ck/ai/002_아키텍처다이어그램검수가이드.md` and is intentionally excluded from this commit.

### 2026-07-04 - Architecture Draft 검수 맥락 보강

- Goal: 자연어 Architecture Draft가 API 서버, DB 포함 백엔드, Lambda 구조를 만들 때 진입점, AMI, 라우팅, IAM 권한, KMS, Logs, Metric Alarm, RDS backup 같은 검수 맥락을 빠뜨리지 않게 한다.
- Completed:
  - `ResourceType`과 API/Zod/프로젝트 저장 스키마에 IAM Role/Policy/Instance Profile, KMS Key, CloudWatch Log Group/Metric Alarm, API Gateway REST API, Lambda Permission을 추가했다.
  - API 서버 초안에 Internet Gateway, Route Table, Route Table Association, AMI, IAM Role/Policy/Instance Profile, CloudWatch Logs/Alarm을 연결했다.
  - DB 백엔드 초안에 앱/DB 보안그룹 경계, AMI, runtime role/policy/profile, KMS 암호화, CloudWatch Logs/Alarm, RDS backup retention을 반영했다.
  - Lambda 초안에 API Gateway 트리거, execution role/policy, Lambda permission, KMS-backed log group, error alarm을 반영했다.
  - ArchitectureJson/DiagramJson 변환과 backend DiagramJson 분석 매핑, ResourceType 라벨, `docs/data-models.md` 지원 목록을 갱신했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - passed with 26 tests after RED failures confirmed.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed with 10 tests after RED failure confirmed.
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/services/diagram-to-architecture.test.ts` - passed with 4 tests after RED failure confirmed.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/app/workspace/resource-type-labels.test.ts` - passed with 1 test.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm test` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - 새 IAM/KMS/CloudWatch/API Gateway 계열 리소스는 Architecture Board와 IaC Preview에 반영되지만 MVP live apply 허용 목록은 넓히지 않았다. 실제 apply 단계에서는 기존 안전 게이트가 계속 unsupported resource로 차단할 수 있다.
  - `next build`가 `apps/web/next-env.d.ts`를 일시 변경했으나 원래 dev route reference로 복구했다.
  - Existing unrelated worktree change remains in `docs/ck/ai/002_아키텍처다이어그램검수가이드.md` and is intentionally excluded from this commit.

### 2026-07-04 - Workspace AI 채팅 dock 전환

- Goal: 오른쪽 패널의 AI 탭을 제거하고, 워크스페이스 오른쪽 하단의 GPT형 채팅 dock에서 AI 초안 생성, 미리보기, 적용, 대화 기록을 처리하게 한다.
- Completed:
  - `WorkspaceRightPanel`에서 AI 탭과 AI 패널 진입점을 제거하고, `DiagramEditor`에 floating panel 슬롯을 추가해 워크스페이스 위에 AI 채팅 dock을 띄우도록 연결했다.
  - `WorkspaceAiChatDock`을 추가해 하단 채팅 UI, 프로젝트별 `localStorage` 채팅 기록, 초안 미리보기, `생성`/`취소`/`다시 생성` 흐름을 구현했다.
  - 명확한 아키텍처 단서가 없거나 지원 범위가 부족한 경우 경고로 끝내지 않고, 한국어 후속 질문을 채팅 기록에 남기도록 바꿨다.
  - 전체 교체 적용 경고는 초안 카드 안에 유지했고, 현재 적용 방식이 전체 교체임을 계속 알리도록 했다.
- Verification run:
  - `node scripts/check-harness.mjs` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
  - `Invoke-WebRequest http://localhost:3000` - returned `200`; existing Next dev server is available at `http://localhost:3000`.
- Known risks:
  - Browser screenshot verification was not completed because the local Playwright browser executable is not installed; source tests, lint, typecheck, build, and HTTP readiness were verified.
  - Existing unrelated worktree change remains in `docs/ck/ai/002_아키텍처다이어그램검수가이드.md` and is intentionally excluded from this commit.

### 2026-07-04 - Architecture Draft 거절 메시지 표시 수정

- Goal: 아키텍처 단서가 없는 자연어 입력을 거절할 때, Workspace AI 패널이 일반 오류 문구 대신 API의 구체적인 한국어 거절 메시지를 표시하게 한다.
- Completed:
  - Workspace AI 전용 public AI 요청 래퍼가 API 오류 응답을 일반 `Error`가 아니라 공용 `ApiClientError`로 던지도록 수정했다.
  - 표준 `error`/`message` 응답만 사용자 메시지로 받아들이도록 타입 가드를 보강했다.
  - `된장찌개 레시피 알려줘`처럼 비아키텍처 프롬프트가 거절될 때 `Architecture Draft 생성 중 오류가 발생했습니다.`로 덮이지 않는 회귀 테스트를 추가했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/ai-workspace-api.test.ts` - passed with 5 tests after sandbox spawn EPERM.
  - `.\node_modules\.bin\eslint.CMD apps\web\features\workspace\api.ts apps\web\features\workspace\ai-workspace-api.test.ts` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps\web\tsconfig.json` - passed.
  - `node scripts/check-harness.mjs` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.

### 2026-07-03 - 애매한 자연어 요구사항 초안 생성 차단

- Goal: 자연어 요구사항에서 명확한 아키텍처 단서를 찾지 못하면 기본 API 서버 초안으로 fallback하지 않고 초안 생성을 막는다.
- Completed:
  - `resolveScenario`의 ambiguous prompt fallback 분기를 제거하고 `400 bad_request` 오류를 반환하도록 바꿨다.
  - `scenarioHint`만 선택되어 있어도 자연어 단서가 없으면 초안을 생성하지 않도록 했다.
  - `ambiguous_prompt_fallback`, `unsupported_requirement` guardrail code를 shared type, Web warning label, canonical docs에서 제거했다.
  - `docs/gg`의 오래된 fallback 관련 참고 문구를 현행 정책에 맞춰 정리했다.
  - API 테스트를 애매한 prompt rejection 기준으로 갱신했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts` - passed with 4 tests.
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - passed with 26 tests after sandbox spawn EPERM.
  - `.\node_modules\.bin\eslint.CMD apps/api/src/services/aiArchitectureScenarioResolution.ts apps/api/src/routes/ai.test.ts apps/web/features/workspace/WorkspaceAiPanelPieces.tsx apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts packages/types/src/index.ts` - passed after removing one unused argument warning.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/api/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p packages/types/tsconfig.json` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `node scripts/check-harness.mjs` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.

### 2026-07-03 - 초보자용 요구사항 프롬프트 가이드 추가

- Goal: 사용자가 AWS/EC2/S3 같은 기술 용어를 몰라도 "웹사이트 하나 배포하고 싶어"처럼 요구사항을 시작할 수 있게 Workspace AI 입력 UI를 보강한다.
- Completed:
  - Workspace AI 요구사항 입력창 아래에 짧은 안내, 예시 칩 3개, 최소 힌트(`공개 여부`, `파일/데이터`, `비용/보안`)를 추가했다.
  - 기본 프롬프트를 기술 중심 문장에서 "웹사이트 하나 배포하고 싶어. 업로드한 파일도 저장할 수 있으면 좋겠어."로 바꿨다.
  - 자연어 분류에서 `로그인`, `회원`, `계정`, `홈페이지`, `사이트`, `웹서비스` 같은 초보자 표현을 인식하도록 보강했다.
  - Web/API 테스트에 초보자용 UI 가이드와 beginner-friendly prompt 분류 검증을 추가했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts` - passed with 4 tests after sandbox spawn EPERM.
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - passed with 26 tests after sandbox spawn EPERM.
  - `.\node_modules\.bin\eslint.CMD apps/web/features/workspace/WorkspaceAiPanel.tsx apps/web/features/workspace/workspace-ai-panel-options.ts apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts apps/api/src/services/aiArchitectureScenarioResolution.ts apps/api/src/routes/ai.test.ts` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/api/tsconfig.json` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - first run timed out without failure output; reran with longer timeout and passed.
  - `node scripts/check-harness.mjs` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - Browser screenshot verification was not run; the change was reviewed through source tests, focused CSS review, typecheck, and production build.
  - `next build` temporarily changed `apps/web/next-env.d.ts`; the generated route type path was restored and left out of the final diff.

### 2026-07-03 - 아키텍처 다이어그램 검수 가이드 작성

- Goal: 자동 생성된 클라우드 아키텍처 다이어그램이 맞는지 판단할 수 있도록, 코드 구현 기준이 아닌 일반 클라우드 개념 기준의 검수 문서를 작성한다.
- Completed:
  - `docs/ck/ai/002_아키텍처다이어그램검수가이드.md`를 추가해 포함관계, 의존성, 화살표 방향, 네트워크/보안/저장소/컴퓨트 검수 기준을 정리했다.
  - `docs/ck/README.md`의 빠른 읽기 순서와 문서 목록에 AI 다이어그램 검수 문서를 추가했다.
  - 잘못된 위치에 생성됐던 루트 `docs/001_아키텍처다이어그램_검수_가이드.md` 문서를 제거했다.
- Verification run:
  - `node scripts/check-harness.mjs` - passed before editing and after documentation updates.
  - `git diff --check` - passed with line-ending warnings only.
  - `rg -n "ArchitectureJson|DiagramJson|ResourceType|metadata|config|현재 구현|현재 AI|MVP|SketchCatch|UNKNOWN" docs\ck\ai\002_아키텍처다이어그램검수가이드.md` - no matches.
- Known risks:
  - Documentation-only change; full lint/typecheck/build were not run.

### 2026-07-03 - Server Storage Route edge 방향 보정

- Goal: `EC2 서버 + 이미지 저장용 S3` 초안에서 Route Table 라우팅 화살표가 실제 관계와 반대로 보이는 문제를 바로잡는다.
- Completed:
  - Server Storage 템플릿의 `routes` edge를 `Internet Gateway -> Route Table Association`에서 `Route Table -> Internet Gateway`로 변경했다.
  - API 테스트가 `route-table-to-internet-gateway` edge의 source/target 방향을 직접 검증하도록 보강했다.
- Verification run:
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - 먼저 기대 실패를 확인한 뒤 수정 후 25 tests passed.
  - `node scripts/check-harness.mjs` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - 첫 실행은 timeout, 더 긴 제한으로 재실행해 passed.
- Known risks:
  - 실제 브라우저 스크린샷 재확인은 하지 않았지만, 보드 화살표 방향은 API `ArchitectureJson.edges`의 source/target을 그대로 따른다.

### 2026-07-03 - Natural Language Diagramming 결정사항 재감사

- Goal: Natural Language Diagramming 결정사항 전체를 현재 구현에 대조하고, 빠진 동작이 있으면 바로 보강한다.
- Completed:
  - `/workspace/ai` 별도 AI 화면을 `/workspace`로 redirect해 Natural Language Diagramming 위치를 workspace 보드 안으로 고정했다.
  - 미리보기 초안이 떠 있을 때 상단 `초안 미리보기 생성` 버튼을 숨겨 카드 안의 `생성`, `취소`, `다시 생성`만 남도록 했다.
  - 지원 ResourceType 목록에 있던 `LAMBDA`를 자연어 규칙 엔진과 고정 템플릿에 연결해 Lambda/서버리스 프롬프트에서 `LAMBDA` 초안을 생성하도록 했다.
  - `serverless_function` 시나리오를 shared type, API schema, metadata label, 보조 선택 UI, 기존 metadata panel에 반영했다.
  - Redis, SQS/SNS/EventBridge/Step Functions 등 지원 밖 리소스 감지를 추가하고, DynamoDB/NoSQL은 RDS 대체 경고로 처리하도록 보강했다.
  - `docs/data-models.md`에 Natural Language Diagramming 시나리오, 지원 ResourceType, guardrail warning 계약을 기록했다.
  - API/Web 테스트에 모호한 프롬프트 처리, 지원 타입 제한, Lambda 초안, 미지원 리소스 제외 경고, `/workspace/ai` redirect, preview action 제한, Lambda board adapter 검증을 추가했다.
- Verification run:
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - passed with 25 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts` - passed with 3 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/app/workspace/workspace-resource-chip-class.test.ts` - passed with 3 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed with 9 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/diagram-editor/flow-mappers.test.ts` - passed with 7 tests after sandbox spawn EPERM.
  - `node scripts/check-harness.mjs` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - failed once because old `DraftMetadataPanel` did not handle `serverless_function`; fixed and reran successfully.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `/workspace/ai` still exists as a Next route but now redirects to `/workspace`; it no longer renders the old separate AI workspace.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.

### 2026-07-03 - 지원 불가 요구사항 대체 생성

- Goal: 자연어 다이어그램 생성에서 지원 범위 밖 리소스 요구가 들어오면 조용히 제외하지 않고 지원 가능한 유사 초안으로 대체하고 경고를 표시한다.
- Completed:
  - `unsupported_requirement_substituted` warning code를 shared type과 Workspace AI 경고 라벨에 추가했다.
  - EKS/Kubernetes, ECS/Fargate, ALB/Auto Scaling 요구를 지원 가능한 단일 EC2/API 서버 초안으로 대체하도록 시나리오 결정 규칙을 추가했다.
  - 멀티 리전 요구는 단일 리전 초안으로 대체했다는 경고를 남기고, CI/CD/보장/내부 연동처럼 보드 리소스로 대체할 수 없는 요구는 기존처럼 제외 경고를 남기도록 분리했다.
  - 선택지가 다른 값이어도 자연어에서 대체 가능한 요구가 감지되면 대체 시나리오가 우선되도록 테스트를 갱신했다.
- Verification run:
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - passed with 21 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts` - passed with 1 test after sandbox spawn EPERM.
  - `node scripts/check-harness.mjs` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed after non-escalated cache-only `ENOTCACHED`.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed after non-escalated cache-only `ENOTCACHED`.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `pnpm` is still unavailable directly in the current shell; required checks passed through `npm exec`.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.

### 2026-07-03 - Server Storage 핵심 관계 edge 보정

- Goal: `EC2 서버 + 이미지 저장용 S3` 요청에서 EC2, AMI, S3의 핵심 관계가 다이어그램에 보이도록 한다.
- Completed:
  - Server Storage 템플릿에서 애매한 `S3 -> Internet Gateway` edge를 제거했다.
  - `AMI -> EC2` `launch image` edge를 추가해 EC2가 어떤 AMI로 생성되는지 보이게 했다.
  - `EC2 -> S3` `stores images` edge를 추가해 이미지 저장 요구사항이 다이어그램에 드러나게 했다.
  - API 테스트와 workspace adapter 테스트에서 새 관계 edge를 검증하도록 갱신했다.
- Verification run:
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - passed with 21 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed with 8 tests after sandbox spawn EPERM.
  - `node scripts/check-harness.mjs` - passed.
  - `.\node_modules\.bin\eslint.CMD apps/api/src/services/aiArchitectureDraftTemplates.ts apps/api/src/routes/ai.test.ts apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/api/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `.\apps\web\node_modules\.bin\next.CMD build` - passed after sandbox `.next` unlink EPERM.
- Known risks:
  - `pnpm` is still unavailable in the current shell, so checks were run through local project binaries.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.

### 2026-07-03 - 포함관계 area 화살표 숨김

- Goal: area 포함관계가 박스 중첩으로 표현될 때 중복 화살표가 나와 보드가 지저분해지는 문제를 줄인다.
- Completed:
  - `contains`, `hosts` 같은 area parent edge는 렌더링용 `DiagramEdge`에서 제외하도록 수정했다.
  - area node와 그 descendant 사이의 edge도 포함관계 표현으로 판단해 화살표를 숨기도록 보강했다.
  - `reads/writes` 같은 실제 non-containment 관계 edge는 계속 화살표로 남도록 테스트를 추가했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed with 7 tests after sandbox spawn EPERM.
  - `node scripts/check-harness.mjs` - passed.
  - `.\node_modules\.bin\eslint.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.ts apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `.\apps\web\node_modules\.bin\next.CMD build` - passed after sandbox `.next` unlink EPERM.
- Known risks:
  - `pnpm` is still unavailable in the current shell, so checks were run through local project binaries.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.

### 2026-07-03 - Security Group area 포함관계 수정

- Goal: Security Group이 area로 표시될 때 AI 생성 다이어그램의 포함관계가 시각적으로 명확하게 보이도록 한다.
- Completed:
  - `securityGroupIds`가 있는 리소스를 참조된 Security Group area 아래에 배치하도록 AI diagram 변환을 수정했다.
  - Security Group area는 보호 대상 리소스가 사용하는 Subnet 아래에 배치되도록 수정했다.
  - `aws_security_group.security_group.id`, `aws_subnet.subnet.id` 같은 Terraform reference 값을 실제 보드 노드로 해석하도록 보강했다.
  - parent box가 child node를 실제로 감싸도록 area fitting을 오른쪽/아래뿐 아니라 왼쪽/위쪽으로도 확장하게 수정했다.
  - workspace adapter 테스트에서 `VPC > Subnet > Security Group > Resource` 포함관계를 검증하도록 갱신했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed with 6 tests after sandbox spawn EPERM.
  - `node scripts/check-harness.mjs` - passed.
  - `.\node_modules\.bin\eslint.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.ts apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `.\apps\web\node_modules\.bin\next.CMD build` - passed after sandbox `.next` unlink EPERM.
- Known risks:
  - 현재 shell에서 `pnpm`을 찾을 수 없어 `pnpm harness:check`와 `scripts/init-harness.ps1`은 실패했고, `node scripts/check-harness.mjs`로 하네스 검증을 대체했다.
  - 기존 unrelated worktree change인 `apps/web/next-env.d.ts`는 그대로 남아 있다.

### 2026-07-03 - Architecture Draft 화살표 렌더링 수정

- Goal: AI 초안 다이어그램 생성 시 edge/화살표가 보이지 않는 문제를 바로잡는다.
- Completed:
  - AI `ArchitectureJson.edges`를 보드 `DiagramEdge`로 변환할 때 기본 board handle ID를 함께 넣도록 수정했다.
  - source/target 노드 위치를 기준으로 좌/우/상/하 handle을 골라 생성 화살표가 노드에 안정적으로 붙도록 했다.
  - preview/locked 상태에서도 React Flow가 edge 위치를 계산할 수 있도록 숨은 handle DOM은 유지하고, 사용자 연결 생성만 비활성화했다.
- Verification run:
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` - passed with 6 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/diagram-editor/flow-mappers.test.ts` - passed with 7 tests.
  - `node scripts/check-harness.mjs` - passed.
  - `.\node_modules\.bin\eslint.CMD apps/api apps/web packages/types` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `.\apps\web\node_modules\.bin\next.CMD build` - passed after sandbox `.next` unlink EPERM.
  - `git diff --check` - passed with line-ending warnings only.
- Known risks:
  - `npm exec --package=pnpm@11.8.0 -- pnpm ...` 계열 체크는 npm cache/network 접근이 `ENOTCACHED`로 실패해 이번 턴에는 직접 실행하지 못했다.
  - root `.\node_modules\.bin\turbo.CMD build`는 Turbo가 package manager binary를 찾지 못해 실패했다. 변경 영향이 있는 web build는 직접 검증했다.
  - 기존 unrelated worktree change인 `apps/web/next-env.d.ts`는 그대로 남아 있다.

### 2026-07-03 - 자연어 우선 Architecture Draft 미리보기

- Goal: Workspace AI의 다이어그램 생성에서 자연어 요구사항을 선택지보다 우선하고, AI 초안을 실제 워크스페이스 보드에 읽기 전용 미리보기로 표시한 뒤 사용자 생성 승인 시 전체 교체로 적용한다.
- Completed:
  - Architecture Draft 시나리오 결정 로직을 자연어 우선으로 바꿨다. 프롬프트 단서가 있으면 선택지는 보조값으로만 쓰고, 선택지와 충돌하면 `selection_overridden_by_prompt` 경고를 남긴다.
  - 모호한 프롬프트는 기본 API 서버 초안으로 생성하고 `ambiguous_prompt_fallback` 경고를 남기게 했다.
  - 지원 범위 밖 요구사항은 생성하지 않고 지원 가능한 부분만 만들며 `unsupported_resource_omitted`와 필요한 경우 `partial_generation` 경고를 남기게 했다.
  - 같은 요청에서 같은 `ArchitectureJson`이 나오도록 rule/template 기반 생성 흐름을 유지하고 테스트로 고정했다. LLM은 설명만 붙는다.
  - Workspace AI 패널의 기본 선택을 `auto`로 바꾸고, 선택지 라벨을 더 명확한 한국어로 정리했다.
  - 초안 생성 시 `workspace/ai`가 아니라 실제 workspace 보드에 반투명 preview를 표시하고, preview 중 보드 편집/드래그/삭제/연결/드롭을 막았다.
  - 카드 버튼을 `생성`, `취소`, `다시 생성`으로 분리했다. `생성`은 preview를 실제 보드에 전체 교체로 적용한다.
  - 기존 보드에 리소스가 있으면 카드 하단에 `board_replacement_required` 경고를 추가한다.
- Verification run:
  - `.\apps\api\node_modules\.bin\tsx.CMD apps/api/src/routes/ai.test.ts` - passed with 21 tests after sandbox `tsx --test` hit spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/diagram-editor/flow-mappers.test.ts` - passed with 7 tests after sandbox spawn EPERM.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts` - passed with 1 test after sandbox spawn EPERM.
  - `node scripts/check-harness.mjs` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/api/tsconfig.json` - passed.
  - `.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json` - passed.
  - `.\node_modules\.bin\eslint.CMD apps/api apps/web packages/types` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
  - `git diff --check` - passed with line-ending warnings only.
- Evidence recorded:
  - API request/response shape was not changed; warning code values were extended in shared types.
  - No `.env` value, secret, AWS credential, DB password, or real token was printed.
  - No Terraform apply/destroy, cloud mutation, Git/CI/CD handoff, or deployment action was run.
- Known risks:
  - Current apply mode is full board replacement by design. Future patch mode still needs a separate implementation.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - Add patch-preview mode that renders only proposed changes translucently, then applies them only after explicit user acceptance.

### 2026-07-03 - CloudFormation Quick Create S3 TemplateURL hotfix

- Goal: Fix the AWS Console Quick Create `TemplateURL must be a supported URL` error.
- Completed:
  - Confirmed root cause: Quick Create was receiving a SketchCatch API URL as `templateURL`, but CloudFormation supports S3 object URLs or SSM document URLs for templates.
  - Changed AWS connection CloudFormation setup to publish the generated YAML template to the SketchCatch artifact S3 bucket.
  - Changed `templateUrl` and `launchStackUrl` to use a presigned S3 `GetObject` URL.
  - Kept inline template fallback when S3 publishing is unavailable or explicitly disabled in tests.
  - Removed the old signed public API template route from AWS connection routing because it does not satisfy Quick Create URL requirements.
  - Updated API and web API tests for S3-backed Quick Create URLs.
- Verification run:
  - `.env` key presence check - `S3_BUCKET_NAME`, `AWS_PROFILE`, `AWS_SDK_LOAD_CONFIG` set; static AWS credential vars empty/unset. Values were not printed.
  - `.\apps\api\node_modules\.bin\tsx.CMD --test apps/api/src/routes/aws-connections.test.ts apps/api/src/config/env.test.ts apps/api/src/server-startup.test.ts` - passed with 20 tests.
  - Actual AWS S3 publish smoke through SSO credential - `PutObject -> presigned GetObject URL -> DeleteObject` passed. Bucket name and URL were not printed.
  - Actual CloudFormation `ValidateTemplate` smoke through AWS CLI - presigned S3 URL was accepted as `TemplateURL`; no stack was created.
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api lint` - passed.
  - `.\apps\web\node_modules\.bin\tsx.CMD --test apps/web/features/workspace/api.test.ts` - passed with 17 tests.
  - `node scripts/check-harness.mjs` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed.
- Evidence recorded:
  - The generated Quick Create URL now uses an S3 presigned URL for `templateURL`, not a SketchCatch API URL.
  - The real S3 smoke used a temporary object and deleted it immediately.
  - No Terraform apply/destroy or Git/CI/CD deployment was run.
- Known risks:
  - Full AWS Console stack creation still requires opening the generated Quick Create URL and approving stack creation in the target AWS account.
  - Runtime IAM role or SSO profile must have S3 object write/read permissions for the artifact bucket.
- Next best action:
  - Start the API with current `.env`, request a new AWS connection CloudFormation template, and open the returned `launchStackUrl` in AWS Console.

## 세션 레코드

### 2026-07-03 - #134 GitCicdHandoff 계약/API 기반 구현

- Goal: Git/CI/CD Deployment Path의 v0 metadata handoff 계약, DB schema/migration, API routes, tests, SW 학습 문서를 구현한다.
- Completed:
  - `packages/types/src/index.ts`에 secret-free `SourceRepository`, `GitCicdHandoffStatus`, `GitCicdHandoff`, create/list/get/status DTO를 추가했다.
  - `apps/api/src/db/schema.ts`에 `git_cicd_repository_provider`, `git_cicd_handoff_status`, `git_cicd_handoffs` table/relation을 추가했다.
  - `apps/api/drizzle/0021_git_cicd_handoffs.sql`와 `apps/api/drizzle/meta/0021_snapshot.json`, `_journal.json` entry를 추가했다. `drizzle-kit generate`는 기존 snapshot collision 때문에 실패해 명시적 SQL과 수동 snapshot으로 처리했다.
  - `apps/api/src/git-cicd/git-cicd-handoff-service.ts`에 project access, architecture, uploaded Terraform artifact 검증과 fake/internal provider boundary를 구현했다.
  - `apps/api/src/routes/git-cicd-handoffs.ts`와 route registration을 추가해 create/list/get/status update를 제공한다.
  - `apps/api/src/routes/git-cicd-handoffs.test.ts`와 `apps/api/src/db/schema-contract.test.ts`로 access control, artifact linkage, create/list/get/status update, no-secret response/schema를 검증했다.
  - `docs/data-models.md`, `docs/sw/005_GitCicdHandoff계약API클론코딩가이드_sw.md`, `docs/sw/README.md`를 갱신했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/git-cicd-handoffs.test.ts` - initially failed once because isolated test app lacked the global Zod error handler; fixed test helper and reran passed
  - `pnpm --filter @sketchcatch/api typecheck` - passed
  - `pnpm --filter @sketchcatch/types typecheck` - passed
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/git-cicd-handoffs.test.ts src/db/schema-contract.test.ts` - passed
  - `pnpm --filter @sketchcatch/api lint` - passed
  - `pnpm --filter @sketchcatch/types lint` - passed
  - `pnpm harness:check` - passed after edits
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `git diff --check` - passed with Git line-ending warnings only
- Evidence recorded:
  - No real GitHub PR/commit/pipeline calls were implemented or executed; provider is internal/fake metadata boundary only.
  - No Terraform apply/destroy, cloud mutation, real Git/CI/CD handoff execution, or secret handling was performed.
  - Request schemas are strict and tests reject secret-looking fields such as `accessToken`.
- Known risks:
  - `drizzle-kit generate` could not be used because existing snapshots `0008` and `0015` point to a colliding parent snapshot path. The new migration is explicit SQL and the snapshot/journal were updated manually.
  - #135 still needs the real GitHub/provider implementation and should keep secrets out of DB/logs/responses.
- Next best action:
  - Parent agent should review #134 diff, especially manual Drizzle metadata, then #135 can replace the internal provider boundary with real GitHub/CI behavior.
### 2026-07-04 - Blueprint 리디자인 스펙 문서화
### 2026-07-04 - Issue #129 Direct Deployment 실패 로그 AI 요약

- Goal: Direct Deployment 실패 로그와 errorSummary를 사용자에게 읽기 쉬운 실패 요약, 원인 후보, 다음 행동으로 제공하는 다음 slice를 완성한다.
- Completed:
  - `DeploymentFailureExplanation`/`DeploymentFailureExplanationResponse` shared type을 추가했다.
  - `GET /api/deployments/:deploymentId/failure-explanation`을 추가해 `FAILED` deployment에만 실패 설명을 반환한다.
  - 첫 `ERROR` 로그 또는 `errorSummary`를 다시 `maskDeploymentMessage`로 마스킹하고, 실패 stage와 cleanup 필요 여부를 포함한 rule 기반 fallback 요약을 생성한다.
  - OpenAI API key 미설정/호출 실패 시 기존 LLM explanation fallback reason이 응답에 남도록 `CreateLlmExplanation`을 주입 가능하게 연결했다.
  - `DeploymentPanel`에서 실패한 Direct Deployment 선택 시 실패 요약, 첫 오류 로그, cleanup 필요 여부, 다음 행동을 보여준다.
  - `docs/data-models.md`와 `docs/sw/008_배포실패설명가이드_sw.md`에 DTO, 흐름, 의사결정, 클론 코딩 자료를 기록했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/deployments.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts` - passed
  - `pnpm typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm build` - passed
  - `pnpm test` - failed because Turbo strict task env did not pass existing API test prerequisite `S3_BUCKET_NAME`
  - `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm --filter @sketchcatch/api test` - passed
  - `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm exec turbo test --env-mode=loose` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 실패 설명 route test verifies masked first error log, fallback reason `missing_api_key`, cleanup required, and 409 for non-failed deployments.
  - Web API helper test verifies `/api/deployments/:id/failure-explanation` and response mapping.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff, secret access는 수행하지 않았다.
- Known risks:
  - 루트 `pnpm test`는 기존 Turbo env strict 설정에서는 `S3_BUCKET_NAME`을 API test task로 넘기지 않아 실패한다. 같은 테스트는 package-level과 `turbo test --env-mode=loose`에서 통과했다.
- Next best action:
  - PR #129를 dev 대상으로 열고 CI 결과를 확인한다.
### 2026-07-04 - Natural Language Diagramming 브랜치 dev 최신화

- Goal: `feat/ck/141-Natural-Language-Diagramming` 브랜치에 최신 `origin/dev` 변경을 병합한다.
- Completed:
  - `origin/dev`를 fetch하고 현재 브랜치에 merge했다.
  - 충돌 파일 `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`, `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`, `apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts`는 자연어 다이어그램 preview/area containment 변경과 dev의 Terraform editor/compact resource node 변경을 함께 보존하는 방향으로 해결했다.
  - 로그성 문서 `agent-progress.md`, `session-handoff.md`는 `origin/dev` 최신 내용을 기준으로 두고 현재 병합 기록을 새 항목으로 추가했다.
  - merge 전 남아 있던 미커밋 변경은 `stash@{0}`에 `codex: before merging dev into natural language branch` 이름으로 임시 보관했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed before merge after sandbox `ENOTCACHED` rerun outside sandbox.
  - `.\apps\web\node_modules\.bin\tsx.CMD apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts apps/web/features/diagram-editor/diagram-editor-layout.test.ts` - failed once after conflict resolution because merged area sizing changed, then passed after updating expected sizes.
  - `git diff --cached --check` - passed.
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after conflict resolution.
- Known risks:
  - Stashed pre-existing local changes still need to be restored after the merge commit.

### 2026-07-04 - PR #137 dev 병합 충돌 해결

- Goal: grill-me로 확정한 Blueprint 리디자인 계획을 `docs/sw` 구현 기준 문서로 저장한다.
- Completed:
  - `docs/sw/spec2.md`에 전체 Blueprint 리디자인 스펙을 작성했다.
  - `docs/sw/plan2.md`에 우선순위 기반 구현 마일스톤을 작성했다.
  - `docs/sw/agents2.md`에 작업 규범을 30줄 이내로 작성했다.
  - `docs/sw/README.md`에 새 문서 3종의 빠른 읽기 링크와 담당 문서 표 항목을 추가했다.
- Verification run:
  - `node scripts/check-harness.mjs` - passed before editing
  - `pnpm harness:check` - passed after editing
  - `git diff --check` - passed after editing, with LF-to-CRLF working-copy warnings for `agent-progress.md` and `docs/sw/README.md`
  - `docs/sw/agents2.md` line count check - passed with 30 lines
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `feature_list.json`의 `HARNESS-007` 상태는 변경하지 않았다.
- Known risks:
  - 구현 작업은 아직 시작하지 않았다.
  - 폰트 자산 다운로드, Board/Safety Gate UI 적용, 브라우저 스모크는 `docs/sw/plan2.md`의 후속 마일스톤이다.
- Next best action:
  - `docs/sw/plan2.md`의 마일스톤 1부터 구현을 시작한다.

### 2026-07-02 - 중복 상세 기획 문서 정리

- Goal: 별도 재구성본을 제거하고 상세 기획서는 canonical 상세 기획서 하나로 유지한다.
- Completed:
  - 별도 재구성본 파일을 삭제했다.
  - `docs/README.md`에서 별도 재구성본 링크와 문서 정리 기준을 삭제했다.
  - 진행 로그와 핸드오프에서 별도 재구성본 생성 기록과 후속 행동을 삭제했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
  - 삭제 대상 문서 참조 검색 - no matches
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않을 예정이다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - `docs/000_상세기획서.md`를 기준 문서로 유지하고, 공유용 문구가 필요하면 해당 문서 안에서 직접 다듬는다.

### 2026-07-02 - 방어형 포지셔닝 문장 제거

- Goal: 대상 사용자 섹션에서 부정형/방어형 포지셔닝 문장을 제거하고, 사용자 유형과 니즈만으로 서비스 범위를 설명한다.
- Completed:
  - `docs/product.md`, `docs/000_상세기획서.md`의 대상 사용자 소개 문장을 삭제했다.
  - 사용자 타깃은 표와 섹션 본문에서 애플리케이션 개발자, 플랫폼/DevOps 엔지니어, 기술 리드/SRE 사용 맥락으로 설명하게 했다.
  - docs 전체에서 관련 방어형 포지셔닝 문구가 남지 않았음을 확인했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
  - requested wording searches - no matches
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않을 예정이다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - 공유 문서에서 사용자군 설명이 과하게 방어적으로 읽히지 않는지 팀 피드백을 확인한다.

### 2026-07-02 - 타깃 사용자 표현 보정

- Goal: 사용자 타깃 표현을 숙련자까지 포함하는 운영 플랫폼 톤으로 조정한다.
- Completed:
  - `docs/product.md`, `docs/000_상세기획서.md`에서 낮은 숙련도 중심 명칭을 `플랫폼/DevOps 엔지니어`, `기술 리드/SRE`, `애플리케이션 개발자` 중심으로 바꿨다.
  - `docs/gg/003_기획서.md`의 담당자별 참고 문서 타깃 사용자도 같은 방향으로 조정했다.
  - `docs/sw/003_테라폼동기화구조설명_sw.md`의 `초보자/입문자/전문가 관점` 표현을 `사용자 관점/구현 관점`으로 바꿨다.
  - docs 전체에서 `입문자|초보|주니어|소규모 DevOps|전문가 관점` 검색 결과가 없음을 확인했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않을 예정이다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - 공유 문서에서도 운영 플랫폼 맥락이 자연스럽게 읽히는지 팀 피드백을 확인한다.

### 2026-07-02 - SketchCatch 상세 기획서 작성

- Goal: 기획자와 개발자가 함께 이해할 수 있는 SketchCatch 상세 기획서를 작성한다.
- Completed:
  - `docs/000_상세기획서.md`를 추가해 서비스 정의, 문제 정의, 대상 사용자, 현재 구현 상태, 핵심 서비스 여정, 기능 요구사항, 4인 책임 분배, Representative Use Journey, 보안/운영 정책, 비지원 범위, 성공 기준, 검증 전략, 리스크, 구현 순서를 정리했다.
  - `docs/README.md`에 상세 기획서 링크와 문서 책임을 추가했다.
  - `docs/product.md`에 상세 기획서 참조 링크를 추가했다.
  - Redis는 내부 Runtime Cache이며 사용자 Practice Architecture Resource가 아니라는 경계를 상세 기획서에 다시 명시했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않았다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - `docs/000_상세기획서.md`의 "개발자가 바로 잡아야 할 구현 순서"를 기준으로 Representative Use Journey smoke 또는 Voice Requirement Input/Bedrock/Amazon Q/Redis/Git/CI/CD/Reverse Engineering 중 하나를 구현 workstream으로 쪼갠다.

### 2026-07-02 - Docs folder cleanup

- Goal: `docs` 폴더에서 canonical 문서와 담당자별 참고 문서를 더 쉽게 찾을 수 있게 정리한다.
- Completed:
  - `docs/adr/README.md`, `docs/ck/README.md`, `docs/sw/README.md`, `docs/ys/README.md` 인덱스를 추가했다.
  - `docs/README.md`의 담당자별 참고 문서 표를 각 폴더 인덱스로 연결했다.
  - `docs/AGENTS.md`에 담당자별 참고 문서를 추가/변경할 때 해당 인덱스를 갱신하라는 규칙을 추가했다.
  - H1 제목이 없던 `docs/gg/004_역할분배.md`, `docs/ys/006-로그인&익명로그인_삭제관련.md`에 제목을 추가했다.
- Verification run:
  - `pnpm harness:check` - passed
  - docs H1 scan - passed
  - docs link target scan - passed
- Evidence recorded:
  - docs H1 scan found no markdown files without an H1 after cleanup.
  - docs link target scan found no missing relative targets in changed index files.
- Commits:
  - `Docs: 문서 인덱스 정리` current commit
- Known risks:
  - 삭제나 이동은 하지 않았다. 기존 링크 파손 위험을 줄이기 위해 인덱스 추가 중심으로 정리했다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - If the team wants stronger cleanup later, merge or archive stale owner-specific docs after confirming with each owner.

### 2026-07-02 - Harness gap hardening

- Goal: `learn-harness-engineering`의 하네스 원칙을 SketchCatch repo 운영 표면에 맞게 반영한다.
- Completed:
  - 루트 `AGENTS.md`에 Harness Operating Loop를 추가했다.
  - `feature_list.json`, `agent-progress.md`, `session-handoff.md`, `clean-state-checklist.md`, `evaluator-rubric.md`, `quality-document.md`를 추가했다.
  - `scripts/check-harness.mjs`와 `scripts/init-harness.ps1`를 추가해 필수 하네스 파일, single `in_progress`, `passing` evidence 규칙을 검사하게 했다.
  - `docs/README.md`에 에이전트 하네스 상태 파일을 문서 map과 SSOT 우선순위에 연결했다.
- Verification run:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1` - passed
  - `pnpm harness:check` - passed
  - `Get-Content -Encoding UTF8 -Raw -LiteralPath feature_list.json | ConvertFrom-Json | Out-Null` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - `HARNESS-001` through `HARNESS-006` are marked `passing` in `feature_list.json` with command evidence.
- Commits:
  - `b096e541 Docs: 에이전트 하네스 보강`
- Known risks:
  - `feature_list.json`은 제품 로드맵이 아니라 에이전트 하네스 작업 추적용이다.
  - Turbo checks pass, but Turbo prints a git dubious ownership warning because the sandbox user differs from the repository owner.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
  - `HARNESS-007` baseline E2E smoke remains not started.
- Next best action:
  - Define a minimal Representative Use Journey smoke that does not run real AWS apply/destroy without explicit approval and cleanup planning.

### 2026-07-03 - Direct Deployment 승인 스냅샷 재검증 테스트와 SW 문서

- Goal: SketchCatch issue #128의 Worker 1-1 범위에서 Direct Deployment approval/apply precondition 회귀 테스트와 `docs/sw` 학습 문서를 보강한다.
- Completed:
  - `deployment-approval-service.test.ts`에 artifact hash drift, tfplan hash drift, AWS account drift, AWS region drift, missing approval snapshot fields 테스트를 추가했다.
  - `deployment-apply-service.test.ts`에 apply 진입점에서 approval snapshot drift가 AWS credential 준비, plan file write, Terraform 실행 전에 막히는 회귀 테스트를 추가했다.
  - production code는 수정하지 않았다. 기존 `deployment-approval-service.ts`의 approval snapshot 저장과 apply precondition 재검증이 새 테스트를 통과했다.
  - `docs/sw/005_승인스냅샷재검증클론코딩가이드_sw.md`를 추가하고 `docs/sw/README.md`에 연결했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-approval-service.test.ts src/deployments/deployment-apply-service.test.ts src/deployments/deployment-destroy-service.test.ts` - passed
  - `pnpm --filter @sketchcatch/api test` - failed once because existing tests require `S3_BUCKET_NAME`
  - `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm --filter @sketchcatch/api test` - passed
  - `pnpm --filter @sketchcatch/api lint` - passed
  - `pnpm --filter @sketchcatch/api typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `git diff --check` - passed
  - `pnpm harness:check` - passed after edits
- Evidence recorded:
  - Targeted deployment tests now explicitly cover apply precondition artifact hash drift, tfplan hash drift, AWS account drift, AWS region drift, missing approval snapshot fields, missing plan source hash, and existing destroy service behavior.
  - No real Terraform apply/destroy, cloud mutation, Git/CI/CD handoff, or secret access was performed.
- Known risks:
  - Full API tests need a non-secret `S3_BUCKET_NAME` value in this environment because unrelated S3-backed tests construct plan artifact storage.
  - The broad `pnpm build` temporarily touched `apps/web/next-env.d.ts`; the generated content change was restored and the final dirty list is scoped to #128 files.
- Next best action:
  - Parent agent should review the focused diff and open the PR. Worker 1-1 should not expand into issue 1-2 or 1-3 from this branch.

### 2026-07-04 - Runtime Cache Redis adapter slice

- Goal: SketchCatch issue #132 범위에서 #131 RuntimeCache abstraction 위에 Redis adapter를 붙이고, `REDIS_URL`이 없거나 test 환경이면 in-memory fallback을 유지한다.
- Completed:
  - `apps/api`에 `redis` client dependency를 추가하고 `pnpm-lock.yaml`에 해당 dependency graph를 반영했다.
  - `redis-runtime-cache.ts`에 lazy Redis connection, millisecond TTL `PX` set, encoded key prefix, memory fallback, degraded callback 처리를 구현했다.
  - `runtime-cache-factory.ts`에서 `REDIS_URL`/`NODE_ENV` 기반 adapter 선택 정책을 추가했다.
  - `config/env.ts`, `.env.example`, `docs/data-models.md`, `docs/deployment.md`에 Runtime Cache Redis 설정과 fallback 정책을 반영했다.
  - `docs/sw/007_레디스런타임캐시어댑터가이드_sw.md` 학습 문서를 추가하고 `docs/sw/README.md`에 연결했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/runtime-cache/in-memory-runtime-cache.test.ts src/runtime-cache/redis-runtime-cache.test.ts src/runtime-cache/runtime-cache-factory.test.ts` - passed
  - `pnpm --filter @sketchcatch/api lint` - passed
  - `pnpm --filter @sketchcatch/api typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm --filter @sketchcatch/api test` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - Tests cover Redis JSON/TTL write, key escaping, Redis connect failure fallback, Redis command failure fallback, missing `REDIS_URL` fallback, and `NODE_ENV=test` fallback.
  - No real Redis server, cloud mutation, Terraform apply/destroy, Git/CI/CD handoff execution, or secret access was performed.
- Known risks:
  - The Redis adapter currently provides in-process fallback for degraded Redis operations; fallback state is not durable across API process restart.
  - Full API tests need a non-secret `S3_BUCKET_NAME` value in this environment because unrelated S3-backed tests construct plan artifact storage.
- Next best action:
  - Review the focused #132 diff, run final harness, commit, push, and open a PR targeting `dev`.
### 2026-07-04 - Blueprint 전체 리디자인 적용

- Goal: `docs/sw/spec2.md`와 `docs/sw/plan2.md` 기준으로 SketchCatch 웹 화면 전체를 Blueprint 언어로 맞추고, Architecture Board와 Deployment Safety Gate 완성도를 우선 보강한다.
- Completed:
  - `docs/sw/spec2.md`, `docs/sw/plan2.md`, `docs/sw/agents2.md`를 작성하고 `docs/sw/README.md`에 연결했다.
  - Spoqa Han Sans Neo를 프로젝트 기본 폰트로 self-hosting하고, Space Grotesk/JetBrains Mono도 로컬 폰트 자산으로 추가했다. 런타임 Google Fonts fetch는 사용하지 않는다.
  - `/` 랜딩을 Requirement Input -> Architecture Board -> IaC Preview -> Safety Gate -> Deployment History 여정 중심 Blueprint 화면으로 재구성했다.
  - `/login`, `/signup`, `/password-reset`의 라우트와 검증 흐름은 유지하고 좌측 폼 + 우측 Blueprint aside 구조로 통일했다.
  - Dashboard 카드 썸네일과 상태 배지를 Blueprint 미니 도면/비파괴 UI 상태로 정리했다. 새 API 계약은 추가하지 않았다.
  - Architecture Board의 팔레트, 캔버스, 툴바, 노드, Parameter panel을 Blueprint 스타일로 맞추고 새 일반 리소스 기본 크기를 124x96으로 조정했다. 영역 컨테이너 크기와 기존 저장 size는 유지한다.
  - Deployment Panel에 `isBlocked`, `blockedBy`, `blockedReason`, `planSummary.warnings`, Pre-Deployment findings 기반 HIGH/MED/LOW gate UI를 추가했다. `getDeploymentActionState`는 변경하지 않았다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web test` - passed
  - `pnpm harness:check` - passed after implementation before browser smoke
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - Browser smoke with Playwright temp install: `/`, `/login`, `/signup`, `/mypage`, `/workspace/new`, `/workspace`, EC2 node drop, and mocked Deployment Gate record passed on desktop/mobile checks.
- Evidence recorded:
  - Browser screenshots confirmed no clipped landing H1, readable auth forms, EC2 node render at the new tile size, and a HIGH deployment gate card without broken `missing_approval` wrapping.
  - Local dev server remained available at `http://localhost:3000` during visual verification.
  - Known local API noise during browser smoke was limited to missing local backend endpoints such as `/api/auth/refresh` and `/api/terraform/generate`; mocked responses were used only for visual Safety Gate verification.
  - No real AWS apply/destroy, cloud mutation, Git/CI/CD handoff, dependency lockfile rewrite, or `feature_list.json` update was performed.
- Known risks:
  - Browser smoke used a temporary Playwright install under `%TEMP%` because the bundled package lacked `playwright-core`.
  - Real authenticated `/mypage` and `/workspace/new` content still depends on a running backend/session; unauthenticated smoke correctly redirected to `/login`.
- Next best action:
  - Review the Blueprint visual diff on the running dev server and decide whether to add a stable visual smoke script later.

### 2026-07-04 - Landing/Auth Blueprint polish feedback

- Goal: 메인 페이지의 장황한 문구와 딱딱한 블록감을 줄이고, Auth 오른쪽 Blueprint aside의 의미와 시각 완성도를 개선한다.
- Completed:
  - `/` 랜딩 문구를 핵심 메시지 중심으로 줄이고 Journey/Operations 설명 블록을 3개 proof point와 Safety Gate 섹션으로 정리했다.
  - 랜딩 오른쪽 비주얼을 Prompt -> Board -> Plan -> Gate 흐름과 연결된 미니 보드로 다시 구성하고, 겹치거나 끝점 없는 선을 제거했다.
  - `/login`, `/signup`, `/password-reset`의 오른쪽 aside를 도면/타이틀블록 장식에서 Architecture Board -> Terraform Preview -> Safety Gate 흐름 패널로 교체했다.
  - 후속 피드백에 따라 Auth 오른쪽 aside 블록을 완전히 제거하고, Auth 상단 설명 문구를 삭제했다.
  - 회원가입의 `중복 확인`/약관 `보기` 버튼 대비를 높여 비활성 상태에서도 버튼 형태와 텍스트가 보이게 조정했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck` - passed
  - Browser screenshot smoke: `/`, `/login`, and `/signup` on desktop/mobile - passed visual review
- Evidence recorded:
  - Desktop home now has shorter hero copy, clear 3-card meaning, and no disconnected board line.
  - Auth screens now use a single centered form without the confusing right-side block.
  - Signup duplicate-check and legal-view buttons are visible with stronger border/text contrast.
- Known risks:
  - This pass is visual polish only; backend/auth/session behavior was not changed.
- Next best action:
  - Run final full checks and commit the feedback polish.

### 2026-07-04 - Architecture Board area and connection handle feedback

- Goal: 영역 제목/팔레트/연결선이 Architecture Board에서 서로 가리거나, 사용자가 찍은 연결점과 다른 위치에 선이 붙는 문제를 바로잡는다.
- Completed:
  - 선택 팔레트를 영역 제목을 가리지 않도록 선택 영역 하단으로 이동했다.
  - 영역 제목은 영역 내부를 덮지 않게 경계선 위 바깥으로 띄우고, Region 라벨에는 선택된 AWS Region 값을 함께 표시했다.
  - Region/AZ/VPC 같은 영역 배경을 더 읽기 쉬운 흰색 기반으로 정리하고, 드래그 중 포함 후보 영역은 초록색 피드백으로 명확히 보이게 했다.
  - 영역 안 리소스와 연결선의 z-index를 containment depth 기준으로 정리해, 부모/자식 영역이 겹쳐도 소속 리소스와 화살표가 의도한 계층에 보이게 했다.
  - React Flow edge가 `handle-left` 같은 stale handle 경고를 내지 않도록 source/target 전용 핸들을 실제로 렌더링하고, 저장된 논리 핸들 값을 실제 핸들 ID로 매핑했다.
  - 연결 핸들 크기와 보이지 않는 클릭 범위를 키워 선 연결 시작/종료가 더 쉽게 되도록 조정했다.
- Verification run:
  - `pnpm --dir . --filter @sketchcatch/web test -- flow-mappers.test.ts` - passed, 275 tests
  - `pnpm --dir . typecheck` - passed
  - `pnpm --dir . lint` - passed
  - `pnpm --dir . build` - passed
  - `pnpm --dir . harness:check` - passed
- Known risks:
  - Browser에서 실제 포인터 드래그를 다시 손으로 확인하면 미세한 클릭 감도 조정이 추가로 필요할 수 있다.
  - Turbo는 sandbox 사용자와 로컬 git 소유자가 달라 `safe.directory` 경고를 계속 출력하지만, 작업 자체는 성공했다.

### 2026-07-04 - Logo, landing header, and multi-edge handle feedback

- Goal: SketchCatch 로고가 서비스 개성을 드러내도록 교체하고, 메인 페이지의 불필요한 네비게이터와 연결선 핸들 UX 문제를 정리한다.
- Completed:
  - GPT Image built-in tool로 SketchCatch 로고 콘셉트를 생성하고, 스케치 보드/클라우드/실행 흐름 모티프를 작은 화면에서도 선명한 `sketchcatch-logo.svg` 자산으로 재구성했다.
  - 랜딩, 로그인, 회원가입, 비밀번호 재설정, 대시보드 사이드바 브랜드 마크를 새 로고 자산으로 교체했다.
  - 메인 페이지의 `Flow / Review` 네비게이터를 제거하고 헤더 액션은 `새 작업 시작` 하나만 남겼다.
  - 연결 핸들을 source/target 전용으로 분리하고 레이어를 조정해, 여러 선을 이어 그릴 때 target 핸들이 시작 클릭을 가로채지 않게 했다.
- Verification run:
  - Browser smoke on `/`: `siteNav` count 0, header CTA text `새 작업 시작`, logo rendered at 44x44.
  - `pnpm --dir . --filter @sketchcatch/web test -- flow-mappers.test.ts` - passed, 275 tests
  - `pnpm --dir . typecheck` - passed
  - `pnpm --dir . lint` - passed
  - `pnpm --dir . build` - passed
  - `pnpm --dir . harness:check` - passed
- Known risks:
  - Browser smoke showed an expected unauthenticated 401 from auth status loading on the public landing page; the page rendered normally.
  - The generated GPT Image concept remains in the Codex generated image cache; the app uses the cleaned SVG asset for production UI.

### 2026-07-04 - Landing hero and board area feedback

- Goal: 메인 페이지가 한눈에 들어오도록 문구/배치/플로팅 요소를 정리하고, Architecture Board의 영역 컨테이너가 배경에 묻히지 않게 보강한다.
- Completed:
  - 메인 hero 문구를 짧게 줄이고, 서브 문구는 데스크톱에서 한 줄로 보이도록 폭과 정렬을 조정했다.
  - hero CTA `새 작업 시작`을 왼쪽 정렬로 바꾸고, hero 안 로그인 CTA는 제거된 상태를 유지했다.
  - 오른쪽 Blueprint 보드 프레임 높이를 낮추고 Terraform Preview 플로팅 카드가 화면 바깥으로 넘어가지 않게 위치를 조정했다.
  - 보드 내부 리소스 아이콘의 개별 floating animation을 제거하고 EC2-S3-CloudWatch 선을 실제 노드 가장자리에 맞춘 wire로 교체했다.
  - 반복되던 Review 플로팅 카드를 제거하고, AWS 연결 카드는 EC2 아이콘 대신 AWS Cloud logo를 사용하도록 수정했다.
  - Region/AZ/VPC 같은 area node는 흰색 paper 면, 더 진한 테두리, 선명한 라벨 pill로 바꿔 배경 그리드에 묻히지 않게 했다.
- Verification run:
  - Browser smoke with installed Chrome on `/`: desktop 1920px에서 서브 문구 1줄, CTA left aligned, Terraform Preview card inside viewport, no horizontal overflow.
  - Browser smoke with installed Chrome on `/`: EC2-S3 wire touches node edges and S3-CloudWatch wire starts from S3 edge; Review floating card count is 0.
  - `pnpm --dir . harness:check` - passed
  - `pnpm --dir . lint` - passed
  - `pnpm --dir . typecheck` - passed
  - `pnpm --dir . build` - passed before final area-node white paper adjustment; final build rerun pending.
- Known risks:
  - Browser smoke used local frontend rendering only; no real AWS apply/destroy, backend deployment, or Git/CI/CD handoff was executed.
  - Next.js build toggles `apps/web/next-env.d.ts` between dev/prod generated route type imports; this file should be excluded from the UI diff.

### 2026-07-04 - Terraform editor wrapped-line highlight feedback

- Goal: Terraform 패널을 좁혔을 때 soft wrap 때문에 줄번호와 코드 줄, 선택 하이라이트 위치가 어긋나는 문제를 고친다.
- Completed:
  - Terraform editor의 별도 line-number `ol`을 제거하고, `line number + code`를 같은 row 안에서 렌더링하도록 바꿨다.
  - 선택 하이라이트가 큰 고정 박스처럼 덮이지 않고, 실제 코드 row의 gutter와 code 영역에만 들어가도록 CSS를 정리했다.
  - 선택 리소스로 자동 스크롤할 때 고정 line-height 계산 대신 실제 row offset을 우선 사용하도록 바꿔, 줄바꿈된 코드에서도 이전/다음 리소스 블록으로 밀리지 않게 했다.
  - editor viewport 전체에 gutter 배경을 깔아 코드가 짧거나 아래 여백이 남아도 줄번호 영역이 끊겨 보이지 않게 했다.
- Verification run:
  - Browser smoke on `/workspace` with auth mocks: Terraform tab at 245px visible textarea width measured wrapped rows; row/gutter/code heights matched with `anyHeightMismatch=false`.
  - `pnpm --dir . harness:check` - passed
  - `pnpm --dir . lint` - passed
  - `pnpm --dir . typecheck` - passed
  - `pnpm --dir . build` - passed
- Known risks:
  - Browser smoke used mocked auth/API responses and manually injected Terraform text; no real backend generation, save, AWS apply, or destroy was executed.

### 2026-07-04 - MyPage project thumbnail icon-only feedback

- Goal: 마이페이지 프로젝트 썸네일의 리소스 타일에서 리소스 이름을 빼고 아이콘만 크게 보이게 한다.
- Completed:
  - `ProjectArchitectureThumbnail`의 일반 리소스 label 렌더링과 label trim 로직을 제거했다.
  - 썸네일 리소스 아이콘을 노드 중앙에 배치하고 최대 56px까지 커지도록 조정했다.
- Verification run:
  - Browser smoke on `/mypage` with auth/API mocks: project thumbnail SVG `text` count 0, EC2 icon size 56x56.
  - `pnpm --dir . harness:check` - passed
  - `pnpm --dir . lint` - passed
  - `pnpm --dir . typecheck` - passed
  - `pnpm --dir . build` - passed
- Known risks:
  - Browser smoke used mocked project/draft responses; no real backend draft fetch or deployment path was exercised.

### 2026-07-04 - Architecture Board connection stability feedback

- Goal: 리소스 간 연결선이 간헐적으로 사라지거나, 노드 크기 조절 뒤에야 다시 보이는 문제를 줄인다.
- Completed:
  - React Flow 연결 드래그 시작/종료 상태를 노드 데이터로 전달해, 연결 중에는 모든 연결 핸들이 보이고 실제로 pointer target이 되도록 정리했다.
  - 노드 수동 리사이즈 중/후 `useUpdateNodeInternals`를 호출해 React Flow의 handle/edge geometry가 노드 크기 변화와 함께 갱신되도록 했다.
  - `toFlowNodes` 계약과 관련 단위 테스트 호출부에 `isConnectionActive` 인자를 반영했다.
- Verification run:
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch --filter @sketchcatch/web lint` - passed
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch --filter @sketchcatch/web typecheck` - passed
  - Browser smoke on `/workspace`: EC2/S3 nodes dropped through the app drop payload, edge connected, all handles visible during connection drag, and the edge remained present after resizing EC2.
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch lint` - passed
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch typecheck` - passed
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch build` - passed
- Known risks:
  - Browser smoke used auth mocks and synthetic drop payloads for UI-only verification; no backend or AWS deployment path was executed.
  - Turbo reported a Git safe.directory warning under the sandbox user, but all lint/typecheck/build tasks completed successfully.

### 2026-07-04 - Dashboard and auth layout feedback

- Goal: 템플릿/마이페이지 계열 dashboard 본문이 비정상적으로 아래로 밀리는 문제와 Auth 화면 좌우 여백, 회원가입 상태 문구 가독성/밀도를 보정한다.
- Completed:
  - Blueprint dashboard override에서 sidebar가 `position: relative`로 문서 흐름에 들어가던 문제를 데스크톱 `fixed` sidebar로 되돌려 dashboard 본문이 상단에서 시작하도록 수정했다.
  - Dashboard topbar와 본문 gap/padding을 줄여 템플릿 허브 첫 화면이 불필요한 빈 공간 없이 시작되도록 조정했다.
  - Login/Signup 단일 auth shell 폭과 panel 폭을 일치시켜 좌우 여백을 균등하게 맞췄다.
  - Signup 입력 높이, 내부 gap, button 높이, 상태 메시지 line-height를 줄이고 success/error 색을 진하게 조정했다.
  - 아이디/이메일 중복 확인 메시지 영역은 `:has(.authInlineControl)` 기반 최소 높이를 둬 상태 문구가 나타날 때 전체 폼이 덜 밀리도록 보정했다.
- Verification run:
  - Browser smoke on `/templates`: dashboard main y=0, topbar y=18, first panel y=160 after auth mock.
  - Browser smoke on `/login`: auth panel left/right viewport gap both 736px at 1920px width.
  - Browser smoke on `/signup`: status messages visible at rgb(18,116,59) and rgb(180,35,24); panel bottom 933px within 1080px viewport.
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch harness:check` - passed
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch lint` - passed
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch typecheck` - passed
  - `pnpm --dir C:\Users\siwon\Desktop\Jungle\Week17~21\SketchCatch build` - passed
- Known risks:
  - Browser verification used auth/API mocks and did not exercise real login, signup, or backend availability checks.
  - Turbo continued to report the sandbox Git safe.directory warning, but all tasks completed successfully.

### 2026-07-04 - Terraform highlight and canvas node sizing feedback

- Goal: Terraform 패널을 줄였을 때 선택 리소스 하이라이트가 이전 CloudWatch/EventBridge 블록에 붙는 문제를 고치고, 캔버스 리소스 노드의 아이콘/라벨 반응형 표현을 다듬는다.
- Completed:
  - Terraform 코드 하이라이트를 고정 좌표 박스에서 실제 파싱된 블록 라인 클래스 방식으로 바꿔 패널 폭/줄바꿈에 끌려가지 않게 정리했다.
  - `findTerraformBlockForNode`가 stale `parameters`만 믿지 않고 노드의 실제 `type`과 보이는 `label` 기반 address 후보를 먼저 교차 확인하도록 보강했다.
  - EC2처럼 보이는 노드가 이전 CloudWatch/EventBridge parameters를 갖고 있어도 `aws_instance.ec2_instance` 블록을 선택하는 회귀 테스트를 추가했다.
  - Terraform editor의 가로 스크롤을 숨기고 soft wrap/syntax highlight 계층을 패널 폭에 맞춰 움직이도록 조정했다.
  - 캔버스 리소스 노드는 아이콘 상단, 라벨 하단 구조로 유지하고 아이콘은 노드 크기에 비례해 커지며 라벨은 한 줄 유지와 최소 폰트 보정을 적용했다.
  - 휠/빈 캔버스 드래그 중 임시 pan 모드로 전환하고 동작 종료 후 기존 선택 모드로 돌아오도록 보강했다.
- Verification run:
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web test -- terraform-panel-utils.test.ts` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck` - passed
  - Browser smoke on `/workspace`: EC2/EventBridge node drop and canvas selected class switching passed; Terraform textarea `overflow-x` computed as `hidden`.
- Known risks:
  - Browser smoke used auth mocks and manually injected Terraform text for visual inspection; no real backend generation or AWS deployment was executed.
  - Terraform leave guard intentionally blocks canvas clicks while there are unsaved manual Terraform edits, so highlight switching should be evaluated in synced/clean editor state.

### 2026-07-04 - Canvas resource selection spacing feedback

- Goal: 선택 박스와 실제 리소스 아이콘/라벨 사이 여백이 과하게 넓어 보이는 문제를 줄인다.
- Completed:
  - 리소스 노드의 container gap/padding을 줄이고, 아이콘 크기 계산을 노드 폭/높이에 더 크게 반응하도록 조정했다.
  - 큰 노드에서도 선택 영역 안쪽에 리소스가 작게 떠 보이지 않도록 아이콘 상한을 확대했다.
  - 스크롤 휠 회전이나 빈 캔버스 왼쪽 드래그가 임시 pan 모드를 켜지 않도록 제거하고, 휠 클릭을 누르는 동안만 pan 모드가 되며 버튼을 떼거나 pointer cancel/window blur가 발생하면 선택 모드로 복귀하게 정리했다.
  - 수동으로 캔버스 이동 모드를 선택한 상태에서는 휠 클릭을 눌렀다 떼도 선택 모드로 돌아가지 않고 고정 pan 모드를 유지하도록 임시/수동 pan 상태를 분리했다.
  - Deployment 패널 헤더/섹션이 오른쪽 여백을 과하게 남기지 않도록 상시 scrollbar gutter와 헤더 우측 margin을 제거해 좌우 외곽 여백을 맞췄다.
- Verification run:
  - `pnpm harness:check` - passed before edit
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck` - passed
  - Browser smoke on `/workspace`: middle mouse down switched to pan and middle mouse up returned to select.
  - Browser smoke on `/workspace`: manually selected pan mode stayed pan after middle mouse down/up.
  - Browser DOM smoke on `/workspace` Deploy tab measured deployment panel side gaps at left 17px and right 16px.
- Known risks:
  - CSS-only visual tuning이며, 실제 AWS apply/destroy나 backend contract 변경은 없다.

### 2026-07-04 - Architecture Board panel/resource polish feedback

- Goal: Architecture Board의 AI, Terraform, Resource, Templates, Issues, Deployment 패널을 같은 Blueprint 디자인 언어로 통일하고, 리소스 팔레트를 카드형 박스가 아닌 아이콘 중심 타일로 정리한다.
- Completed:
  - Resource/Template 패널의 탭, provider controls, search, accordion header, section body를 Blueprint paper/line/grid 규칙으로 맞췄다.
  - Compute 등 일반 리소스 타일에서 흰 카드 박스와 그림자를 제거하고, dotted blueprint field 위에 AWS 아이콘과 굵은 라벨만 보이도록 조정했다.
  - 오른쪽 AI, Terraform, Issues, Deployment 패널의 toolbar, mode button, section, notice, input, action button 스타일을 같은 Blueprint 변수 기반으로 정리했다.
  - `/costs` 화면의 큰 공백과 흐릿한 본문 문제를 dashboard shell/panel/table/summary contrast override로 보정했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck` - passed
  - Browser screenshot smoke with installed Chrome: `/workspace`, `/workspace` Compute open, Terraform/Issues/AI/Deploy tabs, `/workspace/new`, `/costs` - passed visual review
- Evidence recorded:
  - Compute resources now render as icon+label tiles without rectangular resource cards.
  - `/costs` now shows readable dashboard panels and table content without the broken top spacing from the user screenshot.
  - Auth mocks were used only for visual dashboard smoke; no real AWS apply/destroy, cloud mutation, Git/CI/CD handoff, backend contract change, or `feature_list.json` update was performed.
- Known risks:
  - This pass is visual/CSS polish only; Resource/Template tab behavior remains the existing implementation.
- Next best action:
  - Run final full checks and commit the feedback polish.
# 2026-07-04 - 오른쪽 패널 Blueprint 스킨 복구

- Goal: 최신 `dev` 병합에서 유지한 오른쪽 패널 로직 위에 빠진 Blueprint 디자인 톤을 다시 적용한다.
- Completed:
  - `workspace.module.css`에 원래 작업했던 Blueprint panel polish pass를 현재 dev class 구조에 맞춰 복구했다.
  - Resource, Terraform, Diagnostics, AI, Deployment 패널의 배경, 테두리, 버튼, 상태 배지 톤을 Blueprint 언어로 맞췄다.
  - Terraform editor는 레이아웃/하이라이트 레이어를 유지하고 token 색상만 Blueprint 팔레트에 맞게 조정했다.
  - `terraformTopActions` wrapper가 빈 블럭처럼 보이지 않도록 wrapper styling을 제거하고 버튼만 Blueprint 버튼으로 유지했다.
  - Terraform panel의 최신 dev 기능은 유지했다: virtual file save, leave guard, diagnostics line mapping, sync proposal auto-apply, syntax token utility, deployment-owned preflight flow.
  - 버려진 기능 정리: 예전 디자인 커밋의 `TerraformCodePanel.tsx` 전체 구현, inline highlighter, detached artifact save/action UI, advanced parameter picker UI, old deployment layout은 복구하지 않았다.
- Verification run:
  - `pnpm harness:check` - passed before editing
  - `pnpm --dir . --filter @sketchcatch/web test -- area-nodes.test.ts flow-mappers.test.ts catalog.test.ts terraform-panel-utils.test.ts workspace-ai-diagram-adapter.test.ts terraform-code-highlighting.test.ts terraform-diagnostic-line-highlights.test.ts` - passed, 334 tests
  - `pnpm --dir . typecheck` - passed
  - `pnpm --dir . --filter @sketchcatch/web test -- workspace-right-panel-layout.test.ts terraform-code-highlighting.test.ts terraform-diagnostic-line-highlights.test.ts` - passed, 334 tests
  - `pnpm --dir . harness:check` - passed after editing
  - `pnpm --dir . lint` - passed
  - `pnpm --dir . build` - passed
- Known risks:
  - 이번 변경은 CSS skin 복구라 실제 브라우저 스크린샷 검증은 아직 남아 있다.
  - 최신 dev의 오른쪽 패널 기능을 우선했기 때문에, 과거 디자인 커밋에서만 있던 중복 UI는 의도적으로 되살리지 않았다.
- Next best action:
  - 오른쪽 패널 브라우저 스모크에서 탭별 시각 일관성과 Terraform editor resize 상태를 확인한다.

# 2026-07-04 - Terraform Validate 제거 및 AI/캔버스 툴바 정리

- Goal: Terraform 탭에서 별도 Validate 버튼을 제거하고, AI 채팅/연결선 도구/리소스 핸들 UI의 최근 피드백을 반영한다.
- Completed:
  - Terraform 코드 패널의 상단/리소스 모드 `Validate` 버튼과 전용 클릭 핸들러를 제거했다.
  - 저장 및 배포 준비에서 쓰는 기존 Terraform 정적 검증 로직은 유지했다.
  - AI 채팅을 `초안 제안` / `시뮬레이션` 탭으로 나누고, 현재 탭 기록을 지우는 버튼을 추가했다.
  - 시뮬레이션 답변을 긴 문단 대신 카드형 요약으로 읽히게 정리했다.
  - 연결선 툴바에 라벨 입력을 추가하고, 캔버스 중앙에 고정되도록 위치를 조정했다.
  - 마우스 오버 시 보이던 의미 없는 target handle은 숨기고, 연결용 source handle 크기를 조금 줄였다.
- Verification run:
  - `pnpm --dir . --filter @sketchcatch/web test -- workspace-right-panel-layout.test.ts workspace-ai-draft-follow-up.test.ts workspace-ai-clarification.test.ts terraform-code-highlighting.test.ts` - passed, 362 tests
  - `pnpm --dir . harness:check` - passed
  - `pnpm --dir . typecheck` - passed
  - `pnpm --dir . --filter @sketchcatch/web test -- workspace-right-panel-layout.test.ts terraform-code-highlighting.test.ts` - passed, 362 tests
  - `pnpm --dir . lint` - passed
  - `pnpm --dir . build` - passed
- Known risks:
  - 이번 확인은 정적 체크와 테스트 중심이며, 최신 툴바 위치는 브라우저 스크린샷으로 재확인하지 않았다.
  - 실제 AWS apply/destroy나 Git/CI/CD 실행은 수행하지 않았다.
## 2026-07-05 - Issue #135 GitHub PR handoff v0

- Goal: #134 GitCicdHandoff 계약/API 위에 Terraform artifact를 GitHub PR 생성 요청 payload로 넘기는 두 번째 vertical slice를 구현한다.
- Completed:
  - `SourceRepositoryProvider`에 `github` provider를 추가하고 additive enum migration `0022_git_cicd_github_provider.sql`을 만들었다.
  - `CreateGitCicdHandoffRequest`가 `repositoryProvider`와 optional `planSummary`를 받을 수 있게 확장했다.
  - Git provider abstraction과 `createGitHubGitCicdHandoffProvider`를 추가해 Terraform artifact metadata, source/target branch, commit message, PR title/body draft, review checklist를 fake provider payload로 전달한다.
  - provider 결과 PR URL/source branch/commit SHA를 handoff record의 `pr_created` status, PR URL, source branch, status message에 반영한다.
  - provider mismatch를 409로 막아 실제 GitHub provider가 주입되지 않은 상태에서 `github` 요청이 조용히 draft로 저장되지 않게 했다.
  - `docs/sw/010_GitHub_PR_Handoff_v0_클론코딩가이드_sw.md`와 data model/docs index를 보강했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/git-cicd-handoffs.test.ts src/db/schema-contract.test.ts` - passed
  - `pnpm --filter @sketchcatch/api typecheck` - passed
  - `pnpm --filter @sketchcatch/types typecheck` - passed
  - `pnpm --filter @sketchcatch/api lint` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Known risks:
  - 실제 GitHub API 호출, GitHub token 사용, pipeline polling/cache 연동, Runtime Cache 신규 작업, AWS apply/destroy는 수행하지 않았다.
  - full `pnpm test`는 시간 범위상 실행하지 않았고, #135 targeted API tests와 lint/typecheck/build로 검증했다.
## 2026-07-05 - Issue #130 Direct Deployment 신뢰도 UX

- Goal: Direct Deployment apply 직전 승인된 Terraform artifact/tfplan/AWS account/region snapshot과 실제 apply 입력 불일치를 사용자에게 명확히 보여주고, API 상태/로그/UI/docs가 같은 의미를 말하도록 정리한다.
- Completed:
  - apply precondition 전용 `DeploymentApplyPreconditionError`를 추가하고 artifact id, plan id, artifact hash, tfplan hash, AWS account, AWS region mismatch 메시지에 승인값/current 값을 포함했다.
  - apply job catch 흐름에서 precondition mismatch를 `failureStage: "approval"`로 저장하고 `Apply blocked before Terraform apply: ...` 로그를 남기도록 했다.
  - UI action state가 완성된 approval snapshot이 있을 때만 apply/destroy 실행을 허용하도록 보강하고, Apply 확인 UI에 승인된 tfplan/artifact hash를 표시했다.
  - `docs/sw/009_Direct_Deployment_신뢰도_UX_클론코딩가이드_sw.md`를 추가하고 docs/sw README에 연결했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-approval-service.test.ts src/deployments/deployment-apply-service.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-actions.test.ts` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed after edits
- Known risks:
  - 실제 AWS apply/destroy는 실행하지 않았다.
  - full `pnpm test`는 시간 범위상 실행하지 않았고, #130 관련 targeted tests와 lint/typecheck/build로 검증했다.
## 2026-07-05 - Issue #133 Deployment Runtime Cache 상태/로그 커서 연결

- Goal: #131 RuntimeCache abstraction과 #132 Redis adapter/fallback 정책 위에 Deployment 장기 실행 상태와 log stream cursor를 보조 cache 계층으로 연결한다.
- Completed:
  - `createRuntimeCachedDeploymentRepository`를 추가해 기존 `DeploymentRepository` mutation 성공 결과를 기준으로 `deployment.status` snapshot을 best-effort cache write하도록 했다.
  - `createDeploymentLog`/`createDeploymentLogs`와 SSE log stream이 `deployment.log_cursor`를 갱신하도록 연결했다.
  - log stream 시작 시 Runtime Cache cursor를 보조 힌트로 읽되, cache miss/failure 시 기존 RDS `deployment_logs` 조회 흐름을 유지했다.
  - `buildApp`에서 `createRuntimeCacheFromEnv`를 구성해 production은 Redis/fallback 정책을 쓰고 test는 in-memory fallback을 유지하게 했다.
  - `docs/sw/010_Deployment_Runtime_Cache_상태로그커서가이드_sw.md`를 추가하고 key namespace/TTL/reverse scan/pipeline polling convention을 문서화했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/deployments.test.ts` - passed
  - `pnpm --filter @sketchcatch/api lint` - passed
  - `pnpm --filter @sketchcatch/api typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `git diff --check` - passed
- Known risks:
  - 실제 Redis 서버 의존 테스트는 수행하지 않았고 in-memory/fake cache로 검증했다.
  - Runtime Cache는 원천 기록이 아니며 RDS/S3 조회가 계속 기준이다.
## 2026-07-05 - Issue #136 Git/CI/CD pipeline status UI

- Goal: #134/#135 GitCicdHandoff 계약 위에서 pipeline status 조회, Runtime Cache read-through, DeploymentPanel 표시를 최소 vertical slice로 연결한다.
- Completed:
  - `GitCicdHandoffPipelineStatus` shared DTO와 `GET /api/git-cicd-handoffs/:handoffId/pipeline-status`를 추가했다.
  - `git_ci.pipeline_status` Runtime Cache snapshot helper를 추가해 cache hit 시 Runtime Cache, miss/invalid 시 RDS handoff record를 반환하게 했다.
  - handoff 생성과 status PATCH 후 best-effort로 pipeline status snapshot을 갱신하게 했다.
  - DeploymentPanel에 `Git/CI/CD handoff` 섹션을 추가해 Direct Deployment records와 PR/pipeline status를 분리해서 표시했다.
  - UI polling은 `pr_created`, `pipeline_running` 상태에만 수행하도록 Direct Deployment polling과 분리했다.
  - `docs/sw/011_GitCicd_Pipeline_Status_클론코딩가이드_sw.md`와 data model 문서를 보강했다.
- Verification run:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/git-cicd-handoffs.test.ts src/db/schema-contract.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/deployment-actions.test.ts` - passed
  - `pnpm --filter @sketchcatch/api typecheck` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm --filter @sketchcatch/api lint` - passed
  - `pnpm --filter @sketchcatch/web lint` - passed
  - `pnpm --filter @sketchcatch/types typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed after edits
  - `git diff --check` - passed
- Known risks:
  - 실제 GitHub API 호출, GitHub Actions polling worker, GitHub token 사용은 수행하지 않았다.
  - 실제 AWS apply/destroy, cloud mutation, real Git/CI/CD handoff execution은 수행하지 않았다.
  - Runtime Cache는 보조 캐시이며 RDS `git_cicd_handoffs` record가 source of truth다.
