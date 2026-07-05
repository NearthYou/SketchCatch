# Deployment, GitHub App, Runtime Cache 구현 마일스톤

## 원칙

- 구현 기준 문서는 `docs/sw/spec3.md`다.
- 변경 순서는 shared types -> API DTO/schema -> persistence/service -> Web -> smoke/infra/docs -> verification 순서로 진행한다.
- Redis는 내부 Runtime Cache로만 다루며 Practice Architecture Resource에 추가하지 않는다.
- 실제 cloud mutation은 plan, approval, log, cleanup 흐름을 통과해야 한다.

## M1. 문서와 계약 고정

- `docs/sw/spec3.md` 작성
- `docs/sw/plan3.md` 작성
- `docs/sw/README.md`에 spec3/plan3 링크 추가
- `docs/data-models.md`에 Source Repository와 GitHub App 연결 계약 반영
- `docs/deployment.md`에 Redis/ElastiCache 운영 연결과 S3 smoke runner 반영

완료 기준:

- 구현자가 API 이름, DB 필드, 환경 변수, 검증 범위를 문서만 보고 따라갈 수 있다.

## M2. Shared Types와 DB 모델

- `packages/types`에 다음 타입 추가/수정
  - `SourceRepositoryStatus`
  - `SourceRepository`
  - `GitHubRepositoryCandidate`
  - GitHub install URL/callback/connect DTO
  - `CreateGitCicdHandoffRequest`에서 repository identity 입력 제거
  - `GitCicdHandoff`에 PR head SHA 상태 추적 필드 추가
- `apps/api/src/db/schema.ts`에 `source_repositories` table 추가
- `source_repositories.status`, `disconnected_at` 추가
- `git_cicd_handoffs.pull_request_head_sha` 추가
- Drizzle migration 추가
- API env config에 GitHub App 필수 env 추가

완료 기준:

- 타입과 DB schema가 같은 필드명을 사용한다.
- 클라이언트가 owner/name/provider를 임의로 보내지 않는 계약이 타입 수준에서 드러난다.

## M3. GitHub App 연결 API

- signed short-lived state 발급/검증 helper 구현
- GitHub App JWT 생성 helper 구현
- `GITHUB_APP_PRIVATE_KEY_BASE64` decode 처리
- installation access token 발급 client 구현
- installation repository 목록 조회 client 구현
- source repository service 구현
- API route 구현
  - `POST /api/projects/:projectId/source-repositories/github/install-url`
  - `POST /api/source-repositories/github/installation-repositories`
  - `POST /api/projects/:projectId/source-repositories/github`
  - `GET /api/projects/:projectId/source-repositories`
- state 만료, 프로젝트 접근권한, archived repo 거부, active repo soft deactivate 검증 테스트 추가

완료 기준:

- GitHub App 설치 callback 이후 repository 1개만 DB active 연결로 저장된다.
- installation repository 목록은 DB에 저장되지 않는다.

## M4. GitHub PR Handoff 실제 provider

- handoff 생성 service가 `sourceRepositoryId`로 active source repository를 조회하도록 변경
- `repositoryOwner`, `repositoryName`, `repositoryProvider` body 입력 제거
- source branch naming을 SketchCatch retry/update 규칙에 맞게 안정화
- PR file path를 `sketchcatch/<project-slug>/terraform/<artifact-file-name>`로 변경
- GitHub provider 구현
  - target branch file preflight conflict
  - source branch 생성 또는 기존 SketchCatch branch 재사용
  - Terraform artifact 다운로드 후 GitHub contents API commit
  - PR 생성
  - PR head SHA 저장
- 기존 fake/internal provider 테스트 유지

완료 기준:

- 실제 GitHub API 호출로 branch/file commit/PR 생성이 가능하다.
- target branch 기존 파일은 `409 conflict`로 막힌다.
- 같은 source branch retry/update commit은 허용된다.

## M5. Pipeline Status Polling

- GitHub Actions workflow runs 조회 client 구현
- PR head SHA 기준 최신 run 1개 상태 매핑
- pipeline status API에서 GitHub 상태 refresh 후 DB와 Runtime Cache에 반영
- Redis가 있으면 cache hit/miss가 Redis adapter를 거치고, 없으면 memory fallback 유지

완료 기준:

- PR 생성 직후 workflow run이 없으면 `pr_created`를 유지한다.
- Actions run이 있으면 `pipeline_running`, `pipeline_success`, `pipeline_failed`로 갱신된다.

## M6. Web 연결 화면

- 프로젝트 화면에 active source repository 표시
- `GitHub 연결` 버튼은 API에서 install URL을 받아 redirect한다.
- `/integrations/github/callback` Web route 구현
- callback page가 API exchange 결과로 repository 목록을 보여준다.
- archived repository는 선택 불가로 표시한다.
- 선택한 repository를 API로 저장하고 프로젝트 workspace로 돌아간다.
- Git/CI/CD handoff 생성 요청은 `sourceRepositoryId`만 보낸다.

완료 기준:

- 사용자가 브라우저 흐름으로 GitHub App 설치 -> repository 선택 -> 프로젝트 연결을 완료할 수 있다.

## M7. Redis와 운영 smoke

- local docker compose에 Redis service 추가
- 운영 ElastiCache CloudFormation 또는 문서화된 infra template 추가
- `.env.example`에 GitHub App env와 Redis env 확인
- `scripts/smoke/live-s3-deployment.ps1` 구현
- smoke runner는 Terraform 파일을 repo fixture로 두지 않고 실행 시 생성한다.
- smoke report에는 bucket name, deployment id, apply result, destroy result만 남긴다.

완료 기준:

- 로컬 Redis로 cache integration 테스트를 수행할 수 있다.
- 운영 API에 `REDIS_URL`을 주입해 Deployment log cursor와 Git pipeline status cache 경로를 검증할 수 있다.
- 사전 준비된 AWS connection만 있으면 S3 live apply/destroy smoke를 실행할 수 있다.

## M8. 검증과 마무리

필수 명령:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

대상 테스트:

```bash
pnpm --filter @sketchcatch/api test -- source-repositories
pnpm --filter @sketchcatch/api test -- git-cicd
pnpm --filter @sketchcatch/web test -- workspace
```

수동/운영 검증:

```powershell
$env:API_BASE_URL="https://<api-host>"
$env:ACCESS_TOKEN="<token>"
$env:AWS_CONNECTION_ID="<connection-id>"
$env:SMOKE_ACCOUNT_ID="<aws-account-id>"
$env:AWS_REGION="ap-northeast-2"
.\scripts\smoke\live-s3-deployment.ps1
```

완료 기준:

- 자동 테스트와 build가 통과한다.
- 실제 AWS/GitHub/Redis 검증은 필요한 외부 credential이 준비된 환경에서 실행 방법과 결과 report가 남는다.
