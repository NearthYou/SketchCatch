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

### 2026-07-04 - Brainboard AWS resource configurator 조사

- Goal: Brainboard가 AWS 1순위/2순위 리소스에 대해 어떤 `Main parameters`와 `Add blocks`를 들고 있는지 수집해 `docs/jh/000_AWS리소스목록_JH.md`에 기록한다.
- Completed:
  - 사용자가 열어 둔 Brainboard `innovation_sandbox` 설계 화면에서 AWS Provider `6.47.0` 기준 configurator 구조를 확인했다.
  - Brainboard 화면이 로드한 CDN identity card 경로(`cloud_providers/aws/6.47.0/identity_cards/{resource|data}`)를 확인하고, 112개 대상 리소스의 schema를 수집했다.
  - `docs/jh/000_AWS리소스목록_JH.md`에 `Brainboard configurator 조사 결과` 섹션을 추가했다.
  - 각 리소스 하위에 Brainboard 상태, `Main parameters(attributes)`, `Add blocks(blockTypes)` 목록을 기록했다.
  - 111개 리소스는 Brainboard identity card로 확인했고, `aws_wafv2_web_acl`은 Brainboard AWS Provider `6.47.0` 좌측 WAFv2 카탈로그와 identity card에서 확인되지 않아 미제공으로 기록했다.
- Verification run:
  - `pnpm harness:check` - passed before browser/docs work.
  - Brainboard doc count script - passed: resource heading 112개, unique heading 112개, 확인됨 111개, 미제공/미확인 1개.
  - Markdown whitespace check - passed: `docs/jh/000_AWS리소스목록_JH.md` trailing whitespace 0개.
  - `git diff --check` - passed for tracked changes.
  - `pnpm harness:check` - passed after doc update.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - Brainboard에서는 메뉴/DOM/정적 identity card만 읽었고, 배포 또는 클라우드 변경은 하지 않았다.
  - `docs/jh`는 `.gitignore` 대상이므로 커밋하려면 `git add -f docs/jh/000_AWS리소스목록_JH.md`가 필요하다.
- Known risks:
  - Brainboard Form 화면은 배치 위치, 연결 관계, 생성된 `cloudConfigs`, required 계열 조건에 따라 identity card schema 중 일부만 우선 노출한다. 문서는 Brainboard 원천 schema 기준 목록이다.
- Next best action:
  - SketchCatch resource definition 확장 시 이 문서의 `Main parameters`/`Add blocks`를 참고하되, 구현 전 Terraform AWS Provider schema required/validation 조건을 별도 확인한다.

### 2026-07-04 - Region/AZ 영역 리소스 전환과 nested block/AZ 검증 롤백

- Goal: 최신 nested block sync/AZ 입력 검증 수정은 롤백하되, 이미 구현된 Terraform Preview/Sync 지원 리소스 확장은 유지하고 Region/AZ를 다른 포함 영역처럼 board-only resource area node로 처리한다.
- Completed:
  - 최신 커밋 `2de8ae2`의 nested block cardinality, `parameter-value-record`, AZ input validation 변경을 `git revert --no-commit`으로 되돌렸다.
  - `packages/types/src/resource-definitions.ts` 기반 shared Terraform resource/data 지원 확장과 main parameter HCL 정규화 변경은 롤백하지 않았다.
  - Web catalog에서 Region/AZ를 `design_region`/`design_az`가 아니라 `aws_region`/`aws_availability_zone` resource area node로 생성하게 했다.
  - Region/AZ 영역 선택값은 `parameters.values.awsRegion`, `parameters.values.awsAvailabilityZone`에 저장하고, 기존 metadata 기반 design node는 저장 데이터 호환용으로만 읽게 했다.
  - Terraform Preview는 Region 영역 리소스가 있어도 provider block을 생성하지 않게 했다.
  - AZ 영역 리소스 안의 AZ-aware 리소스는 명시 `availabilityZone`이 없을 때만 영역의 AZ 값을 상속하게 했다.
  - Terraform Sync는 provider block을 Region 영역 리소스 create/update/delete 의도로 해석하지 않고 무시하게 했다.
  - Terraform Sync가 `aws_subnet`, `aws_ebs_volume`의 `availability_zone`을 `aws_availability_zone` 영역 리소스로 승격하고 child `metadata.parentAreaNodeId`를 연결하게 했다.
  - Terraform Sync create proposal에 `nodeId`와 `metadata`를 실을 수 있게 해, 새 AZ 영역과 새 child resource가 같은 저장 흐름에서 연결되게 했다.
  - `DiagramJson -> Terraform Preview -> Terraform Sync` AZ 영역 리소스 왕복 회귀 테스트를 추가하고, Region 영역 리소스는 Terraform provider로 왕복하지 않음을 테스트했다.
  - Auto Scaling Group은 visual area node로 다룰 수 있게 catalog size, area-node 판정, resize bounds를 맞췄다.
  - board-only `aws_region`/`aws_availability_zone`은 ArchitectureJson 변환과 Terraform resource projection에서 제외되게 했다.
  - `docs/data-models.md`와 `session-handoff.md`를 Region/AZ resource area 정책 기준으로 갱신했다.
- Verification run:
  - `pnpm harness:check` - passed before edits.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts src/services/terraform/infrastructure-graph.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/resource-settings/catalog.test.ts features/diagram-editor/area-nodes.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/reference-drop-targets.test.ts features/parameter-input/region-node-metadata.test.ts features/parameter-input/availability-zone-node-metadata.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts src/routes/project-draft-schemas.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/resource-list-summary.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/drag-transaction.test.ts features/diagram-editor/reference-drop-targets.test.ts features/diagram-editor/area-nodes.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/area-node-movement.test.ts features/diagram-editor/node-style.test.ts features/resource-settings/catalog.test.ts features/parameter-input/region-node-metadata.test.ts features/parameter-input/availability-zone-node-metadata.test.ts features/parameter-input/aws-region-options.test.ts features/parameter-input/availability-zone-options.test.ts features/parameter-input/parameter-panel-source.test.ts features/parameter-input/validation.test.ts features/workspace/resource-list-summary.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/parameter-input/region-node-metadata.test.ts features/parameter-input/availability-zone-node-metadata.test.ts` - passed after fixture type cleanup.
  - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - failed because `provider "aws"` was reported as `terraform.sync.unsupported_block` and `availability_zone` did not create AZ area resources.
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts` - failed because create proposals ignored explicit `nodeId` and `metadata`.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - passed after Region/AZ sync implementation.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts` - passed after create proposal metadata implementation.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts src/services/terraform/terraform-preview.test.ts src/services/terraform/infrastructure-graph.test.ts src/routes/terraform.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/diagram-editor/diagram-utils.test.ts features/resource-settings/catalog.test.ts` - passed.
  - Red before provider removal: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts` - failed because Region area resources still generated `provider "aws"` blocks and provider blocks still created/updated `aws_region` proposals.
  - Red before provider-only no-op guard: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - failed because provider-only Terraform input produced diagram resource delete proposals.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts` - passed after provider generation/sync removal.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/diagram-editor/diagram-utils.test.ts features/resource-settings/catalog.test.ts` - passed after provider removal.
  - `pnpm lint` - passed after provider removal and formatting.
  - `pnpm typecheck` - passed after provider removal and formatting.
  - `pnpm build` - passed after provider removal and formatting.
  - `git diff --check` - passed after provider removal and formatting.
  - `pnpm catalog:check` - failed because local root `node_modules` cannot resolve `@sketchcatch/types/resource-definitions` for `scripts/generate-terraform-aws-catalog.mjs`.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed after Region/AZ sync proposal typing.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
  - `pnpm harness:check` - passed after record updates.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - 커밋과 staging은 사용자 수동 커밋 요청에 따라 실행하지 않았다.
- Known risks:
  - 브라우저 수동 smoke와 Representative Use Journey 자동 smoke(`HARNESS-007`)는 아직 남아 있다.
  - `pnpm catalog:check`는 이번 변경과 별개로 root workspace package link가 없어 실패한다. shared definition/catalog drift는 focused web/API tests, lint, typecheck, build로 확인했다.
- Next best action:
  - 사용자가 수동 커밋한다.

### 2026-07-04 - docs/jh AWS 리소스 목록 작성

- Goal: 1순위와 2순위 AWS Terraform 리소스 후보를 `docs/jh`에 정리하고, 현재 SketchCatch 보유/미보유 리소스 목록을 분리한다.
- Completed:
  - `docs/jh/000_AWS리소스목록_JH.md`를 추가했다.
  - 문서 제목은 `aws 리소스 목록`으로 작성했다.
  - 1순위 90개, 2순위 22개 리소스를 Terraform resource/data source 이름 기준으로 정리했다.
  - `packages/types/src/resource-definitions.ts` 기준 현재 SketchCatch 보유 리소스 44개와 미보유 리소스 68개를 분리했다.
- Verification run:
  - `pnpm harness:check` - passed before edits.
  - 문서 count script - passed: status 보유 44개, 미보유 68개, target 합계 112개.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `docs/jh`는 `.gitignore` 대상이므로 커밋하려면 `git add -f docs/jh/000_AWS리소스목록_JH.md`가 필요하다.
- Known risks:
  - 이 문서는 구현 계획이 아니라 리소스 후보 목록이다. 실제 구현 시 각 리소스의 Terraform provider schema와 required parameter를 별도로 확인해야 한다.
- Next best action:
  - 1순위 미보유 리소스부터 service group 단위로 shared definition, catalog, parameter 입력 범위를 나눈다.

### 2026-07-04 - Main parameter 정책 문서화와 최종 검증

- Goal: Region/AZ, catalog Preview/Sync, main parameter-only UI 정책, HCL 정규화 책임을 최신 문서와 handoff에 맞추고 전체 검증을 완료한다.
- Completed:
  - `docs/data-models.md`에 현재 catalog 기준으로 아이콘은 생성되지만 Terraform Preview 또는 Terraform Sync 변환에서 제외되는 shared Terraform 리소스가 없음을 명시했다.
  - `docs/sw/001_테라폼변환구현가이드_sw.md`의 초기 클론 코딩 순서에서 diagnostics/sync가 후속 이슈라는 stale 문구를 현재 구현 기준으로 정리했다.
  - `docs/sw/003_테라폼동기화구조설명_sw.md`에 Sync parser의 허용 nested block 범위, shared definition 전체 Preview/Sync 대상 정책, create/delete/rename proposal 테스트 기준을 반영했다.
  - `session-handoff.md`의 stale `terraformSync` 별도 확장 문구와 다음 행동을 최신 상태로 갱신했다.
- Verification run:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/terraform-preview.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts src/routes/project-draft-schemas.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/drag-transaction.test.ts features/parameter-input/availability-zone-options.test.ts features/parameter-input/availability-zone-node-metadata.test.ts features/parameter-input/aws-region-options.test.ts features/parameter-input/region-node-metadata.test.ts features/parameter-input/parameter-panel-source.test.ts features/resource-settings/catalog.test.ts` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
  - `pnpm harness:check` - passed.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - 브라우저 수동 smoke와 Representative Use Journey 자동 smoke(`HARNESS-007`)는 아직 남아 있다.
- Next best action:
  - 사용자가 수동 커밋 후 필요하면 PR 본문 정리 또는 브라우저 smoke를 진행한다.

### 2026-07-04 - Terraform Sync와 diagnostics 호환 범위 확장

- Goal: 현재 Web catalog에서 생성 가능한 shared Terraform resource/data definition을 Terraform editor sync proposal 범위에도 포함하고, 새 nested-block main parameter HCL을 sync parser가 안전하게 읽게 한다.
- Completed:
  - shared `ResourceDefinition`의 `terraformSync` 기본값을 true로 바꿔, 현재 shared Terraform definition 전체가 Preview와 Sync capability를 함께 갖게 했다.
  - `aws_lambda_function`, `aws_security_group_rule`처럼 기존 preview-only였던 Terraform-only block도 create proposal 대상으로 받아들이게 했다.
  - 빈 Terraform editor 저장 시 `aws_security_group_rule` 같은 기존 preview-only Diagram resource도 delete proposal 대상으로 포함되게 했다.
  - Terraform sync parser가 top-level nested block 지원 여부를 snake_case Set 직접 조회 대신 `isTerraformNestedBlockAttribute` helper로 판정하게 했다.
  - 허용된 top-level nested block 내부의 하위 nested block은 camelCase 배열 값으로 보존하게 했다. 예: `root_block_device`, `rule.apply_server_side_encryption_by_default`.
  - `docs/data-models.md`에 현재 shared definition의 Preview/Sync 전체 지원 정책과 parser subset 경계를 기록했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - failed because 34 preview resources had `terraformSync: false`, Lambda/Security Group Rule proposals were rejected, and new snake_case nested blocks were rejected.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts src/services/terraform/terraform-diagnostics.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-preview.test.ts src/routes/terraform.test.ts && pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/parameter-input/parameter-panel-source.test.ts` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
  - `pnpm harness:check` - passed.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `pnpm build`가 `apps/web/next-env.d.ts`를 prod route type 경로로 바꿨지만, 생성물 변경이라 다시 tracked dev 경로로 원복했다.
- Known risks:
  - Terraform Sync parser는 provider schema 전체를 검증하지 않는다. shared definition 안의 block이라도 복잡한 expression, dynamic block, count/indexing 등은 deterministic subset 밖이면 diagnostic으로 막는다.
- Next best action:
  - main parameter 정책과 전체 변경 사항을 최종 정리하고 full verification을 한 번 더 수행한다.

### 2026-07-04 - Terraform Preview main parameter HCL 정규화

- Goal: Parameter panel에서 main parameter로 받은 짧은 입력과 catalog nested-block 값을 Terraform provider가 기대하는 HCL nested block 구조로 렌더링한다.
- Completed:
  - Terraform renderer가 `aws_s3_bucket_versioning.status`를 `versioning_configuration { status = ... }` block으로 정규화하게 했다.
  - Terraform renderer가 `aws_s3_bucket_server_side_encryption_configuration`의 `sseAlgorithm`/`kmsMasterKeyId`를 `rule.apply_server_side_encryption_by_default` block으로 정규화하게 했다.
  - Terraform renderer가 S3 Lifecycle rule의 `expirationDays`를 `expiration { days = ... }` block으로 정규화하게 했다.
  - shared Terraform nested block helper가 EC2 root block device, Auto Scaling Group launch template/tag, DynamoDB attribute, Lambda environment, API Gateway endpoint configuration, S3 nested blocks 등 catalog main nested-block 입력을 HCL block으로 인식하게 했다.
  - top-level nested block 값이 object 하나로 저장된 경우에도 단일 HCL nested block으로 렌더링하게 했다.
  - `docs/data-models.md`에 main parameter UI 정책과 Terraform renderer의 HCL 정규화 책임을 기록했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts` - failed because S3 compact fields and catalog nested-block values were rendered as plain attributes/lists.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/services/terraform/terraform-diagnostics.test.ts src/services/terraform/terraform-preview.test.ts src/routes/terraform.test.ts` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
  - `pnpm harness:check` - passed.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `terraformSync` capability 확장은 아직 다음 단계로 남아 있다.
  - 실제 provider schema validation은 editor static diagnostics 범위가 아니며, Deployment validation에서 별도로 다룬다.
- Next best action:
  - Terraform Sync/Diagnostics 지원 범위를 shared capability 기준으로 확장한다.

### 2026-07-04 - Terraform Preview AZ placement와 전체 catalog preview 지원

- Goal: AZ 디자인 노드를 Terraform Preview 입력으로 연결하고, 현재 Web catalog에서 생성할 수 있지만 `terraformPreview`가 꺼져 있던 Terraform resource/data 정의를 Preview 대상에 포함한다.
- Completed:
  - `DiagramNodeMetadata`에 `awsAvailabilityZone`을 추가하고 API Terraform/project draft Zod schema가 이 값을 보존하게 했다.
  - Web parameter panel에서 `design_az`/`sketchcatch_az` 선택 시 `awsAvailabilityZone`을 main parameter로 입력할 수 있게 했다.
  - `buildInfrastructureGraphFromDiagramJson`이 AZ ancestor를 찾아 `aws_subnet`, `aws_ebs_volume`처럼 AZ-aware 리소스의 `availabilityZone` config를 보강하게 했다. 리소스가 이미 `availabilityZone` 또는 `availability_zone`을 명시하면 덮어쓰지 않는다.
  - shared `ResourceDefinition`의 `terraformPreview` 기본값을 true로 바꿔, catalog에서 생성 가능한 44개 shared Terraform definition 모두 Preview projection 대상이 되게 했다.
  - `docs/data-models.md`에 AZ metadata와 전체 catalog Preview 지원 정책을 기록했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/routes/terraform.test.ts src/routes/project-draft-schemas.test.ts` - failed because `awsAvailabilityZone` was stripped, AZ metadata did not render `availability_zone`, and 34 shared definitions had `terraformPreview: false`.
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/parameter-input/availability-zone-options.test.ts features/parameter-input/availability-zone-node-metadata.test.ts` - failed because AZ helper modules did not exist.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/routes/terraform.test.ts src/routes/project-draft-schemas.test.ts && pnpm --filter @sketchcatch/web exec tsx --test features/parameter-input/availability-zone-options.test.ts features/parameter-input/availability-zone-node-metadata.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/terraform-preview.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts src/routes/project-draft-schemas.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/parameter-input/availability-zone-options.test.ts features/parameter-input/availability-zone-node-metadata.test.ts features/parameter-input/aws-region-options.test.ts features/parameter-input/region-node-metadata.test.ts features/parameter-input/parameter-panel-source.test.ts features/resource-settings/catalog.test.ts` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
  - `pnpm harness:check` - passed.
  - `pnpm catalog:check` - failed before Terraform schema work because local root `node_modules` has no `@sketchcatch/types/resource-definitions` workspace package link for the generator's CommonJS `require`.
- Evidence recorded:
  - 실제 Terraform CLI apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `pnpm build`가 `apps/web/next-env.d.ts`를 prod route type 경로로 바꿨지만, 생성물 변경이라 다시 tracked dev 경로로 원복했다.
- Known risks:
  - `terraformSync` capability는 아직 전체 catalog로 확장하지 않았다. Terraform editor proposal/diagnostics 호환성은 다음 단계에서 별도로 다룬다.
  - 새 Preview 지원 리소스 중 provider 필수 parameter가 비어 있으면 Preview HCL은 만들 수 있지만 실제 `terraform plan/apply`는 Deployment validation에서 막힐 수 있다.
- Next best action:
  - 리소스별 main parameter normalization과 Terraform editor sync/provider compatibility를 단계별로 확장한다.

### 2026-07-04 - Terraform Preview Region provider 생성

- Goal: Region 디자인 노드가 단순 화면 요소로만 남지 않고 Terraform Preview의 AWS provider region으로 렌더링되게 한다.
- Completed:
  - `terraform-preview.ts`가 `design_region`/`sketchcatch_region` 노드의 `metadata.awsRegion`을 읽어 `provider "aws"` block을 먼저 생성하게 했다.
  - Region 디자인 노드가 없으면 기본 provider region은 `ap-northeast-2`로 둔다.
  - 같은 region을 고른 Region 디자인 노드는 여러 개 허용하고, 서로 다른 region이 섞이면 `TerraformPreviewValidationError`를 던진다.
  - `/terraform/generate` route가 Region 충돌 preview validation error를 400 `bad_request`로 매핑하게 했다.
  - `docs/data-models.md`에 Region metadata의 Terraform Preview provider block 사용 계약을 기록했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts src/routes/terraform.test.ts` - failed because provider block was missing and conflicting Region nodes returned 200.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts src/routes/terraform.test.ts` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
  - `pnpm harness:check` - passed.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `pnpm build`가 `apps/web/next-env.d.ts`를 prod route type 경로로 바꿨지만, 생성물 변경이라 다시 tracked dev 경로로 원복했다.
- Known risks:
  - 멀티 리전 Terraform provider alias는 아직 지원하지 않는다. Preview v1은 단일 AWS provider region만 생성한다.
- Next best action:
  - 다음 단계에서 AZ placement metadata를 Terraform parameter 변환 흐름에 연결하고, 현재 icon catalog에서 생성되지만 Terraform Preview/Sync capability가 없는 리소스 목록을 확장한다.

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

- Goal: PR 브랜치가 `origin/dev`와 충돌해 병합 불가 상태가 된 `apps/api/src/app.ts`, `apps/api/src/routes/terraform.ts`, `apps/api/src/services/terraform/terraform-diagnostics.ts`를 정리한다.
- Root cause:
  - `origin/dev`에는 Terraform validate parser 진단을 위해 `terraform-validation.ts`와 route/app 주입 옵션이 추가되어 있었다.
  - 현재 브랜치는 이후 사용자 결정에 따라 editor CLI 검증을 폐기하고 `terraform-diagnostics.ts` static-only 검증으로 되돌렸다.
  - 두 변경이 같은 route/app/diagnostics 경계를 수정해 GitHub PR conflict가 발생했다.
- Completed:
  - `origin/dev`를 현재 feature branch에 merge하고 세 충돌 파일을 수동 해결했다.
  - `app.ts`와 `routes/terraform.ts`는 `validateTerraformPreviewCode` static-only 주입 경로를 유지했다.
  - `terraform-validation.ts`와 전용 테스트는 CLI 검증 폐기 정책에 맞춰 병합 결과에서 제거했다.
  - `dev` 쪽 정적 진단 강화 중 `unexpected_token`, `trailing_comma` 검사는 `terraform-diagnostics.ts`에 흡수했다.
- Verification run:
  - `pnpm harness:check` - passed before merge.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts` - passed.
- Evidence recorded:
  - 실제 Terraform CLI validate/fmt/init/plan/apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.

### 2026-07-04 - Terraform diagnostics 구조 오류 연쇄 표시 수정

- Goal: 닫히지 않은 문자열 따옴표나 `{}` 같은 구조 오류 하나 때문에 뒤쪽 Terraform resource까지 오류로 표시되는 diagnostics 연쇄 오류를 줄인다.
- Root cause:
  - `checkBalancedTokens`가 문자열이 열린 상태를 EOF까지 유지하면 뒤쪽 닫는 `}`를 문자열 내부로 보고 무시했다.
  - 그 결과 실제로는 닫힌 `{` stack이 남아, 따옴표 오류와 관계없는 중괄호 오류가 함께 생성됐다.
  - `{}` 균형이 이미 깨진 상태에서도 `checkBodySyntax`가 계속 실행되면, 다음 `resource` header를 이전 block 내부의 잘못된 body line처럼 해석해 파생 `attribute_syntax` 오류를 만들었다.
  - Completed:
    - 문자열 시작 line을 추적해 닫히지 않은 문자열 diagnostic에 line number를 붙였다.
    - 일반 quoted string은 줄을 넘지 않는 HCL 규칙에 맞춰, 줄 끝에서 문자열이 닫히지 않으면 그 줄을 즉시 오류로 확정하고 다음 줄 quote가 해당 문자열을 닫은 것처럼 처리하지 않게 했다.
    - 닫히지 않은 문자열 때문에 `{}` 중괄호 오류가 연쇄로 함께 뜨지 않도록 했다.
    - `{}`/`[]`/`()`/문자열 balance 단계에서 error가 나오면 body/reference/quoted-reference 검사를 실행하지 않아, 깨진 depth 기반 파생 오류가 다음 resource에 표시되지 않게 했다.
    - 구조 오류가 있어도 그보다 앞선 block header error는 함께 반환해 first blocking diagnostic이 뒤쪽 token error로 밀리지 않게 했다.
    - `/* ... */` block comment 내부의 quote, brace, reference를 실제 Terraform 코드처럼 검사하지 않게 했다.
    - line 20에서 누락된 quote가 다음 `resource` header인 line 24로 밀려 표시되는 회귀 케이스를 추가했다.
    - line 17에서 닫히지 않은 resource block 때문에 다음 `resource` header인 line 23에 body syntax 오류가 같이 뜨는 회귀 케이스를 추가했다.
    - 하위 AI 6개 축 감사에서 나온 cleanup 피드백을 반영해 Web의 숨겨진 Issues 복사본/unused CSS를 제거하고, source 없는 multi-file diagnostic이 특정 파일에 잘못 밑줄을 만들지 않게 했다.
    - Terraform nested block 지원 목록을 API Terraform service helper로 단일화했다.
    - `docs/data-models.md`, `docs/sw/001_테라폼변환구현가이드_sw.md`, `docs/sw/003_테라폼동기화구조설명_sw.md`의 stale 설명과 문서 찌꺼기를 정리했다.
    - virtual file validation에서도 `sourceFileName`과 원래 line number가 유지되는 회귀 테스트를 추가했다.
    - Web diagnostic line helper가 닫히지 않은 문자열 diagnostic을 해당 source line과 resource code 부분보기 offset에 맞게 표시하는 회귀 테스트를 추가했다.
  - Verification run:
    - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts` - failed because unclosed string produced extra `{` diagnostics.
    - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts` - failed because a missing quote on line 20 reported line 24.
    - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts` - failed because a missing `}` on line 17 also produced `terraform.attribute_syntax` on line 23.
    - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts` - failed because a later token error hid an earlier block header error.
    - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts` - failed because a source-less diagnostic highlighted the selected file line.
    - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts` - passed.
    - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts` - passed.
    - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts` - passed.
    - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts` - passed.
    - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/terraform-code-highlighting.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed.
    - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/terraform-code-highlighting.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/workspace-deployment-artifacts.test.ts` - passed.
    - `pnpm lint` - passed.
    - `pnpm typecheck` - passed.
    - `pnpm build` - passed.
    - `git diff --check` - passed.
    - `pnpm harness:check` - passed.
- Evidence recorded:
  - 실제 Terraform CLI, apply/destroy, cloud mutation은 실행하지 않았다.

### 2026-07-04 - Terraform editor CLI 검증 폐기와 정적 diagnostics 강화

- Goal: Terraform editor 검증에서 CLI 실행 경로를 제거하고, 기존 1차 정적 diagnostics를 저장 전 선행 검사로 강화한다.
- Completed:
  - `/terraform/validate/prepare` endpoint와 editor validation prepare/warmup 흐름을 제거했다.
  - `TerraformValidateRequest`/`TerraformValidateResponse`에서 `mode`, `stage`, `status`, `projectId`, prepare DTO를 제거하고 `diagnostics` 중심 static-only 계약으로 되돌렸다.
  - editor validation 전용 `terraform-validation.ts`와 테스트를 제거했다.
  - `runTerraformValidateJson` helper를 제거하고, Deployment 실행 경계에서 쓰는 기존 Terraform runner 함수는 유지했다.
  - Terraform code panel의 검증 progress bar와 prepare 상태를 제거하고, 기존 status bar/diagnostics/Issues 흐름으로 검증 결과를 보여주게 했다.
  - 정적 diagnostics가 `()`, 잘못된 attribute line, duplicate address error, nested block assignment, 선언되지 않은 local reference, shared definition 밖 AWS block, virtual file source metadata를 검사하게 했다.
  - `docs/data-models.md`, `docs/sw/001_테라폼변환구현가이드_sw.md`, `docs/sw/003_테라폼동기화구조설명_sw.md`를 static-only 기준으로 갱신했다.
- Verification run:
  - Red before fix: focused API/Web tests failed because CLI endpoint/mode/progress UI and missing static diagnostics were still present.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts src/deployments/terraform-runner.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/pre-deployment-diagnostics.test.ts` - passed.
  - `pnpm --filter @sketchcatch/types typecheck` - passed.
  - `git diff --check` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `pnpm harness:check` - passed.
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - editor validation은 Terraform CLI를 실행하지 않는 static-only 문자열 검사다.
  - `pnpm build`가 `apps/web/next-env.d.ts`를 prod route type 경로로 바꿨지만, 생성물 변경이라 다시 tracked dev 경로로 원복했다.
- Known risks:
  - 브라우저 수동 smoke는 아직 수행하지 않았다.
- Next best action:
  - Terraform editor에서 static diagnostics 빨간줄과 Issues 표시를 수동 smoke한다.

### 2026-07-03 - Terraform Preview 오케스트레이션 분리

- Goal: `diagram-to-terraform.ts`가 `DiagramJson`을 직접 알지 않게 하고, Terraform Preview 흐름을 `DiagramJson -> InfrastructureGraph -> Terraform` 책임으로 분리한다.
- Completed:
  - `apps/api/src/services/terraform/terraform-preview.ts`를 추가해 `generateTerraformFromDiagramJson` orchestration을 담당하게 했다.
  - `diagram-to-terraform.ts`에서 `DiagramJson` import, `buildInfrastructureGraphFromDiagramJson` import, `generateTerraformFromDiagramJson` export를 제거했다.
  - `/terraform/generate` route는 preview orchestration을 `terraform-preview.ts`에서 import하고, renderer validation error와 identifier pattern은 기존 renderer module에서 import하도록 분리했다.
  - 기존 `DiagramJson` 기반 preview 회귀 테스트를 `terraform-preview.test.ts`로 옮겼다.
  - `diagram-to-terraform.test.ts`는 `InfrastructureGraph` fixture를 직접 넣는 renderer 단위 테스트와 source regression test로 정리했다.
  - `docs/data-models.md`에 API 입력과 내부 변환 pipeline, `terraform-preview.ts`/`diagram-to-terraform.ts` 책임 차이를 기록했다.
- Verification run:
  - `pnpm harness:check` - passed before edits.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-preview.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/terraform.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api typecheck` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
  - `pnpm harness:check` - passed after harness record updates.
  - `pnpm test` - failed in unrelated deployment lock-file/path expectation tests:
    `deployment-apply-service.test.ts`, `deployment-destroy-plan-service.test.ts`,
    `deployment-destroy-service.test.ts`, `deployment-init-service.test.ts`,
    `terraform-lock-file-workspace.test.ts`.
- Evidence recorded:
  - Terraform 생성 API DTO와 응답 형태는 변경하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. API service/route tests, typecheck, lint, build로 책임 분리 범위를 확인했다.
  - 전체 `pnpm test`는 이번 변경 범위 밖 deployment lock-file/path expectation 실패 6건으로 통과하지 못했다. 이번 리팩토링이 수정한 Terraform Preview service/route focused tests는 통과했다.
- Next best action:
  - Terraform Preview 경로에 새 변환 단계를 추가할 때는 `terraform-preview.ts`에 orchestration을 모으고, `diagram-to-terraform.ts`는 `InfrastructureGraph` renderer로 유지한다.
  - 별도 작업에서 deployment lock-file path separator 기대값을 현재 runtime 동작과 맞춘다.

### 2026-07-03 - InfrastructureGraph 리소스 식별 기준 정리

- Goal: Terraform Preview 경로의 `InfrastructureGraphNode`가 내부 `ResourceType` 변환값에 의존하지 않고 provider-specific Terraform identity만 사용하도록 정리한다.
- Completed:
  - `InfrastructureGraphNode` shared type에서 `type: ResourceType` 필드를 제거했다.
  - `buildInfrastructureGraphFromDiagramJson`이 더 이상 `type: resourceDefinition.resourceType`를 graph node에 넣지 않게 했다.
  - `resourceDefinition`은 preview capability 확인과 `iac.provider` 채우는 용도로만 남겼다.
  - `iac.resourceType`에는 `aws_instance`, `aws_vpc`, `aws_s3_bucket` 같은 provider-specific Terraform resource type이 그대로 유지된다.
  - `ResourceType`, `ArchitectureJson`, `ResourceDefinition.resourceType`, AI/Architecture 변환 경로는 Terraform Preview identity와 다른 domain classification으로 유지했다.
  - `docs/data-models.md`에 Terraform Preview identity가 `iac.provider + iac.terraformBlockType + iac.resourceType + iac.resourceName` 기준임을 기록했다.
  - 하위 AI 6개 축 코드리뷰를 실행했고, block type을 무시하던 unused `getResourceDefinitionByTerraformResourceType` helper 제거, `aws_security_group_rule` preview-only/sync-unsupported 테스트 보강, web catalog drift 테스트의 `aws_` prefix 의존 제거, identity 문서 표현 정리를 반영했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts` - failed because graph nodes still contained `type: "VPC"`/`type: "EC2"` and source still used `resourceDefinition.resourceType`.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed after review fixes.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts` - passed after review fixes.
  - `pnpm --filter @sketchcatch/types typecheck` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm lint` - passed.
  - `pnpm build` - passed.
  - `pnpm harness:check` - passed.
  - `git diff --check` - passed.
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - Terraform 생성 output은 기존 `node.iac.resourceType` 기반 renderer를 유지해 VPC/EC2/S3 preview 생성 경로를 보존했다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 타입/단위/빌드 검증으로 Terraform Preview 계약 변경을 확인했다.
- Next best action:
  - 새 Terraform Preview 정책을 추가할 때는 `InfrastructureGraphNode.type`를 되살리지 말고 `iac` identity와 capability를 기준으로 판단한다.

### 2026-07-03 - 공통 ResourceDefinition 기반 Terraform 지원 목록 정리

- Goal: API/Web에 흩어진 Terraform 지원 목록(`PREVIEW_SUPPORTED_BLOCKS`, `PROPOSAL_SUPPORTED_BLOCKS`, Terraform type 매핑)을 `packages/types`의 공통 `ResourceDefinition` capability로 단일 출처화한다.
- Completed:
  - `packages/types/src/resource-definitions.ts`를 추가해 44개 AWS Terraform catalog 항목의 provider, domain `ResourceType`, Terraform block identity, `terraformPreview`/`terraformSync`/`parameterPanel` capability를 정의했다.
  - `@sketchcatch/types/resource-definitions` package subpath를 열어 API/Web이 같은 shared definition을 import하게 했다. root `index.ts` 재수출은 Next/Turbopack source resolve 문제를 피하기 위해 사용하지 않는다.
  - `infrastructure-graph.ts`의 preview hardcoded set과 Terraform type 매핑을 제거하고 shared `terraformPreview` capability와 provider를 사용하게 했다.
  - `terraform-to-diagram.ts`의 sync proposal hardcoded set을 제거하고 `terraformSync` capability를 사용하게 했다.
  - web `resource-settings/catalog.ts`를 shared definition + web presentation(icon/category/label/size) 구조로 정리했다. `design_region`, `design_az`, `design_group`은 IaC 리소스가 아니므로 web catalog에만 남겼다.
  - API/Web drift 방지 테스트를 추가해 preview/sync capability 차이, CloudFront sync-only 정책, web catalog와 shared definition/parameter catalog 정합성을 확인하게 했다.
  - `docs/data-models.md`에 새 Terraform 리소스 추가 절차와 API가 web catalog를 import하지 않는 경계를 문서화했다.
- Verification run:
  - `pnpm --filter @sketchcatch/types typecheck` - passed.
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed after replacing root re-export with package subpath export.
  - `pnpm harness:check` - passed.
  - `git diff --check` - passed.
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `packages/types/package.json`은 dependency 변경이 아니라 subpath export 추가만 포함하므로 lockfile 변경은 발생하지 않았다.
  - `apps/web/next-env.d.ts`는 `pnpm build` 중 생성 흔적으로 변경됐으나 이번 작업 범위가 아니라 원래 tracked 상태로 되돌렸다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - `parameterPanel` capability는 현재 parameter catalog 보유 여부와 맞췄다. 새 리소스 추가 시 shared definition, web presentation, parameter catalog 정합성 테스트를 함께 갱신해야 한다.
- Next best action:
  - 다음 리소스 추가 작업에서는 shared definition/capability, web presentation, 필요 시 parameter catalog/`parameterPanel`, `ResourceType` 확장 여부, drift 테스트를 함께 맞춘다.

### 2026-07-03 - Terraform 코드리뷰 피드백 반영

- Goal: 리뷰에서 지적된 Terraform Preview/Editor 구현의 레이어 경계, 불필요한 계산, 중복 유틸, dead code를 실제 코드 기준으로 검토하고 타당한 항목을 수정한다.
- Completed:
  - `diagram-to-terraform.ts` 서비스에서 HTTP 속성(`statusCode`, `errorCode`)을 붙여 던지던 에러를 `TerraformDiagramValidationError` 도메인 에러로 교체했다.
  - `/terraform/generate` 라우터가 `TerraformDiagramValidationError`를 400 `bad_request` API 응답으로 매핑하도록 역할을 분리했다.
  - Terraform virtual file validation이 파일별 API 호출을 `Promise.all`로 동시에 터뜨리지 않고 순차 실행하도록 바꿨다. 배치 검증 API 신설은 별도 계약 변경이라 이번 범위에서는 보류했다.
  - 리소스 삭제 반영 후 남은 Terraform 코드 여부를 `combineTerraformFiles(nextFiles)` 문자열 병합 대신 `nextFiles.some(...)`으로 확인하게 했다.
  - 중복된 `cloneParameterValue`를 `apps/web/features/diagram-editor/parameter-value-utils.ts` 공통 helper로 분리해 diagram/workspace 양쪽에서 재사용하게 했다.
  - wavy underline 렌더링 이후 사용하지 않던 diagnostic line의 `lineHeight`, `scrollTop`, `verticalPadding`, `style.top` 계산을 제거하고 line number 목록만 반환하도록 단순화했다.
  - 관련 regression/source tests를 갱신해 HTTP 경계, 순차 검증, line number helper, dead code 제거를 확인하게 했다.
- Verification run:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/routes/terraform.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/terraform-sync-proposals.test.ts features/diagram-editor/diagram-utils.test.ts` - passed.
  - `pnpm --filter @sketchcatch/api typecheck` - passed.
  - `pnpm --filter @sketchcatch/web typecheck` - passed.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `pnpm harness:check` - passed.
  - `git diff --check` - passed.
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
  - `apps/web/next-env.d.ts`는 `pnpm build` 중 생성 흔적으로 변경됐으나 이번 작업 범위가 아니라 원래 tracked 상태로 되돌렸다.
- Known risks:
  - 배치 Terraform validation API는 아직 없다. 이번에는 기존 API 계약을 유지하며 동시 요청 burst만 줄였다.
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - 로컬 브랜치는 upstream보다 1 commit behind 상태다. upstream에는 `docs/jh` 추적 해제 관련 삭제 commit이 하나 있다.
- Next best action:
  - PR 정리 전 upstream을 반영하고, tracked 상태로 남아 있는 `docs/jh` 파일을 ignore 정책에 맞게 제거한다.

### 2026-07-03 - Terraform Issues 탭 접근성과 저장 모달 메시지 정리

- Goal: Terraform diagnostics가 떠 있는 상태에서는 Issues 탭을 바로 열 수 있게 하고, `저장하고 나가기` 클릭 직후 곧 사라질 저장 중 문구가 사용자 시선을 끌지 않게 한다.
- Root cause:
  - document-level Terraform leave guard가 Terraform editor 영역 밖의 Issues 탭 클릭을 먼저 가로채 저장 확인 모달을 띄웠다.
  - `createTerraformLeaveSaveStartFeedback()`가 `Terraform 변경사항을 저장하는 중입니다.` 메시지를 채워, 저장 성공 또는 diagnostics reveal로 모달이 곧 닫히는 흐름에서도 짧은 status 문구가 렌더링됐다.
- Completed:
  - diagnostics가 1개 이상 있을 때 Issues 탭/shortcut 버튼에는 `data-terraform-issues-navigation` 예외를 적용해 dirty Terraform 상태에서도 바로 열리게 했다.
  - `requestView("issues")`와 collapsed Issues shortcut도 diagnostics가 있으면 leave guard 없이 Issues 탭을 열게 했다.
  - 저장 시작 feedback 메시지를 빈 문자열로 바꿔 모달에는 순간적인 저장 중 status 문구가 뜨지 않고, 버튼의 `저장 중` disabled 상태만 남게 했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - failed because saving feedback still had a message and Issues navigation had no leave guard exception.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web test` - passed, 312 tests.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `git diff --check` - passed.
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 Terraform diagnostics가 있는 상태로 Issues 탭을 클릭했을 때 저장 확인 모달 없이 Issues 탭이 열리는지 smoke한다.

### 2026-07-03 - Terraform leave save 실패 모달 UX 수정

- Goal: Terraform 변경사항 모달에서 `저장하고 나가기`가 validation diagnostics 때문에 실패했을 때, 모달이 계속 패널을 가려 사용자가 오류를 확인하지 못하는 UX를 수정한다.
- Root cause:
  - `resolveTerraformLeaveSaveCompletion(false)`가 저장 실패 원인을 구분하지 않고 항상 모달을 열린 상태로 유지했다.
  - 부모 패널은 Terraform editor가 방금 전달한 diagnostics를 즉시 참조하지 않아, 실패가 패널에서 확인 가능한 오류인지 판단하는 상태가 없었다.
- Completed:
  - 저장 실패가 Terraform error diagnostics로 설명되는 경우 `TerraformLeaveSaveFeedback`이 모달 유지 대신 Terraform 패널 노출을 지시하도록 상태 모델을 확장했다.
  - `WorkspaceRightPanel`이 최신 Terraform diagnostics를 ref로 보관해 external save 완료 콜백에서 React state 반영 타이밍과 무관하게 blocking error를 판단하게 했다.
  - diagnostics 때문에 저장이 막힌 경우 pending 이동/닫기 action을 취소하고, 오른쪽 패널을 열어 Terraform 탭을 보여준 뒤 leave dialog를 닫게 했다.
  - diagnostics가 없는 저장 실패는 기존처럼 모달 안에 실패 메시지를 남기게 했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts` - failed because leave save feedback had no `shouldRevealTerraformPanel` path.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed.
  - `pnpm --filter @sketchcatch/web typecheck` - passed.
  - `pnpm --filter @sketchcatch/web test` - passed, 311 tests.
  - `pnpm lint` - passed.
  - `pnpm typecheck` - passed.
  - `pnpm build` - passed.
  - `pnpm harness:check` - passed.
  - `git diff --check` - passed.
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 Terraform syntax error를 만든 뒤 `저장하고 나가기`를 눌렀을 때 모달이 닫히고 Terraform 탭의 물결 오류 표시가 바로 보이는지 smoke한다.

### 2026-07-03 - Terraform 에디터 syntax color와 물결 오류 표시

- Goal: Terraform 코드 에디터를 VS Code처럼 syntax color가 있는 편집면으로 만들고, validation error를 직선 marker가 아니라 빨간 물결 밑줄로 표시한다.
- Completed:
  - Terraform HCL tokenizing helper를 추가해 `resource`, identifier/reference, string, brace, operator, comment를 색상별 token으로 나눴다.
  - 기존 `textarea` 앞에 read-only syntax highlight layer를 깔고 textarea 글자는 투명 처리해 입력 가능성과 색상 표시를 동시에 유지했다.
  - diagnostic error line은 highlight layer의 해당 line에 `text-decoration-style: wavy` 물결 밑줄을 적용하게 변경했다.
  - 기존 2px 직선 red line marker 렌더링을 제거하고, line number error 강조는 유지했다.
  - Playwright로 `/workspace` Terraform 탭에 샘플 HCL을 입력해 syntax color를 확인했고, `/api/terraform/validate` mock 응답으로 line 2 물결 밑줄 표시를 확인했다.
- Verification run:
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-code-highlighting.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/pre-deployment-diagnostics.test.ts` - passed
  - `pnpm --filter @sketchcatch/web test` - passed, 309 tests
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - Playwright에서는 validation API만 mock했고 backend/Terraform CLI는 실행하지 않았다.
- Known risks:
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 실제 API 서버까지 연결된 상태에서 Terraform validation error가 같은 물결 밑줄로 표시되는지 한 번 더 smoke한다.

### 2026-07-03 - 하위 AI 6개 축 검증 및 회귀 수정

- Goal: 최근 Terraform Preview/Diagram 동기화 보강 작업을 하위 AI 6개 축으로 다시 검증하고, 실제 문제가 확인된 부분을 수정한다.
- Completed:
  - 하위 AI 6개가 catalog/diagram, Terraform sync/proposal, AI draft layout, CSS/resize, backend API/generator, docs/contracts를 read-only로 나눠 검증했다.
  - 일반 resource node가 `56x56`이어도 `.nodeShell`의 기존 `min-height: 72px` 때문에 빈 박스가 커지는 문제를 `.nodeShellResource`에서 해소했다.
  - Terraform create proposal fallback과 AI draft fallback unknown resource 크기를 `56x56`으로 맞추고 회귀 테스트를 추가했다.
  - AI draft area fit이 오른쪽/아래쪽으로만 커져 왼쪽/위쪽 자식이 부모 밖으로 나갈 수 있던 문제를 position+size 동시 보정으로 수정했다.
  - `vpcId: "aws_vpc.main.id"`, `subnetId: "aws_subnet.public.id"` 같은 Terraform reference 문자열도 `(resourceType, resourceName)`으로 찾아 부모 영역 metadata에 반영하게 했다.
  - Design area icon contract 테스트를 현재 catalog 동작에 맞췄고, 사용하지 않는 `DEFAULT_PALETTE_ITEMS` fallback drift 지점을 제거했다.
  - Terraform HCL injection을 막기 위해 `resourceType`, `resourceName`, top-level/nested attribute/block key를 identifier 형식으로 검증하도록 API schema와 generator 양쪽을 보강했다.
  - `docs/data-models.md`에 Terraform identifier 검증 계약을 추가했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - failed because Terraform-style references did not resolve to area parent nodes
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - passed
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/routes/terraform.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/diagram-editor/area-nodes.test.ts features/diagram-editor/diagram-editor-layout.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/resource-settings/catalog-provider.test.ts features/diagram-editor/diagram-utils.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/node-resize.test.ts features/diagram-editor/flow-mappers.test.ts features/diagram-editor/node-style.test.ts features/diagram-editor/drag-transaction.test.ts features/diagram-editor/reference-drop-targets.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/pre-deployment-diagnostics.test.ts` - passed
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/infrastructure-graph.test.ts` - passed
  - `pnpm catalog:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed after strict parser index guard fix
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - 하위 AI가 deployment apply/destroy 테스트의 macOS path suffix 취약 가능성을 보고했지만, 이번 Diagram/Terraform preview 회귀 수정 범위 밖이라 고치지 않았다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 compact icon, Terraform reference 기반 AI draft containment, Terraform editor 저장/삭제 sync를 수동 smoke한다.

### 2026-07-03 - 기본 리소스 아이콘 크기 절반 축소

- Goal: 새로 생성되는 일반 리소스 아이콘이 너무 크게 보이지 않도록 기본 크기를 현재의 절반으로 줄인다.
- Root cause:
  - 일반 리소스 catalog 기본 크기가 `112x112`였고, Terraform proposal/AI draft 생성 경로도 이 catalog 크기를 그대로 사용했다.
  - CSS icon frame과 resize 최소값도 큰 icon 기준으로 맞춰져 있어 단순 size 변경만으로는 작은 기본 크기와 충돌할 수 있었다.
- Completed:
  - 일반 리소스 icon node catalog 기본 크기를 `56x56`으로 줄였다.
  - legacy palette fallback, Terraform create proposal fallback, AI draft fallback 크기도 같은 비율로 줄였다.
  - 일반 resource resize 최소값을 `56x56`으로 낮춰 새 기본 크기 상태를 유지할 수 있게 했다.
  - CSS icon frame 최소 크기를 줄여 `56x56` node 안에서 icon과 label이 밀리지 않게 했다.
  - VPC/Subnet/Region 같은 영역 node는 기존 영역 크기를 유지하고, AI draft area fit은 작은 icon을 배치할 때 기존 112px footprint를 최소 배치 기준으로 사용하게 했다.
  - `docs/data-models.md`에 신규 일반 리소스 icon node 기본 크기와 영역 node 예외를 기록했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/workspace/terraform-sync-proposals.test.ts` - failed because catalog and generated nodes still used `112x112`
  - `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/workspace/terraform-sync-proposals.test.ts features/diagram-editor/node-resize-bounds.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/resource-settings/catalog-provider.test.ts features/diagram-editor/diagram-utils.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/node-resize.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-panel-utils.test.ts` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 EC2/S3/CloudFront 같은 일반 resource icon을 새로 추가해 `56x56` 크기로 보이고, VPC/Subnet 같은 영역 node는 기존 크기를 유지하는지 수동 smoke한다.

### 2026-07-03 - 중복 리소스 아이콘 Terraform 이름 suffix 수정

- Goal: 같은 리소스 아이콘을 여러 번 추가해도 Terraform Preview의 resource block 이름이 중복되지 않게 한다.
- Root cause:
  - 수동 리소스 아이콘 생성 경로가 현재 다이어그램 node 목록을 보지 않고 catalog label에서 만든 기본 `resourceName`만 사용했다.
  - 그래서 EC2 Instance를 반복 추가하면 `aws_instance.ec2_instance`가 계속 생성되어 Terraform address가 중복될 수 있었다.
- Completed:
  - `createDiagramNodeFromPayload`가 현재 node 목록을 받아 같은 `resourceType` 안의 기존 `resourceName`을 확인하게 했다.
  - 새 수동 리소스 아이콘의 `resourceName`이 중복되면 `ec2_instance_2`, `ec2_instance_3`처럼 숫자 suffix를 붙이게 했다.
  - 다이어그램 drop 경로에서 현재 node 목록을 전달하도록 연결했다.
  - `docs/data-models.md`에 수동 리소스 아이콘의 Terraform identity 중복 회피 계약을 기록했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts` - failed because duplicate EC2 icon creation returned `ec2_instance` instead of `ec2_instance_3`
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/drag-transaction.test.ts features/diagram-editor/reference-drop-targets.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 EC2/VPC/S3 아이콘을 반복 추가했을 때 Terraform Preview resource name이 순차 suffix로 생성되는지 수동 smoke한다.

### 2026-07-03 - 리소스 아이콘 생성 시 파라미터 자동 채움 제거

- Goal: EC2 Instance를 포함한 모든 리소스 아이콘 추가 시 `instanceType`, `cidrBlock`, `tags.Name` 같은 Terraform parameter 값이 자동으로 채워지지 않게 한다.
- Completed:
  - `createDiagramNodeFromPayload`가 수동 리소스 아이콘 생성 시 Terraform identity metadata만 만들고 `parameters.values`는 `{}`로 시작하게 했다.
  - VPC/Subnet/Security Group/EC2/S3 등에 들어가던 Terraform Preview skeleton default helper를 제거했다.
  - AI Architecture Draft 변환은 AI가 명시한 `config` 값만 `parameters.values`에 유지하도록 테스트 기대값을 조정했다.
  - `docs/data-models.md`에 수동 리소스 아이콘 생성은 parameter values를 자동 채우지 않는다는 계약을 기록했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts` - failed because VPC default values were still auto-filled
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/diagram-editor/reference-drop-targets.test.ts features/diagram-editor/drag-transaction.test.ts features/workspace/terraform-panel-utils.test.ts features/parameter-input/validation.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 EC2/VPC/S3 아이콘을 추가했을 때 우측 파라미터 값이 비어 있고, AI draft나 Terraform editor에서 명시한 값은 유지되는지 수동 smoke한다.

### 2026-07-03 - 빈 Terraform 코드 저장 동기화 수정

- Goal: 리소스 아이콘 삭제 후 Terraform 코드를 전부 지운 상태에서도 저장이 성공하고 Diagram/Terraform 동기화가 깨지지 않게 한다.
- Root cause:
  - Frontend `saveCodeToDiagram`이 `!hasTerraformCode`일 때 즉시 `false`를 반환해 빈 Terraform 저장을 막았다.
  - API `syncTerraformToDiagramJson`도 공백 Terraform 입력을 `terraform.sync.empty` 오류로 처리해, 사용자의 전체 삭제 의도를 delete proposal로 만들지 못했다.
- Completed:
  - Terraform editor 저장은 빈 Terraform 코드도 `syncTerraformCodeToDiagram`까지 보내도록 변경했다.
  - Terraform sync API는 `terraformCode`와 모든 `terraformFiles[].terraformCode`가 공백이면 지원 범위 안의 Diagram-only resource를 `delete_candidate`로 반환하게 했다.
  - Diagram도 이미 비어 있으면 빈 Terraform sync를 diagnostics 없이 성공 처리하게 했다.
  - `docs/data-models.md`에 빈 Terraform 저장 sync action의 삭제 의도 계약을 추가했다.
  - API/Web 회귀 테스트를 red-green으로 추가했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - failed on `terraform.sync.empty`
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - failed because `saveCodeToDiagram` still matched `!hasTerraformCode`
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-panel-utils.test.ts` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 리소스 아이콘 삭제 후 Terraform editor가 빈 코드 상태일 때 저장/나가기 저장이 성공하는지 수동 smoke한다.

### 2026-07-03 - Diagram 삭제 시 Terraform Preview 동기화

- Goal: 다이어그램 아이콘을 삭제하면 해당 Terraform 코드도 함께 삭제되어 Diagram과 Terraform Preview가 계속 동기화되게 한다.
- Completed:
  - `TerraformCodePanel`의 자동 Preview 갱신에서 `context.nodes.length === 0` 차단 조건을 제거해 마지막 아이콘 삭제도 빈 Terraform Preview로 반영되게 했다.
  - Terraform editor에 로컬 편집이 남아 있는 상태에서도 다이어그램에서 삭제된 리소스 주소에 해당하는 Terraform `resource`/`data` block만 제거하는 부분 동기화를 추가했다.
  - 삭제 동기화로 Terraform 코드가 완전히 비면 dirty 상태를 해제해 저장할 수 없는 빈 변경 상태가 남지 않게 했다.
  - 빈 다이어그램 Preview, Diagram node의 Terraform address 추출, 주소 기반 block 제거, 마지막 아이콘 삭제 refresh 조건을 회귀 테스트로 고정했다.
- Verification run:
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform CLI 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 VPC/S3/EC2 아이콘을 추가한 뒤 Terraform Preview가 생성되는지, 아이콘을 삭제하면 해당 block이 사라지는지 수동 smoke한다.

### 2026-07-03 - Terraform 변경 제안 확인 UI 제거

- Goal: Terraform editor 저장 시 나오는 `Terraform 변경 제안` 확인 패널이 불편하므로 제거한다.
- Completed:
  - Terraform sync API가 반환한 create/delete/rename proposals를 Terraform editor의 명시적 저장 또는 배포 준비 action 안에서 자동 반영하게 했다.
  - `TerraformCodePanel`의 `pendingTerraformSync` 상태, 선택 반영/무시 버튼, proposal 목록 UI를 제거했다.
  - proposal panel 전용 CSS를 제거했다.
  - leave dialog 저장 실패 문구에서 더 이상 존재하지 않는 "변경 제안 확인" 안내를 제거했다.
  - `applyAllTerraformSyncProposals` helper와 회귀 테스트를 추가했다.
  - `docs/data-models.md`에 Terraform editor 저장/배포 준비 action을 사용자 승인 경계로 삼아 proposals를 자동 반영할 수 있다고 기록했다.
- Verification run:
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-leave-save-state.test.ts` - passed
  - `pnpm typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 Terraform 코드 저장 시 create/delete/rename이 별도 확인 UI 없이 바로 DiagramJson에 반영되는지 수동 smoke한다.

### 2026-07-03 - Terraform Preview 아이콘/진단/동기화 회귀 보강

- Goal: 하위 AI 6개 축으로 Terraform Preview/동기화 구현을 재검증하고, 실제 사용자 증상과 연결되는 문제를 수정한다.
- Completed:
  - 하위 AI 6개 축으로 API sync/parser, frontend proposal 적용, Terraform editor UX, resource catalog/icon, deployment boundary, docs/contracts를 read-only 검증했다.
  - CloudFront AI draft와 Terraform proposal이 catalog icon/size를 찾을 수 있도록 `aws_cloudfront_distribution` resource catalog와 parameter override/generated catalog를 추가했다.
  - 기본 Palette가 오래된 `DEFAULT_PALETTE_ITEMS` 대신 `resourceCatalog`를 사용하게 하고, design area node도 catalog icon을 유지하게 했다.
  - `TerraformDiagnostic.sourceFileName` 계약을 추가하고 API multi-file sync diagnostics, duplicate block diagnostics, unsupported resource diagnostics에 source file metadata를 채웠다.
  - Terraform editor validation을 file별로 실행해 diagnostic line이 현재 파일 기준으로 표시되게 했고, resource-code 부분보기에서는 원본 파일 줄 번호를 부분 코드 줄 번호로 보정했다.
  - 사용자가 Terraform 코드를 수정하면 stale diagnostics와 Issues 상태를 즉시 비우고, 오래된 async validation/save 응답이 새 코드에 다시 칠해지지 않도록 code version guard를 추가했다.
  - proposal이 있어도 같은 identity의 안전한 `parameters.values` 변경은 먼저 DiagramJson에 반영하고, create/delete/rename 구조 변경만 사용자 승인 대기로 남기게 했다.
  - rename proposal 승인 시 이동된 source file metadata를 node `parameters.fileName`에 보존하게 했다.
  - create proposal 적용 시 catalog size와 proposal parameter values를 deep clone해 참조 공유를 제거했다.
  - Route Table/Internet Gateway/CloudFront 등 sync 가능한 네트워크 리소스의 create/delete proposal 범위를 보강해 diagram-only 삭제가 조용히 성공 처리되지 않게 했다.
  - Resource card Duplicate가 같은 Terraform identity를 반복 생성하지 않도록 resourceName suffix를 유니크하게 만들고 auto-generated `tags.Name`을 함께 동기화했다.
  - `docs/data-models.md`의 diagnostic/proposal 계약과 proposal 지원 범위를 현재 구현에 맞게 갱신했다.
- Verification run:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/infrastructure-graph.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/diagram-editor/diagram-utils.test.ts features/resource-settings/catalog.test.ts features/workspace/pre-deployment-diagnostics.test.ts features/parameter-input/validation.test.ts` - passed
  - `pnpm catalog:generate` - passed
  - `pnpm catalog:check` - passed after one transient Terraform AWS provider schema handshake retry
  - `pnpm typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm build` - passed
  - `pnpm harness:check` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform 실행 또는 AWS SDK 호출을 추가하지 않았다.
  - 하위 AI 검증 중 deployment safety preflight mismatch와 DeploymentPanel stale PENDING state는 확인했지만 이번 아이콘/preview/editor 회귀 보강 범위 밖이라 별도 후속 후보로 남겼다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 CloudFront AI draft, Terraform-only create proposal, multi-file validation error, proposal pending 상태의 same-identity value update를 수동 smoke한다.
  - 별도 작업으로 pre-deployment artifact path가 backend artifact safety checks를 미리 반영하는지 검토한다.

### 2026-07-03 - Terraform 생성 리소스 아이콘 누락 수정

- Goal: Terraform 코드에서 생성/승인된 리소스가 아이콘이 있음에도 다이어그램에서 빈 박스와 `AWS` fallback으로 보이는 문제를 수정한다.
- Root cause:
  - Terraform-only `create_candidate` proposal을 승인해 새 DiagramJson node를 만들 때 `iconUrl`과 catalog 기반 `size`를 채우지 않았다.
  - `DiagramNodeView`는 `node.iconUrl`이 없으면 `AWS` fallback을 렌더링하므로, 실제 catalog icon이 있어도 Terraform 생성 노드에서는 보이지 않았다.
- Completed:
  - `applyTerraformSyncProposals`의 create proposal 적용 경로가 `resourceCatalog`에서 `resourceType + terraformBlockType`에 맞는 resource/data item을 찾게 했다.
  - 새로 만든 Terraform 생성 node에 catalog `iconUrl`과 `nodeDefaults.size`를 적용하게 했다.
  - catalog에 없는 미래 리소스는 기존 fallback size를 유지하도록 했다.
  - `aws_s3_bucket` resource와 `data.aws_ami` data source create proposal에 icon/size가 적용되는 테스트를 추가했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts` - failed because created S3 node `iconUrl` was `undefined`.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/resource-settings/catalog.test.ts features/resource-settings/catalog-provider.test.ts features/diagram-editor/diagram-utils.test.ts` - passed
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm harness:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - API/shared DTO 계약은 변경하지 않았다. proposal 승인 후 frontend node 생성 metadata만 보강했다.
  - 실제 Terraform CLI 실행, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 Terraform editor로 `aws_s3_bucket` 또는 `data.aws_ami` create proposal을 만들고 승인했을 때 실제 아이콘이 보이는지 수동 smoke한다.

### 2026-07-03 - Terraform 검증 오류 줄 표시

- Goal: Terraform 검증에서 오류가 난 줄을 editor 안에서 빨간줄로 표시한다.
- Completed:
  - `TerraformDiagnostic.line`과 `severity: "error"`를 기준으로 editor 줄 위치를 계산하는 `terraform-diagnostic-line-highlights` helper를 추가했다.
  - Terraform editor에 diagnostic underline overlay를 추가해 오류 줄 하단에 얇은 빨간줄을 표시하게 했다.
  - 같은 오류 줄 번호도 빨간색으로 강조해 실제 오류 위치를 더 빨리 찾을 수 있게 했다.
  - warning/info 또는 line이 없는 diagnostic은 빨간줄 대상에서 제외했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts` - failed because helper/CSS/render wiring did not exist.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-leave-save-state.test.ts` - passed
  - `pnpm harness:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - API/shared DTO 계약은 변경하지 않았다. 기존 `TerraformDiagnostic.line`만 UI에서 사용한다.
  - 실제 Terraform CLI 실행, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 잘못된 Terraform 코드를 입력해 검증 오류가 난 줄에 빨간 underline과 빨간 줄 번호가 보이는지 수동 smoke한다.

### 2026-07-03 - Terraform leave dialog 저장 실패 피드백 수정

- Goal: Terraform 변경사항이 있는 상태에서 나가기 다이얼로그의 `저장하고 나가기`를 눌러도 검증 오류나 proposal 대기 때문에 저장이 실패하면 아무 반응이 없어 보이는 버그를 코드리뷰와 시나리오 테스트로 잡는다.
- Completed:
  - `TerraformCodePanel`의 external save가 `false`를 반환하는 경로가 부모 다이얼로그에서 조용히 무시되는 문제를 확인했다.
  - `terraform-leave-save-state` 상태 모델을 추가해 저장 시작, 저장 성공, 저장 차단 상태를 테스트 가능한 순수 함수로 분리했다.
  - `WorkspaceRightPanel`이 저장 실패 시 다이얼로그를 닫지 않고 "Terraform 패널의 오류나 변경 제안 확인" 안내를 표시하게 했다.
  - 저장 중에는 다이얼로그 버튼을 잠가 중복 저장이나 저장 완료 후 의도치 않은 pending action 실행 가능성을 줄였다.
  - `TerraformLeaveDialog`에 `status`/`alert` 피드백 영역을 추가했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - failed because the save feedback module/state did not exist.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/deployment-actions.test.ts` - passed
  - `pnpm harness:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 저장 성공은 pending leave action을 실행하고 다이얼로그를 닫는다.
  - 저장 실패, 검증 오류, proposal 대기, 이미 loading 중인 저장 차단은 다이얼로그를 유지하고 사용자에게 다음 행동을 보여준다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 Terraform editor에 구조 변경 Terraform을 입력한 뒤 proposal 발생 상태에서 `저장하고 나가기`, `계속 편집하기`, `저장하지 않고 나가기`를 수동 smoke한다.

### 2026-07-03 - InfrastructureGraph Workspace 동기화 v1 구현

- Goal: `docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md` 기준으로 InfrastructureGraph 중심 Workspace 동기화 v1 기능을 구현하고 하위 AI 리뷰와 테스트로 검증한다.
- Completed:
  - Terraform block identity, multi-file sync input, create/delete/rename proposal shared type을 추가했다.
  - `DiagramJson -> InfrastructureGraph -> Terraform` Preview 경로를 API service에 연결했다.
  - Preview renderer가 invalid resource node를 유지하고 VPC/EC2/S3 계열 반복 생성 테스트를 통과하게 했다.
  - `data.aws_ami.filter` nested block 구조를 renderer/parser/catalog에서 `values.filter: [{ name, values }]`로 맞췄다.
  - Advanced Parameters UI를 제거하고 기존 optional 또는 catalog 밖 values 보존 정책을 테스트로 고정했다.
  - Terraform editor 역동기화에서 Terraform-only, Diagram-only, 명확한 rename을 proposal로 반환하게 했다.
  - rename proposal은 normalized values 기준으로 정확히 한 쌍일 때만 생성되도록 ambiguity를 제거했다.
  - Frontend Terraform panel은 proposal이 있으면 자동 apply하지 않고, 사용자가 체크한 proposal만 반영한다.
  - partial proposal approval 후 남은 proposal이 있으면 dirty/pending 상태를 유지하게 했다.
  - 하위 AI 리뷰에서 나온 blocking 피드백을 반영하고, ignored JH 문서 008/009를 강제 add로 커밋했다.
- Verification run:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-identity.test.ts src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts features/parameter-input/validation.test.ts features/parameter-input/parameter-panel-source.test.ts features/diagram-editor/diagram-utils.test.ts` - passed
  - `pnpm catalog:check` - passed
  - `pnpm harness:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform 실행 또는 AWS SDK 호출을 추가하지 않았다.
  - `docs/data-models.md`에 proposal response, block identity, Advanced Parameters UI 제거/값 보존 정책을 기록했다.
  - `docs/jh/기타/008_...AI작업지시서_JH.md`, `docs/jh/기타/009_...사람용설명_JH.md`는 ignore 대상이지만 이번 커밋에 포함했다.
- Commits:
  - `619194b Feat: Terraform 동기화 proposal 타입 추가`
  - `cd7c870 Feat: DiagramJson InfrastructureGraph projection 추가`
  - `4e1bbf0 Feat: InfrastructureGraph 기반 Terraform Preview 생성`
  - `5e7fee7 Feat: AMI data source filter 동기화 지원`
  - `59444e2 Feat: Advanced Parameters UI 제거`
  - `9bb6a14 Feat: Terraform sync proposal 생성`
  - `315ee43 Feat: Terraform 동기화 proposal 승인 UI 연결`
  - `08223af Docs: Terraform sync proposal 계약 문서화`
  - `8f126fd Fix: Terraform rename proposal 명확성 보강`
  - `f0bbb91 Fix: Terraform proposal 부분 승인 상태 유지`
  - `474f278 Docs: InfrastructureGraph 동기화 v1 구현 기준 정리`
  - `caf849d Fix: Terraform proposal 테스트 fixture 보강`
- Known risks:
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
  - 브라우저 수동 smoke는 아직 수행하지 않았다.
  - `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.
- Next best action:
  - 브라우저에서 VPC/EC2/S3/AMI workspace를 열고 Preview 반복 생성과 proposal panel 부분 승인 흐름을 수동 smoke한다.

### 2026-07-03 - AI 작업 지시서 마일스톤 추가

- Goal: `docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md` 최상단에 50줄 이하 마일스톤을 추가한다.
- Completed:
  - AI 작업 지시서를 읽고 제목 바로 아래에 `## 마일스톤` 섹션을 추가했다.
  - 마일스톤은 계약 고정, Preview 경로 정리, 지원 리소스 값 구조 정렬, 파라미터 UI 단순화, Terraform 역동기화 proposal화, Frontend 승인 흐름 연결, 최종 문서화와 검증의 7단계로 정리했다.
  - 추가된 마일스톤 섹션이 35줄임을 확인했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `awk 'BEGIN{count=0; in_section=0} /^## 마일스톤$/{in_section=1} in_section{count++} in_section && /^> \\*\\*For agentic workers:/{print count-1; exit}' docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md` - `35`
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `docs/jh/기타`는 ignore 대상이라 커밋 시 `git add -f docs/jh/기타/...`가 필요하다.
- Known risks:
  - 기능 구현은 아직 시작하지 않았다.
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - AI 작업 지시서의 마일스톤을 기준으로 Commit 1부터 구현을 시작한다.

### 2026-07-02 - InfrastructureGraph 동기화 v1 문서 정리

- Goal: InfrastructureGraph 중심 Workspace 동기화 v1 구현을 시작하기 전에 단계 문서 번호를 정렬하고, 실제 구현용 AI 작업 지시서와 사람용 설명 문서를 분리해 작성한다.
- Completed:
  - `docs/jh/기타`의 단계 문서 순서를 `003_1단계`부터 `007_5단계`까지 맞췄다.
  - `docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md`를 추가했다.
  - `docs/jh/기타/009_InfrastructureGraphWorkspace동기화v1_사람용설명_JH.md`를 추가했다.
  - AI 작업 지시서의 commit plan에서 문서 순서 정리 작업은 제외하고, 실제 기능 구현만 15개 커밋으로 나눴다.
  - Advanced Parameters는 내부 정책 미정으로 UI에서 제거하되, 기존 optional 값은 삭제하지 않는 정책을 문서에 반영했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `find docs/jh/기타 -maxdepth 1 -type f -name '*.md' | sort` - 단계 문서가 `003_1단계`부터 `007_5단계` 순서로 정렬됨
  - `rg -n "문서 순서|단계 문서 번호|007_1단계|003_2단계" docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md docs/jh/기타/009_InfrastructureGraphWorkspace동기화v1_사람용설명_JH.md` - no matches
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `docs/jh/기타`는 ignore 대상이라 커밋 시 `git add -f docs/jh/기타/...`가 필요하다.
- Known risks:
  - 기능 구현은 아직 시작하지 않았다. 이번 세션 산출물은 구현 계획과 설명 문서다.
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - AI 작업 지시서의 commit plan에 따라 `Types: Terraform sync proposal 계약 추가`부터 구현을 시작한다.

### 2026-07-02 - invalid 파라미터 Terraform Preview 유지 수정

- Goal: 파라미터 값을 변경한 뒤 불완전한 리소스가 `invalid: true`로 표시되어도 Terraform Preview에서 해당 resource block이 사라지지 않게 한다.
- Root cause:
  - 파라미터 패널은 값 변경 시 required 값 누락을 감지해 `parameters.invalid = true`를 저장한다.
  - Terraform Preview 생성기는 `parameters.invalid === true`인 node를 출력에서 제외하고 있었다.
  - 2단계 skeleton 정책상 `aws_subnet.vpcId`, `aws_instance.ami`처럼 사용자가 나중에 확정해야 하는 값이 있을 수 있으므로, invalid 상태가 Preview block 숨김 조건이 되면 리소스 코드가 사라진다.
- Completed:
  - `generateTerraformFromDiagramJson`이 `parameters`가 있는 resource node는 invalid 상태여도 렌더링하도록 수정했다.
  - invalid 상태는 파라미터 패널/리소스 목록의 경고 상태로 유지하고, Terraform Preview block 제외 조건으로 쓰지 않게 문서를 갱신했다.
  - 재현 테스트를 추가해 `invalid: true`인 resource node도 Terraform Preview에 남는지 검증했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts` - red before fix, passed after fix
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/routes/terraform.test.ts` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 재현 실패는 `actual: ""`로 확인했으며, 수정 후 같은 테스트가 `resource "aws_vpc" "invalid"` block을 렌더링했다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - 브라우저에서 Subnet 또는 EC2 Instance의 파라미터 값을 변경한 뒤 Terraform Preview block이 유지되는지 수동 smoke를 수행한다.

### 2026-07-02 - 기본 IaC 파라미터 skeleton 자동 생성

- Goal: 캔버스 리소스 추가 시 Terraform Preview가 읽을 수 있는 최소 `parameters.values` skeleton을 자동 생성한다.
- Completed:
  - `aws_vpc`, `aws_subnet`, `aws_security_group`, `aws_instance`, `aws_s3_bucket`에 Preview skeleton subset 기본값을 추가했다.
  - `aws_ami`와 범위 밖 리소스는 기존처럼 `values: {}`를 유지하게 했다.
  - `aws_security_group`에는 공개 `ingress`를 자동 생성하지 않고 기본 `egress`만 생성하게 했다.
  - `aws_instance`의 `ami`, `subnetId`, `vpcSecurityGroupIds`와 S3 `bucket` 이름처럼 target 또는 사용자 확정이 필요한 값은 자동 생성하지 않게 했다.
  - `parameters.values` nested 객체/배열을 deep clone해 copy/paste 후 원본과 공유되지 않게 했다.
  - copy/paste 또는 resource name 변경 시 기존 resource name과 같던 자동 `tags.Name`만 새 이름으로 갱신하고 사용자 수정값은 보존하게 했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/reference-drop-targets.test.ts features/diagram-editor/drag-transaction.test.ts` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 테스트를 먼저 실패시키고 구현 후 통과시키는 TDD 흐름으로 skeleton 생성, 제외 리소스, design node, deep clone, 자동 태그 동기화/보존을 검증했다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend helper만 수정했으며 API route, DB/RDS/S3 저장 계약, Terraform renderer 출력 정책은 변경하지 않았다.
- Commits:
  - `f4f3217 Feat: 리소스 기본 파라미터 skeleton 생성`
  - `d169035 Fix: 파라미터 복사와 이름 변경 보존 정책 적용`
- Known risks:
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - Terraform Preview 화면에서 subset 리소스를 실제로 추가해 사용자가 보는 파라미터 패널/Preview 표시가 기대와 맞는지 수동 smoke를 수행한다.

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
