# Git/CI/CD 자동 배포 E2E 스펙

## 목표

SketchCatch의 Git/CI/CD Deployment Path를 데모 가능한 수준으로 완성한다.
사용자는 SketchCatch에서 선택한 GitHub repository에 PR을 만들고, PR merge 후 GitHub Actions가 Terraform 인프라 배포와 앱 런타임 배포를 모두 수행하는 흐름을 볼 수 있어야 한다.

최종 데모 흐름:

```text
SketchCatch Architecture Board
-> Terraform IaC Preview
-> Pre-Deployment Check
-> Git/CI/CD 자동 배포 PR 생성
-> GitHub PR review/merge
-> Infra workflow: terraform plan
-> GitHub Environment approval
-> Infra workflow: terraform apply
-> App workflow: S3 release artifact upload
-> Launch Template release id update
-> ASG Instance Refresh
-> static_site_url / api_base_url 검증
-> Destroy workflow cleanup
```

## 범위

### 포함

- 사용자가 연결한 GitHub source repository를 배포 repository로 사용한다.
- GitHub App 설치 흐름은 유지하되, workflow 파일 생성과 repository Actions 설정 자동화를 위해 GitHub user OAuth 추가 승인을 받는다.
- SketchCatch가 repository variables, secrets, environment, workflow 파일을 자동 설정한다.
- 기존 verified AWS Connection role을 GitHub Actions OIDC role로 재사용한다.
- AWS role trust/policy 변경은 diff를 먼저 보여주고 사용자 승인 후에만 적용한다.
- Terraform state는 GitHub Actions workflow가 S3 backend를 자동 부트스트랩해 사용한다.
- Infra workflow와 App workflow는 분리한다.
- Handoff record는 하나만 만들고, infra/app pipeline 상태를 상세 필드로 함께 추적한다.
- RDS는 기본 제외하고 opt-in일 때만 apply 대상에 포함한다.
- Destroy workflow를 함께 생성해 비용 리소스를 정리할 수 있게 한다.

### 제외

- GitHub PAT 수동 입력 방식.
- PR branch push 시 즉시 apply하는 방식.
- Direct Deployment state를 GitHub Actions state로 강제 이관하는 방식.
- AMI bake 기반 배포.
- CloudFront invalidation 자동화. 필요한 경우 후속 범위로 분리한다.

## 핵심 제품 계약

### GitHub 인증

GitHub App installation token은 repository 선택, contents write, PR 생성, Actions run 조회에 사용한다.
workflow 파일 생성과 repository Actions 설정 자동화는 GitHub user OAuth 추가 승인으로 처리한다.

2026-07-07 구현 결정:

- MVP 구현은 먼저 GitHub App installation token으로 workflow PR 생성, Environment 생성, Actions variables upsert를 시도한다.
- GitHub 권한이 부족하면 `github_oauth_required`로 차단하고, handoff record를 저장하지 않거나 apply 결과를 실패로 반환한다.
- User OAuth 또는 GitHub App permission 보강은 같은 `github_oauth_required` 복구 경로로 이어지며, token 원문은 저장하지 않는다.
- Repository secrets는 원문 값을 받지 않는 한 실제 mutation하지 않고 preview 이름만 표시한다.

필수 권한:

- GitHub App: Contents read/write, Pull requests read/write, Actions read, Metadata read.
- User OAuth: workflow 파일 수정과 repository Actions settings/secrets/variables/environment 설정에 필요한 범위.

SketchCatch는 GitHub token, Actions secret 값, GitHub App private key를 DB, 로그, API 응답에 저장하거나 노출하지 않는다.

### AWS 권한

기존 AWS Connection role을 재사용한다.
GitHub Actions가 OIDC로 이 role을 assume할 수 있도록 다음 조건을 trust policy에 추가한다.

- GitHub repository owner/name
- target branch
- GitHub environment
- audience `sts.amazonaws.com`

변경은 항상 다음 순서로 진행한다.

```text
current IAM trust/policy read
-> required diff 생성
-> 사용자 승인
-> IAM update
-> STS/IAM verification
-> GitHub repository 설정
```

### Repository 자동 설정

SketchCatch는 선택된 repository에 다음을 자동 설정한다.

- environment: `sketchcatch-production`
- variables:
  - `SKETCHCATCH_AWS_REGION`
  - `SKETCHCATCH_AWS_ROLE_ARN`
  - `SKETCHCATCH_TF_STATE_BUCKET`
  - `SKETCHCATCH_TF_STATE_KEY`
  - `SKETCHCATCH_RELEASE_BUCKET`
  - `SKETCHCATCH_RDS_ENABLED`
- secrets:
  - 필요할 때만 암호화해 저장한다.
  - AWS static key는 사용하지 않는다.
- workflow files:
  - `.github/workflows/sketchcatch-infra.yml`
  - `.github/workflows/sketchcatch-app.yml`
  - `.github/workflows/sketchcatch-destroy.yml`

## Handoff 상태 모델

`GitCicdHandoff`는 하나의 record를 유지한다.
다만 infra/app workflow를 분리해 추적할 수 있도록 상세 상태를 확장한다.

필수 추가 필드:

- `sourceDeploymentId`
- `deploymentMode`: `"infra_and_app"`
- `requiresEnvironmentApproval`: `true`
- `pullRequestNumber`
- `mergeCommitSha`
- `environmentName`
- `infraPipelineRunUrl`
- `infraPipelineStatus`
- `appPipelineRunUrl`
- `appPipelineStatus`
- `destroyPipelineRunUrl`
- `destroyPipelineStatus`

summary status 규칙:

- PR open, not merged: `pr_created`
- PR closed without merge: `cancelled`
- PR merged, workflow waiting/running: `pipeline_running`
- infra 또는 app 중 하나라도 failed: `pipeline_failed`
- infra와 app 모두 success: `pipeline_success`

## Workflow 동작

### Infra workflow

- trigger: push to target branch, workflow_dispatch
- checkout
- Terraform setup
- S3 backend bucket/key 확인 또는 생성
- `terraform init`
- `terraform validate`
- `terraform plan`
- GitHub Environment approval
- `terraform apply`
- Terraform outputs 저장 또는 workflow artifact 업로드

RDS는 `SKETCHCATCH_RDS_ENABLED=true`일 때만 포함한다.

### App workflow

- infra workflow 성공 이후 실행되도록 구성한다.
- API/static runtime release artifact를 만든다.
- release artifact를 S3 release bucket에 업로드한다.
- Launch Template 또는 user data release id를 새 release로 갱신한다.
- ASG Instance Refresh를 실행한다.
- `static_site_url`과 `api_base_url`을 확인한다.
- 새 release marker가 응답에 포함되는지 검증한다.

in-place SSM 덮어쓰기만으로 앱을 배포하지 않는다.
ASG scale-out 후 새 인스턴스도 같은 release를 실행해야 한다.

### Destroy workflow

- trigger: workflow_dispatch
- GitHub Environment approval
- 같은 S3 backend로 `terraform destroy`
- S3 release artifact cleanup은 best-effort로 수행한다.
- cleanup 결과는 workflow log와 SketchCatch handoff 상태에 남긴다.

## UX 요구사항

Deployment Panel은 다음을 보여준다.

- GitHub repository 연결 상태
- GitHub OAuth 추가 승인 필요 여부
- AWS role trust/policy diff
- RDS opt-in 선택
- repository 자동 설정 preview
- PR URL
- PR merge 상태
- infra/app/destroy workflow URL과 상태
- environment approval 대기 여부
- static site URL 검증 결과
- API URL 검증 결과

사용자가 승인해야 하는 변경:

- GitHub OAuth 추가 승인
- AWS role trust/policy 변경
- GitHub repository Actions 설정
- Git/CI/CD handoff PR 생성
- RDS opt-in
- cleanup destroy 실행

## 실패 처리

- GitHub OAuth 권한 부족: handoff 생성 전 차단하고 재승인 CTA를 보여준다.
- workflow 파일 생성 실패: PR 생성 실패로 기록하고 secret 없는 오류를 보여준다.
- IAM diff 적용 실패: AWS role 변경 실패로 기록하고 GitHub 설정은 진행하지 않는다.
- environment approval 대기: 실패가 아니라 waiting 상태로 표시한다.
- infra workflow 실패: app workflow는 실행하지 않고 handoff summary를 failed로 표시한다.
- app workflow 실패: infra 성공과 app 실패를 분리해 표시한다.
- destroy 실패: cleanup risk로 남기고 다음 destroy 재시도 행동을 제시한다.

## 완료 기준

- SketchCatch에서 Git/CI/CD 자동 배포 PR을 생성할 수 있다.
- 사용자가 PR을 merge하면 infra workflow가 plan까지 자동 실행된다.
- environment approval 후 terraform apply가 실행된다.
- app workflow가 S3 release와 ASG Instance Refresh로 런타임을 교체한다.
- SketchCatch가 infra/app pipeline 상태와 URL 검증 결과를 보여준다.
- destroy workflow로 생성 리소스를 정리할 수 있다.
- `docs/sw/spec6.md`, `docs/sw/plan6.md`, `docs/sw/agents3.md`는 구현 중 계속 갱신된다.

## 2026-07-07 구현 반영 상태

이번 PR에서 구현된 것:

- `GitCicdHandoff` shared type, API DTO, DB schema에 infra/app/destroy 상세 pipeline 필드를 추가했다.
- `apps/api/drizzle/0026_git_cicd_infra_app_auto_deploy.sql` migration을 추가했다.
- GitHub PR 생성 시 Terraform artifact와 함께 infra/app/destroy workflow, repository settings preview, AWS role diff preview 파일을 생성한다.
- GitHub Actions 상태 polling은 PR number를 기준으로 PR merge 여부를 확인하고, merge commit SHA의 workflow runs에서 `SketchCatch Infra`, `SketchCatch App`, `SketchCatch Destroy` 상태를 분리해 집계한다.
- Deployment Panel의 handoff CTA를 `Git/CI/CD handoff 생성`으로 바꾸고, deployment source, environment approval, OAuth 필요 여부, IAM diff 상태, repo settings preview, infra/app/destroy workflow 상태, URL 검증 대상을 표시한다.

남은 외부 검증/후속 작업:

- GitHub user OAuth token으로 repository variables/secrets/environment를 실제 적용하는 mutation path는 아직 preview artifact 중심이다.
- AWS IAM trust/policy update executor는 아직 diff preview와 승인 metadata 중심이다.
- 실제 GitHub PR merge 후 workflow run, Environment approval, Terraform apply, S3 release, ASG Instance Refresh, destroy live smoke는 비용/자격증명/cleanup 승인 후 수행해야 한다.
## 2026-07-07 추가 구현 반영

- GitHub repository settings apply route를 추가했다: `POST /api/git-cicd-handoffs/:handoffId/repository-settings/apply`.
- 현재 repository settings apply는 GitHub App installation token으로 Environment 생성과 Actions variables upsert를 시도한다.
- GitHub 권한이 부족하면 `github_oauth_required` 에러로 fail-closed 처리하며, token 값은 저장하거나 응답하지 않는다.
- AWS role diff apply route를 추가했다: `POST /api/git-cicd-handoffs/:handoffId/aws-role-diff/apply`.
- AWS role diff apply는 승인된 `awsRoleDiff`와 `roleArn`이 있을 때만 IAM trust policy에 GitHub OIDC statement를 적용하고 다시 읽어 검증한다.
- Deployment Panel에는 `Repo settings 적용`, `AWS role diff 적용` 액션을 추가했고 성공 후 panel snapshot을 다시 로드한다.
- `scripts/smoke/git-cicd-auto-deploy.ps1`을 추가해 repository settings apply, role diff apply, pipeline status, static URL marker 확인을 한 report로 남길 수 있게 했다.
- 실제 PR merge, GitHub Environment approval, Terraform apply, S3 release, ASG Instance Refresh, destroy live smoke는 여전히 비용/자격증명/cleanup 승인 후 실행해야 한다.
