# Deployment, GitHub App, Runtime Cache 운영 검증 스펙

## 목적

이 문서는 SketchCatch 3번 범위인 Deployment, Git/CI/CD Integration, Runtime Cache를 실제 서비스 흐름으로 닫기 위한 스펙이다. 목표는 기존 Direct Deployment와 Git/CI/CD Path가 모두 plan/check/approval 기준으로 동작하고, 실제 AWS S3 smoke apply/destroy, 실제 GitHub PR 생성/API 호출, Redis 기반 운영형 캐시 검증까지 수행 가능한 상태로 만드는 것이다.

## 범위

### Direct Deployment

- AWS connection은 사전에 준비된 연결값을 사용한다.
- smoke runner는 API 호출만으로 다음 흐름을 자동 수행한다.
  - `ACCESS_TOKEN`이 있으면 그대로 사용
  - 없으면 `SMOKE_EMAIL` / `SMOKE_PASSWORD`로 login
  - login 실패 시 `SMOKE_CREATE_USER=true`일 때만 signup 후 login
  - project 생성
  - architecture snapshot 생성
  - 실행 시 생성한 S3 Terraform artifact 업로드 및 confirm
  - deployment 생성
  - init -> poll
  - plan -> poll
  - approve
  - apply -> poll
  - resources / outputs / logs 확인
  - destroy plan -> poll
  - approve
  - destroy -> poll
  - smoke report 생성
- S3 smoke bucket 이름은 `sketchcatch-smoke-<account-id>-<region>-<short-run-id>` 형식을 사용한다.
- S3 smoke Terraform은 repo fixture로 추적하지 않고 runner가 실행 시 문자열로 생성한다.
- smoke Terraform은 `force_destroy = true`를 사용해 cleanup 안정성을 높인다.

### GitHub App 연결

- 사용자가 SketchCatch에서 `GitHub 연결`을 누르면 Web은 API에 install URL 발급을 요청하고, API가 signed short-lived state와 GitHub App 설치 URL을 발급한다.
- Web은 URL로 redirect만 수행한다. Web은 state를 직접 만들지 않는다.
- GitHub App 설치 후 GitHub는 `installation_id`와 `state`를 Web route `/integrations/github/callback`으로 redirect한다.
- Web route는 `installation_id`와 `state`를 API로 전달한다.
- API는 state 서명, 만료, user/project 접근권한을 검증한 뒤 installation repository 목록을 GitHub API로 조회한다.
- Web은 조회된 repository 목록을 임시 선택 화면에 표시한다.
- 사용자가 repository 1개를 선택하면 Web이 API에 저장 요청을 보낸다.
- DB에는 사용자가 선택한 repository 1개만 `source_repositories`에 저장한다. installation 전체 repository 목록은 저장하지 않는다.

### GitHub App state

- state는 DB에 저장하지 않는 signed short-lived token이다.
- state 서명 secret은 `GIT_APP_STATE_SECRET`이 있으면 사용하고, 없으면 `AUTH_TOKEN_SECRET`을 사용한다.
- state payload에는 다음 값만 둔다.
  - `userId`
  - `projectId`
  - `nonce`
  - `expiresAt`
- callback과 선택 저장 API는 state 서명, 만료, user/project 접근권한을 모두 검증한다.

### Source Repository

- MVP는 프로젝트당 active GitHub repo 1개만 허용한다.
- `source_repositories`는 기록을 남기되, 같은 `project_id + provider=github` 조합에 대해 active 연결은 하나만 둔다.
- 새 GitHub repo를 연결하면 기존 active row는 soft deactivate 한다.
- `source_repositories`에는 `status: "active" | "inactive"`와 `disconnectedAt`을 둔다.
- Redis는 Source Repository나 Practice Architecture Resource가 아니다.

### Git/CI/CD Handoff

- handoff 생성 body는 `sourceRepositoryId`만 받는다.
- `owner`, `name`, `provider`, `defaultBranch`는 DB의 active source repository에서 읽는다.
- 클라이언트가 임의 repository owner/name/provider/branch를 보내는 흐름은 서비스형 연결에서 허용하지 않는다.
- PR 파일 경로는 `sketchcatch/<project-slug>/terraform/<artifact-file-name>`이다.
- 새 source branch 생성 후 해당 경로에 Terraform artifact를 commit한다.
- target branch에 같은 path가 이미 있으면 PR 생성 전 `409 conflict`로 막는다.
- 이미 SketchCatch가 만든 같은 source branch에 같은 path가 있으면 retry/update commit은 허용한다.
- GitHub App 권한은 다음으로 고정한다.
  - Repository Contents: Read and write
  - Pull requests: Read and write
  - Actions: Read-only
  - Metadata: Read-only

### Pipeline Status

- PR head SHA 기준으로 GitHub Actions workflow runs를 조회한다.
- 최신 run 1개를 다음 상태로 매핑한다.
  - `queued`, `in_progress`, `waiting` -> `pipeline_running`
  - `completed + success` -> `pipeline_success`
  - `completed + failure`, `cancelled`, `timed_out`, `action_required` -> `pipeline_failed`
  - workflow run 없음 -> `pr_created`
- pipeline status cache는 Runtime Cache를 거친다.

### Runtime Cache / Redis

- Redis는 SketchCatch 운영 인프라다.
- `REDIS_URL`을 운영 API env에 주입한다.
- 검증 대상은 Deployment log cursor와 Git pipeline status cache가 Redis를 거치는지 여부다.
- Redis는 `ResourceType`, resource catalog, Architecture Board, Terraform generator, 사용자 UI 리소스 목록에 추가하지 않는다.
- 로컬 검증에서는 docker compose Redis를 사용할 수 있다.
- 운영 검증에서는 ElastiCache Redis를 API env에 연결한다.

## 필수 환경 변수

```bash
GIT_APP_ID=
GIT_APP_SLUG=
GIT_APP_PRIVATE_KEY_BASE64=
GIT_APP_CALLBACK_URL=
GIT_APP_STATE_SECRET=
REDIS_URL=
```

`GIT_APP_STATE_SECRET`은 선택값이다. 없으면 `AUTH_TOKEN_SECRET`을 사용한다.

## API 계약

### GitHub install URL 발급

`POST /api/projects/:projectId/source-repositories/github/install-url`

응답:

```json
{
  "installUrl": "https://github.com/apps/<slug>/installations/select_target?state=<signed-state>",
  "expiresAt": "2026-07-05T00:00:00.000Z"
}
```

### Existing active GitHub installation callback URL

`POST /api/projects/:projectId/source-repositories/github/existing-installation-callback-url`

When a project already has an active GitHub source repository, SketchCatch does not send the user back to GitHub's Configure page. GitHub drops `state` from the Configure link for an already-installed account, so the API uses the active row's stored `githubInstallationId` plus a fresh signed state to open the SketchCatch repository selection callback screen directly.

Response:

```json
{
  "callbackUrl": "https://sketchcatch.net/integrations/github/callback?installation_id=123456&state=<signed-state>",
  "expiresAt": "2026-07-05T00:00:00.000Z"
}
```

### GitHub callback repository 조회

`POST /api/source-repositories/github/installation-repositories`

요청:

```json
{
  "installationId": "123456",
  "state": "<signed-state>"
}
```

응답:

```json
{
  "projectId": "project-id",
  "repositories": [
    {
      "githubRepositoryId": "987654",
      "owner": "owner",
      "name": "repo",
      "defaultBranch": "main",
      "repositoryUrl": "https://github.com/owner/repo",
      "visibility": "private",
      "archived": false
    }
  ]
}
```

### GitHub source repository 저장

`POST /api/projects/:projectId/source-repositories/github`

요청:

```json
{
  "installationId": "123456",
  "githubRepositoryId": "987654",
  "state": "<signed-state>"
}
```

응답은 저장된 active `SourceRepository`이다.

### Git/CI/CD handoff 생성

`POST /api/projects/:projectId/git-cicd/handoffs`

요청:

```json
{
  "architectureId": "architecture-id",
  "terraformArtifactId": "artifact-id",
  "sourceRepositoryId": "source-repository-id",
  "targetBranch": "main",
  "planSummary": {
    "resourceAdds": 1,
    "resourceChanges": 0,
    "resourceDestroys": 0,
    "riskyChanges": [],
    "approvalSnapshotId": "snapshot-id"
  },
  "userAcceptedChangeId": "accepted-change-id"
}
```

`targetBranch`는 선택값이며 기본값은 source repository의 `defaultBranch`다. repository identity는 body에서 받지 않는다.

## 비범위

- GitHub OAuth 기반 repository 연결은 이번 범위의 기본 경로가 아니다.
- Redis를 사용자 리소스로 모델링하지 않는다.
- S3 외 AWS 리소스 live smoke는 이번 MVP smoke의 필수 조건이 아니다.
- GitHub Issues, Administration, Secrets 권한은 요구하지 않는다.
- installation 전체 repository 목록을 DB에 저장하지 않는다.

## 완료 기준

- 사용자가 Web에서 GitHub App 설치 화면으로 이동할 수 있다.
- callback 후 설치된 repository 목록을 보고 하나를 프로젝트에 연결할 수 있다.
- 프로젝트에 active GitHub source repository가 하나만 유지된다.
- Git/CI/CD handoff는 DB active source repository 기준으로 PR을 생성한다.
- target branch 기존 파일 conflict와 source branch retry/update 규칙이 적용된다.
- pipeline status가 PR head SHA의 최신 GitHub Actions run으로 갱신된다.
- Redis 연결 시 Deployment log cursor와 Git pipeline status cache가 Redis를 사용한다.
- live S3 smoke runner가 API 기반 apply/destroy report를 생성할 수 있다.
