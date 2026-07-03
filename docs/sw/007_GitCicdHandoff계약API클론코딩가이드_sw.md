# GitCicdHandoff 계약/API 클론 코딩 가이드

이 문서는 SketchCatch의 Git/CI/CD Deployment Path에서 `IaC Preview`를 Source Repository와 외부 pipeline으로 넘기는 v0 API 흐름을 설명한다. 확정 계약은 `docs/data-models.md`와 `packages/types/src/index.ts`를 우선한다.

## 핵심 경계

- `GitCicdHandoff`는 실제 PR 생성 결과물이 아니라 handoff metadata 기록이다.
- v0 API는 `internal` provider boundary만 호출한다. GitHub PR 생성, commit push, pipeline polling 같은 실제 외부 연동은 #135 범위다.
- `SourceRepository` 계약은 저장소를 식별하는 owner/name/defaultBranch/URL metadata만 가진다.
- Source Repository token, private key, deploy key, CI secret 원문은 request/response/shared type/DB/log에 저장하지 않는다.
- handoff 생성은 `userAcceptedChangeId`가 있는 User-Accepted Change 이후에만 가능하다.

## API 생명주기

1. 사용자가 Practice Architecture와 Terraform Artifact를 확인하고 Git/CI/CD handoff를 승인한다.
2. `POST /api/projects/:projectId/git-cicd-handoffs`가 project 접근권한, architecture 소속, uploaded Terraform artifact를 검증한다.
3. API는 `internal` provider boundary를 호출한다. 현재 구현은 외부 GitHub 호출 없이 `draft` metadata를 반환한다.
4. DB는 `git_cicd_handoffs`에 project, architecture, terraform artifact, repository metadata, 상태, 승인 evidence를 저장한다.
5. `GET /api/projects/:projectId/git-cicd-handoffs`와 `GET /api/git-cicd-handoffs/:handoffId`가 목록/상세 상태를 반환한다.
6. 내부 worker 또는 후속 provider 구현은 `PATCH /api/git-cicd-handoffs/:handoffId/status`로 PR URL, pipeline URL, 상태 메시지를 갱신한다.

## 상태 전이 의미

| status | 의미 |
| --- | --- |
| `draft` | handoff metadata가 생성됐지만 실제 PR/pipeline 연결은 아직 없다. |
| `pr_created` | provider가 PR URL을 기록했다. |
| `pipeline_running` | 외부 pipeline 실행 URL과 진행 상태가 연결됐다. |
| `pipeline_success` | 외부 pipeline이 성공 상태로 끝났다. |
| `pipeline_failed` | 외부 pipeline 실패 상태와 설명을 기록했다. |
| `cancelled` | 사용자가 handoff를 중단했거나 provider가 더 진행하지 않는다. |

## 클론 코딩 순서

1. `packages/types/src/index.ts`에 `SourceRepository`, `GitCicdHandoffStatus`, `GitCicdHandoff`, create/list/get/status DTO를 추가한다.
2. `apps/api/src/db/schema.ts`에 `git_cicd_handoff_status`, `git_cicd_repository_provider`, `git_cicd_handoffs`를 추가한다.
3. `apps/api/drizzle/0021_git_cicd_handoffs.sql`처럼 명시적 SQL migration을 만든다.
4. `apps/api/src/git-cicd/git-cicd-handoff-service.ts`에서 project 접근권한, architecture, Terraform artifact 검증을 서비스로 분리한다.
5. `apps/api/src/routes/git-cicd-handoffs.ts`에서 strict Zod schema로 request를 검증하고 response는 shared type 형태로만 만든다.
6. route test는 fake repository와 fake/internal provider로 create/list/get/status update를 검증한다.
7. 테스트에서 `accessToken`, `privateKey`, `ciSecret`, `deployKey` 같은 필드가 response에 없는지 확인한다.

## #135가 이어받을 자리

#135는 `GitCicdHandoffProvider`의 실제 구현을 교체하면 된다. 이때도 API route와 shared response contract는 그대로 두고, provider 내부에서만 GitHub App/OAuth token 사용, PR 생성, pipeline polling을 처리해야 한다. 외부 provider가 받은 secret은 DB나 로그에 남기지 않고, 최종 metadata만 `GitCicdHandoff` 상태로 기록한다.
