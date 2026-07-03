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
