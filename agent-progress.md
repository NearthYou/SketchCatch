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

## 세션 레코드

### 2026-07-04 - Blueprint 리디자인 스펙 문서화

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
