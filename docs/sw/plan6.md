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
- Status: implemented_with_github_app_and_one_time_oauth_writer

Current evidence:

- GitHub App installation token 기반 repository settings writer가 Environment 생성과 Actions variables upsert를 수행한다.
- GitHub PR 생성 또는 repository settings apply 중 401/403 권한 부족이 발생하면 `github_oauth_required`로 fail-closed 처리한다.
- GitHub user OAuth one-time grant가 Runtime Cache에 token을 10분 TTL로만 저장하고, `apply-with-github-oauth` 이후 즉시 삭제한다.
- OAuth writer는 Environment와 Actions variables를 적용한다.
- Secret 값은 받지 않으며, repository secrets는 preview 이름만 유지한다.

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

2026-07-07 진행:

- repository settings preview와 workflow/settings manifest 생성은 구현했다.
- 실제 GitHub user OAuth token으로 Environment와 Actions variables를 적용하는 one-time writer를 추가했다.
- secret 원문 수집/암호화 저장은 현재 모델에 없으므로 적용 대상에서 제외하고 preview 이름만 유지한다.

테스트:

- GitHub OAuth state/service test
- GitHub repository settings client test
- route schema/auth test
- secret masking regression test

## M2. Git/CI/CD infra-app handoff 상태 모델 확장

- Priority: P0
- Issue: #204
- Branch: `feature/sw/204-cicd-handoff-state`
- Status: implemented_in_pr_211

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

2026-07-07 진행:

- shared type, DB schema, SQL migration, API mapper, Runtime Cache snapshot에 infra/app/destroy 상세 상태를 추가했다.
- targeted API route/typecheck가 통과했다.

## M3. AWS Connection role 변경 diff와 승인 적용

- Priority: P0
- Issue: #205
- Branch: `feature/sw/205-aws-role-oidc-approval`
- Status: implemented_in_pr_211_for_approved_trust_policy_apply

Current evidence:

- 승인된 `awsRoleDiff`와 `roleArn`이 있을 때만 IAM trust policy apply route가 실행된다.
- executor는 GitHub OIDC statement를 적용한 뒤 IAM `GetRole` 재조회로 `verified`를 확인하고 handoff JSON에 기록한다.
- 실제 AWS 계정 live apply는 별도 smoke 승인 후 수행해야 한다.

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

2026-07-07 진행:

- AWS role diff preview와 승인 metadata는 생성한다.
- 실제 IAM read/update/STS verification executor는 후속으로 남았다.

## M4. Terraform infra workflow와 S3 backend 자동 부트스트랩

- Priority: P1
- Issue: #206
- Branch: `feature/sw/206-terraform-infra-workflow`
- Blocked by: #203, #204, #205
- Status: implemented_in_pr_211_for_pr_artifact_generation

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

2026-07-07 진행:

- infra workflow renderer와 PR file generation을 구현했다.
- S3 backend bootstrap, plan/apply split, Environment approval, RDS opt-in variable, destroy workflow renderer를 테스트했다.
- 실제 GitHub Actions live run은 후속 smoke에서 확인해야 한다.

## M5. 앱 런타임 S3 release와 ASG Instance Refresh 배포

- Priority: P1
- Issue: #207
- Branch: `feature/sw/207-app-runtime-asg-refresh`
- Blocked by: #206
- Status: implemented_in_pr_211_for_workflow_generation

Current evidence:

- App workflow는 S3 release artifact를 업로드하고 release marker 파일을 만든다.
- `SKETCHCATCH_ASG_NAME`이 있으면 ASG의 Launch Template ID 또는 이름을 찾아 `SKETCHCATCH_RELEASE_ID` user data marker를 새 Launch Template version에 기록한다.
- ASG는 새 Launch Template version으로 갱신되고 Instance Refresh status를 `Successful` 또는 실패 상태까지 polling한다.
- 실제 ASG refresh 성공 여부와 URL marker 반영은 live smoke에서 확인해야 한다.

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

2026-07-07 진행:

- app workflow renderer가 S3 release artifact upload, optional ASG Instance Refresh, static/API URL verification step을 생성한다.
- 실제 ASG Instance Refresh 성공 여부는 live smoke에서 확인해야 한다.

## M6. merge 후 infra/app pipeline 상태 추적

- Priority: P1
- Issue: #208
- Branch: `feature/sw/208-merge-pipeline-status`
- Blocked by: #204
- Status: implemented_in_pr_211

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

2026-07-07 진행:

- GitHub client와 pipeline status provider가 PR number, merge commit SHA, workflow name 기준으로 infra/app/destroy status를 추적한다.
- Runtime Cache와 route response가 상세 상태를 보존한다.

## M7. Deployment Panel Git/CI/CD 자동 배포 UX

- Priority: P1
- Issue: #209
- Branch: `feature/sw/209-deployment-panel-cicd-ux`
- Blocked by: #203, #204, #205, #208
- Status: implemented_in_pr_211_for_core_panel_and_apply_actions

Current evidence:

- Deployment Panel은 `Git/CI/CD handoff 생성`, `Repo settings 적용`, `AWS role diff 적용` 액션을 제공한다.
- repo settings/IAM diff/Environment approval/OAuth 필요 여부/infra-app-destroy status/static/API URL을 한 handoff detail에서 표시한다.
- 별도 modal 대신 승인된 diff와 disabled state로 최소 승인 흐름을 유지한다.

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

2026-07-07 진행:

- Deployment Panel에 `Git/CI/CD handoff 생성` 버튼, OAuth 필요 표시, approval 표시, repo settings/IAM diff summary, infra/app/destroy status, static/API URL 표시를 추가했다.
- 실제 OAuth 재승인 CTA와 IAM approval modal은 후속 UX 보강으로 남았다.

## M8. Git/CI/CD 자동 배포 대표 smoke와 문서 증거

- Priority: P2
- Issue: #210
- Branch: `feature/sw/210-cicd-live-smoke-docs`
- Blocked by: #207, #209
- Status: smoke_runner_preflight_added_live_execution_pending

Current evidence:

- `scripts/smoke/git-cicd-auto-deploy.ps1`이 repo settings apply, AWS role diff apply, infra/app/destroy pipeline 상태, static/API URL marker 확인 report를 출력한다.
- smoke runner는 `-PreflightOnly`로 API health, access token, handoff id, mutation approval gate를 cloud mutation 없이 확인한다.
- 실제 repo settings apply와 AWS role diff apply는 `-ConfirmLiveMutations`가 있어야 실행된다.
- smoke runner는 `-RequirePipelineSuccess`, `-RequireDestroySuccess`, `-TimeoutMinutes`, `-PollSeconds`로 live run 종료 조건을 명시할 수 있다.
- 실제 PR merge, Environment approval, Terraform apply, app release, ASG refresh, destroy live smoke는 아직 실행 증거가 없다.

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

2026-07-07 진행:

- targeted API/web tests와 smoke script parser check는 통과했다.
- smoke runner가 infra/app/destroy 상세 상태, static/API URL marker, pipeline snapshot을 report에 남기도록 보강됐다.
- 실제 PR merge, Environment approval, Terraform apply, app release, ASG refresh, destroy live smoke는 아직 실행하지 않았다.

2026-07-07 추가 진행:

- `docs/sw/git-cicd-live-smoke.md`에 preflight와 live run 절차를 분리해 기록했다.
- smoke runner에 `-PreflightOnly`, `-ReportPath`, `-FailOnBlocked`, `-ConfirmLiveMutations`를 추가했다.
- 실제 GitHub repository settings apply와 AWS role diff apply는 `-ConfirmLiveMutations` 없이는 실행되지 않는다.
- access token, handoff id, API health, mutation approval gate가 부족하면 JSON report에 `blocked`로 남긴다.
- 잘못된 token이나 pipeline 조회 실패도 JSON report의 failed step으로 남긴다.

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
