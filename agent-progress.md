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

### 2026-07-03 - AWS connection SSO source credential hotfix

- Goal: AWS 계정 등록/연결 검증 경로에서 기존 STS AssumeRole 모델은 유지하되, 로컬/API 시작 credential source가 static AWS access key가 아니라 SSO 기반 `AWS_PROFILE`을 쓰도록 한다.
- Completed:
  - `.env.example`의 AWS profile 안내를 `sketchcatch-caller` access-key 방식에서 `AWS_PROFILE=sketchcatch-dev`와 `aws configure sso` / `aws sso login` 안내로 바꿨다.
  - `SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN`이 사용자 계정의 `SketchCatchTerraformExecutionRole` trust policy가 신뢰할 SketchCatch caller Role ARN임을 명확히 했다.
  - hotfix 범위를 SSO로 좁히기 위해 관련 없는 Bedrock, Amazon Q, Transcribe `.env.example` 값 변경은 제외했다.
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`이 API process env에 있으면 전 환경에서 시작을 막는 `assertNoStaticAwsCredentialsForApiServer`를 추가했다.
  - API server startup에서 Terraform plugin warmup과 interrupted deployment recovery 전에 static credential guard를 실행하도록 연결했다.
  - `AWS_PROFILE` 허용, static credential 거부, startup guard 순서, 기본 startup guard 동작을 테스트로 고정했다.
- Verification run:
  - `node scripts/check-harness.mjs` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm harness:check` - passed after non-escalated `npm exec` hit npm cache/registry restrictions
  - `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api test -- src/config/env.test.ts src/server-startup.test.ts` - passed; pnpm ran the API test suite and reported 414 passing tests
  - `git diff --check` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm lint` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm typecheck` - passed
  - `npm exec --package=pnpm@11.8.0 -- pnpm build` - passed on rerun with a longer timeout after the first build command timed out before returning a result
- Evidence recorded:
  - 실제 AWS connection verification, Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - 이전 실패한 pnpm/corepack 실행이 남긴 임시 `_tmp_*` 파일은 삭제했다.
  - build가 건드린 범위 밖 생성 파일 `apps/web/next-env.d.ts`는 원복했다.
- Known risks:
  - 최종 live AWS 계정 등록/연결 검증은 유효한 SSO login과 AWS 계정 설정으로 사용자가 실행해야 한다.
  - 이 환경에서는 `pnpm`이 PATH에 없어 `npm exec --package=pnpm@11.8.0 -- pnpm ...` 경로로 검증했다.
- Next best action:
  - `.env`에 `AWS_PROFILE=sketchcatch-dev`를 두고 static AWS credential env vars를 제거한 뒤 API를 시작해 AWS connection create/test/verify flow를 대상 계정으로 확인한다.

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
