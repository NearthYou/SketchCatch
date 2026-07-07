# Git/CI/CD 자동 배포 E2E 구현 마일스톤

## 원칙

- 기준 스펙은 `docs/sw/spec6.md`다.
- 작업 규범은 `docs/sw/agents3.md`를 따른다.
- 구현 중 결정, 범위 변경, 검증 결과가 생기면 `spec6.md`, `plan6.md`, `agents3.md`를 같은 PR에서 갱신한다.
- 실제 GitHub repository 설정, IAM 변경, Terraform apply, app deploy, destroy는 사용자 승인과 secret masking을 통과해야 한다.
- 각 마일스톤 branch는 `origin/dev`에서 시작한다.

## M1. GitHub OAuth와 repo 설정 자동화 기반

- Priority: P0
- Issue: #203
- Branch: `feature/sw/203-github-oauth-repo-setup`

목표:

- GitHub App만으로 부족한 workflow 파일 생성과 Actions 설정 자동화를 위해 user OAuth 추가 승인과 repo 설정 writer를 만든다.

주요 변경:

- GitHub user OAuth 추가 승인 흐름
- workflow 파일 수정 권한 확인
- repository variables/secrets/environment 자동 설정 API
- 권한 부족 시 재승인 CTA와 안전한 오류 응답

완료 기준:

- 선택 repo에 Actions variables, secrets, environment를 생성/갱신할 수 있다.
- workflow 파일 생성 권한이 없으면 handoff 생성 전 차단된다.
- GitHub token과 secret 값은 저장/노출되지 않는다.

테스트:

- GitHub OAuth state/service test
- GitHub repository settings client test
- route schema/auth test
- secret masking regression test

## M2. Git/CI/CD infra-app handoff 상태 모델 확장

- Priority: P0
- Issue: #204
- Branch: `feature/sw/204-cicd-handoff-state`

목표:

- 하나의 handoff record가 infra/app/destroy pipeline 상세 상태를 함께 추적하게 한다.

주요 변경:

- shared `GitCicdHandoff` 타입 확장
- DB migration 추가
- API DTO/Zod schema 확장
- Runtime Cache snapshot 확장
- 기존 handoff와 null-safe 호환 유지

완료 기준:

- source deployment, PR number, merge commit, infra/app/destroy run URL과 상태가 저장된다.
- API 응답이 summary status와 상세 pipeline status를 모두 제공한다.
- 기존 handoff record는 migration 후에도 조회된다.

테스트:

- schema contract test
- route serialization test
- runtime cache compatibility test
- existing record migration smoke

## M3. AWS Connection role 변경 diff와 승인 적용

- Priority: P0
- Issue: #205
- Branch: `feature/sw/205-aws-role-oidc-approval`

목표:

- 기존 verified AWS Connection role을 GitHub Actions OIDC role로 재사용하기 위한 trust/policy diff와 승인 적용 경로를 만든다.

주요 변경:

- current IAM trust/policy reader
- required OIDC trust/policy diff generator
- user approval record
- IAM update executor
- STS/IAM verification

완료 기준:

- 승인 전에는 IAM 변경이 발생하지 않는다.
- diff는 repository, branch, environment 조건으로 제한된다.
- 승인 후 적용 결과가 handoff 준비 상태에 반영된다.

테스트:

- IAM diff unit test
- approval required route test
- AWS gateway fake apply test
- secret/log masking test

## M4. Terraform infra workflow와 S3 backend 자동 부트스트랩

- Priority: P1
- Issue: #206
- Branch: `feature/sw/206-terraform-infra-workflow`
- Blocked by: #203, #204, #205

목표:

- PR에 Terraform artifact와 infra workflow를 생성하고, merge 후 plan 자동 실행과 approval 후 apply를 수행한다.

주요 변경:

- infra workflow renderer
- S3 backend bucket/key bootstrap
- environment approval gate
- RDS opt-in variable
- destroy workflow renderer
- PR payload 생성 확장

완료 기준:

- PR에 Terraform artifact, infra workflow, destroy workflow가 포함된다.
- merge 후 plan은 자동 실행된다.
- apply와 destroy는 GitHub Environment approval 뒤에만 실행된다.
- RDS는 기본 제외, opt-in에서만 포함된다.

테스트:

- workflow snapshot test
- GitHub provider payload test
- S3 backend config test
- RDS opt-in rendering test

## M5. 앱 런타임 S3 release와 ASG Instance Refresh 배포

- Priority: P1
- Issue: #207
- Branch: `feature/sw/207-app-runtime-asg-refresh`
- Blocked by: #206

목표:

- app workflow가 runtime release artifact를 S3에 업로드하고 ASG Instance Refresh로 EC2 API와 static content를 롤아웃한다.

주요 변경:

- app workflow renderer
- release artifact layout
- Launch Template release id update step
- ASG Instance Refresh step
- static/API release marker verification

완료 기준:

- app workflow가 새 release artifact를 S3에 업로드한다.
- Launch Template 또는 user data release id가 새 release를 참조한다.
- ASG Instance Refresh가 성공/실패 상태를 남긴다.
- static site URL과 API URL이 새 release marker를 반환한다.

테스트:

- app workflow snapshot test
- release marker renderer test
- ASG refresh command payload test
- URL verification parser test

## M6. merge 후 infra/app pipeline 상태 추적

- Priority: P1
- Issue: #208
- Branch: `feature/sw/208-merge-pipeline-status`
- Blocked by: #204

목표:

- PR head SHA가 아니라 merge commit SHA 기준으로 target branch infra/app workflow run을 추적한다.

주요 변경:

- PR number 기반 merge status reader
- merge commit SHA workflow run lookup
- infra/app workflow name filtering
- approval waiting/running/success/failure mapping
- summary status aggregation

완료 기준:

- PR open, closed unmerged, merged waiting, running, success, failed를 구분한다.
- infra/app 중 하나라도 실패하면 summary가 failed가 된다.
- approval 대기 상태는 사용자에게 명확히 표시된다.

테스트:

- GitHub client PR merge status test
- workflow run mapping test
- Runtime Cache update test
- route integration test

## M7. Deployment Panel Git/CI/CD 자동 배포 UX

- Priority: P1
- Issue: #209
- Branch: `feature/sw/209-deployment-panel-cicd-ux`
- Blocked by: #203, #204, #205, #208

목표:

- 사용자가 Deployment Panel에서 repo 설정, AWS role diff, RDS opt-in, PR 생성, pipeline 상태, URL 검증 결과를 한 흐름으로 확인한다.

주요 변경:

- Git/CI/CD 자동 배포 PR 생성 CTA
- GitHub OAuth 재승인 CTA
- AWS role diff 승인 모달
- repo settings preview
- infra/app/destroy status display
- static/API URL verification display

완료 기준:

- 필요한 조건이 충족될 때만 PR 생성 버튼이 활성화된다.
- IAM diff와 repo 설정 변경은 사용자 승인 후에만 진행된다.
- handoff detail이 PR, merge, infra/app pipeline, URL 검증 상태를 보여준다.
- 실패 메시지가 GitHub/AWS/SketchCatch 원인을 구분한다.

테스트:

- Deployment Panel state test
- API helper request test
- approval modal test
- pipeline status rendering test

## M8. Git/CI/CD 자동 배포 대표 smoke와 문서 증거

- Priority: P2
- Issue: #210
- Branch: `feature/sw/210-cicd-live-smoke-docs`
- Blocked by: #207, #209

목표:

- PR merge, environment approval, Terraform apply, app release, ASG refresh, URL 검증, destroy까지 대표 smoke 증거를 남긴다.

주요 변경:

- live smoke script 또는 체크리스트
- smoke report schema
- cleanup/destroy 증거 기록
- `feature_list.json`, `agent-progress.md`, `session-handoff.md` evidence 갱신
- `spec6.md`, `plan6.md`, `agents3.md` 최종 보정

완료 기준:

- 대표 Git/CI/CD 자동 배포 smoke가 통과하거나 명확한 외부 blocker와 함께 기록된다.
- destroy workflow 또는 cleanup 결과가 증거로 남는다.
- HARNESS 항목과 agent progress가 concrete verification command를 포함한다.

테스트:

- smoke script parser test
- targeted API/web checks
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## 이슈와 브랜치 목록

| Milestone | Issue | Branch |
| --- | --- | --- |
| M1 | #203 | `feature/sw/203-github-oauth-repo-setup` |
| M2 | #204 | `feature/sw/204-cicd-handoff-state` |
| M3 | #205 | `feature/sw/205-aws-role-oidc-approval` |
| M4 | #206 | `feature/sw/206-terraform-infra-workflow` |
| M5 | #207 | `feature/sw/207-app-runtime-asg-refresh` |
| M6 | #208 | `feature/sw/208-merge-pipeline-status` |
| M7 | #209 | `feature/sw/209-deployment-panel-cicd-ux` |
| M8 | #210 | `feature/sw/210-cicd-live-smoke-docs` |
