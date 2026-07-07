# 배포 운영 문서

SketchCatch 운영 배포는 Docker를 사용하지만 Docker Compose는 사용하지 않습니다. GitHub Actions가 Docker 이미지를 빌드하고 S3에 release artifact를 업로드한 뒤, AWS Systems Manager Run Command로 EC2에 배포 명령을 전달합니다. EC2 Amazon Linux 서버에서는 `docker run`으로 API, 웹, Nginx 컨테이너를 실행합니다.

이 문서는 SketchCatch 운영 배포와 사용자가 만든 IaC를 실행하는 경로를 구분합니다.

| 구분 | 의미 | 기준 |
| --- | --- | --- |
| 운영 배포 | SketchCatch 서비스 자체를 EC2에 배포 | Docker, S3 release artifact, SSM, Nginx |
| Direct Deployment Path | SketchCatch가 사용자가 승인한 IaC Preview를 직접 실행 | Terraform Plan/Apply/Destroy, approval, logs, cleanup |
| Git/CI/CD Deployment Path | SketchCatch가 IaC Preview를 Source Repository PR과 외부 pipeline으로 넘김 | Terraform commit/PR, pipeline template/status, team review |

## 핵심 서비스 실행 기준

1차 MVP의 최우선 실행 흐름은 아래와 같습니다.

```text
Requirement Input
→ Requirement Prompt
→ Architecture Draft
→ Architecture Board
→ IaC Preview
→ Pre-Deployment Check
→ User-Accepted Change
→ Direct Deployment Path 또는 Git/CI/CD Deployment Path
→ Deployment History
→ Auto Cleanup
```

Direct Deployment Path의 실제 live apply 리소스는 안정성을 위해 아래로 제한합니다.

- VPC
- Public Subnet
- Internet Gateway
- Route Table
- Security Group
- EC2
- S3 Bucket

RDS는 생성/삭제 시간과 비용 리스크가 크므로 기본 live apply 경로에서 제외합니다.
현재 cleanup은 사용자가 명시적으로 실행하는 Deployment destroy 흐름으로 처리합니다. 성공한 Deployment 또는 apply 도중 실패했지만 partial state가 저장된 Deployment만 cleanup 대상입니다.

## 사용자 Deployment 안전 정책

- 프론트엔드는 AWS SDK나 Terraform CLI를 직접 실행하지 않습니다.
- 실제 Terraform 실행은 API 서버 또는 future worker에서만 수행합니다.
- `terraform plan` 없이 `terraform apply`를 실행하지 않습니다.
- 사용자가 승인한 `tfplan`만 `apply`합니다.
- 승인 시점의 Terraform artifact hash, `tfplan` hash, AWS account/region이 Apply 직전 값과 다르면 실행하지 않습니다.
- `destroy`도 `terraform plan -destroy` → 사용자 승인 → 승인된 destroy `tfplan` apply 순서로만 실행합니다.
- AWS credential, token, DB password, Terraform sensitive output은 응답과 로그에 남기지 않습니다.
- 배포 로그는 단계, sequence, level, message를 유지합니다.
- 한 프로젝트에는 동시에 하나의 `RUNNING` Deployment만 허용합니다.
- 실행 중 취소 요청은 가능하지만, `terraform apply` 도중 취소되면 AWS 리소스가 일부 생성됐을 수 있으므로 `FAILED`와 확인 필요 summary를 남깁니다.
- Apply가 시작된 뒤 실패하거나 취소되면 가능한 경우 partial `terraform.tfstate`를 S3에 저장해 사용자가 명시 cleanup destroy를 실행할 수 있게 합니다.
- 서버 재시작 후 남은 `RUNNING` Deployment는 startup recovery에서 `FAILED`로 정리합니다.
- Representative Use Journey나 리허설 후 생성 리소스 cleanup을 반드시 확인합니다.

## Git/CI/CD Deployment Path 정책

Git/CI/CD Deployment Path는 운영 배포와 팀 리뷰를 위한 경로입니다. SketchCatch는 Terraform 파일을 Source Repository에 commit하거나 PR로 넘기고, 외부 pipeline 상태를 추적합니다.

- Git/CI/CD handoff도 User-Accepted Change 이후에만 생성합니다.
- Source Repository token, deploy key, CI secret 원문은 응답, 로그, DB에 저장하지 않습니다.
- PR에는 IaC Preview, Plan 요약, Pre-Deployment Check 결과, Cost Analysis 요약을 연결합니다.
- 운영 apply는 외부 pipeline의 승인 job이나 조직 정책을 따를 수 있지만, SketchCatch는 승인 없는 apply를 권장하거나 자동 실행하지 않습니다.
- Direct Deployment Path와 Git/CI/CD Deployment Path는 서로 경쟁하는 선택지가 아니라 사용 맥락이 다른 실행 경로입니다.
- Git/CI/CD 상태 polling과 long-running workflow status는 Redis Runtime Cache를 사용할 수 있지만, 최종 기록은 RDS/S3에 남깁니다.

## Direct Deployment Path 실행 순서

```text
1. AWS 연결 확인
2. Terraform artifact 복원
3. terraform init
4. terraform plan -out=tfplan
5. terraform show -json tfplan
6. show-json 결과에서 Plan summary 생성
7. Plan summary와 Pre-Deployment Check 표시
8. 사용자 승인
9. 승인 snapshot 재검증
10. terraform init
11. terraform apply tfplan
12. terraform output -json
13. terraform show -json
14. terraform.tfstate S3 업로드
15. Deployment History, TerraformOutput, DeployedResource 저장 후 SUCCESS 표시
16. cleanup 필요 시 terraform plan -destroy
17. 사용자 승인
18. destroy tfplan apply
19. DESTROYED 상태와 cleanup 결과 확인
```

완료 기준:

- Plan 실패 시 Apply 단계로 넘어가지 않습니다.
- 승인 전 계정, region, 생성/수정/삭제 리소스, 비용/위험 요약을 표시합니다.
- Plan 승인 화면의 최소 요약은 현재 `terraform show -json tfplan` 결과에서 생성합니다.
- Pre-Deployment Check와 Safety Gate warning은 Plan 결과에 보존하되 Plan record 자체를 blocked로 만들지 않습니다.
- Apply 성공 후 사용자가 확인할 수 있는 output을 표시합니다.
- Apply 실패 시 Deployment를 `FAILED`와 `failureStage: "apply"`로 남깁니다.
- AWS 연결 또는 STS credential 준비 실패는 `failureStage: "aws_connection"`으로 남깁니다.
- Apply 성공 후 output/state/resource inventory 수집이나 저장 실패는 성공을 뒤집지 않고 경고로 남깁니다.
- `terraform show -json` 기반 resource inventory는 Apply 완료 저장 시 `TerraformOutput`과 함께 저장합니다.
- Resource inventory 수집이 실패하거나 취소되면 `GET /api/deployments/:deploymentId/resources`는 빈 목록을 반환할 수 있습니다.
- Terraform sensitive output은 로그와 응답에 실제 값을 남기지 않습니다.
- `tfplan`, `terraform.tfstate`, `.terraform.lock.hcl`은 deployment scope object key, server-side encryption, metadata/tag, checksum을 적용해 S3에 저장합니다.
- `.terraform.lock.hcl`은 성능 최적화용 provider lock artifact이므로 누락되거나 복원에 실패해도 Deployment 실행을 실패시키지 않습니다.
- Destroy 성공 시 Deployment는 `DESTROYED`가 되고 `stateObjectKey`, 현재 Plan pointer, DeployedResource, TerraformOutput을 정리합니다.
- Destroy 실패 시 Deployment는 `FAILED`와 `failureStage: "destroy"`로 남기며, 재시도하려면 새 destroy plan과 승인이 필요합니다.

## Deployment 기록과 artifact 정리

Deployment 생성 후 프로젝트 단위로 오래된 실행 기록과 사용하지 않는 저장물을 정리합니다. 기본값은
프로젝트별 최신 Deployment 20개, 미사용 TerraformArtifact 5개, 미사용 ArchitectureSnapshot 5개를
유지하는 것입니다.

다음 Deployment는 개수 제한을 넘어도 삭제하지 않습니다.

- `RUNNING`
- `SUCCESS`
- `stateObjectKey`가 남은 `FAILED`
- `failureStage: "destroy"`인 `FAILED`

위 기록은 실제 리소스 상태 확인, output 조회, destroy 재시도에 필요할 수 있기 때문입니다. 삭제 가능한
오래된 Deployment를 정리하면 연결된 Plan artifact, log, resource, output metadata는 DB cascade로 함께
정리하고, S3의 `tfplan`, `terraform.tfstate`, `.terraform.lock.hcl`, Terraform 파일 object는 best-effort로
삭제합니다. S3 삭제 실패는 새 Deployment 생성을 실패시키지 않고 경고 로그로 남깁니다.

## 운영 구조

```text
GitHub Actions
-> pnpm lint/typecheck/build
-> Docker image 빌드
-> docker save로 release artifact 생성
-> S3 업로드
-> SSM Run Command로 EC2 배포 명령 실행
-> EC2에서 docker load
-> api/web/nginx 컨테이너 재시작
```

## EC2 정보

```text
호스트: 13.125.49.82
인스턴스 ID: i-02a591d2abee94f02
OS: Amazon Linux
```

운영 배포는 SSH 대신 SSM을 사용합니다. EC2에는 SSM Agent가 실행되어야 하고, EC2 Instance Profile에는 다음 AWS 관리형 정책이 필요합니다.

```text
AmazonSSMManagedInstanceCore
```

## GitHub 변수

GitHub repository의 `production` 환경 변수에는 다음 값을 설정합니다.

```text
AWS_REGION=ap-northeast-2
AWS_ROLE_TO_ASSUME=<GitHub Actions OIDC Role ARN>
DEPLOY_ARTIFACT_BUCKET=sketchcatch-555980271919-ap-northeast-2-an
S3_BUCKET_NAME=sketchcatch-555980271919-ap-northeast-2-an
EC2_INSTANCE_ID=i-02a591d2abee94f02
RDS_ENDPOINT=<RDS 엔드포인트>
DATABASE_SSL=true
TF_PLUGIN_CACHE_DIR=/var/cache/sketchcatch/terraform-plugin-cache
CLOUDWATCH_LOGS_ENABLED=false
CLOUDWATCH_LOG_GROUP_PREFIX=/sketchcatch/production
```

`TF_PLUGIN_CACHE_DIR`은 Terraform provider plugin cache 위치입니다. 운영 배포 스크립트는 EC2 host의 같은 경로를 API 컨테이너에 volume mount하므로, API 컨테이너가 교체되어도 provider cache를 재사용할 수 있습니다.

## GitHub 비밀값

```text
DATABASE_URL=<RDS PostgreSQL 연결 문자열>
AUTH_TOKEN_SECRET=<32자 이상 인증 token 서명 secret>
CLOUDFORMATION_TEMPLATE_TOKEN_SECRET=<32자 이상 CloudFormation template URL 서명 secret>
```

실제 DB 비밀번호, AWS Access Key, SSH private key는 저장소에 커밋하지 않습니다.

## IAM 권한

정책 템플릿은 `infra/aws/iam/` 아래에 있습니다.

- `github-actions-deploy-policy.json`: `GitHubActionsDeployRole`에 연결할 배포 권한
- `ec2-runtime-policy.json`: `SketchCatch-EC2-Role`에 연결할 런타임 권한

`SketchCatch-EC2-Role`에는 AWS 관리형 정책 `AmazonSSMManagedInstanceCore`도 유지해야 합니다.

사용자 AWS 계정 연결은 SketchCatch가 생성한 CloudFormation Quick Create URL로 `SketchCatchTerraformExecutionRole`을 만드는 방식을 기본으로 합니다. 템플릿은 External ID가 포함된 trust policy와 MVP demo용 `AWS::IAM::Policy`를 함께 생성합니다. 정책 이름은 Stack 이름을 포함해 같은 Role에 고정 이름 inline policy를 다시 붙이는 충돌을 줄입니다. MVP demo 권한은 VPC, Subnet, Internet Gateway, Route Table, Security Group, EC2, S3 실습을 막힘 없이 검증하기 위해 `ec2:*`와 `s3:*`를 허용합니다. 비용관리의 실제 사용량 분석을 위해 같은 Role에는 `ce:GetCostAndUsage`, `ce:GetDimensionValues`, `cloudwatch:GetMetricData`, `cloudwatch:GetMetricStatistics` read-only 권한도 포함합니다. 사용자는 stack 생성 후 AWS account ID만 SketchCatch에 입력하고, API는 `arn:aws:iam::<accountId>:role/SketchCatchTerraformExecutionRole`을 계산해 STS AssumeRole 검증을 수행합니다.

## CloudWatch Logs

Docker 컨테이너 로그는 Docker `awslogs` log driver로 CloudWatch Logs에 보낼 수 있습니다.

1. `infra/aws/iam/ec2-runtime-policy.json`을 `SketchCatch-EC2-Role`에 연결합니다.
2. GitHub 변수 `CLOUDWATCH_LOGS_ENABLED=true`로 설정합니다.
3. `CLOUDWATCH_LOG_GROUP_PREFIX=/sketchcatch/production`을 유지합니다.
4. `Deploy Production` 워크플로를 다시 실행합니다.

예상 로그 그룹:

```text
/sketchcatch/production/api
/sketchcatch/production/web
/sketchcatch/production/nginx
```

알람 설정 예시는 `infra/aws/cloudwatch-alarms.md`에 있습니다.

## HTTPS

`sketchcatch.net` 운영 HTTPS는 다음 조합으로 구성합니다.

- Route 53 hosted zone
- ACM DNS 검증 인증서
- Public Application Load Balancer
- HTTP에서 HTTPS로 리다이렉트
- ALB target group에서 EC2 Nginx port 80으로 전달

GitHub Actions의 `Provision HTTPS` 워크플로를 다음 입력으로 실행합니다.

```text
domain_name=sketchcatch.net
```

이 워크플로는 `infra/aws/cloudformation/alb-https.yml`을 배포합니다.

실행 전에 `infra/aws/iam/github-actions-deploy-policy.json`의 권한을 `GitHubActionsDeployRole`에 반영해야 합니다.

성공 후 확인:

```bash
curl -I https://sketchcatch.net
curl https://sketchcatch.net/health
curl https://sketchcatch.net/health/db
```

ALB 확인 후 EC2 security group은 port 80을 ALB security group에서만 받도록 제한합니다. EC2에 직접 public `0.0.0.0/0:80`을 열어둘 필요는 없습니다.

## 모니터링

GitHub Actions의 `Provision Monitoring` 워크플로를 실행합니다.

```text
alarm_email=<알림 이메일>
```

AWS가 구독 확인 이메일을 보냅니다. 이메일 구독을 승인해야 알람이 실제로 전송됩니다.

## RDS와 S3 저장 기준

RDS에 저장하는 데이터:

- 사용자 계정
- refresh token hash와 로그인 시도 이력
- 프로젝트 정보
- 아키텍처 JSON
- S3 파일 메타데이터
- Deployment Plan artifact 메타데이터(object key, hash, account, region)
- 향후 배포 이력과 비용 정보

S3에 저장하는 데이터:

- 다이어그램 PNG/SVG
- Terraform 파일
- Terraform Plan `tfplan` 바이너리
- Terraform state `terraform.tfstate`
- Terraform provider lock `.terraform.lock.hcl`
- 프로젝트 export zip
- 프로젝트 썸네일

Redis Runtime Cache는 Deployment, Reverse Engineering, Git/CI/CD Integration 상태 추적을 우선 지원합니다. AI 결과물 캐싱은 2순위이며, 캐시된 결과가 RDS/S3의 원천 기록이나 Deployment Safety Gate를 대체하지 않습니다.

`REDIS_URL`이 설정된 API runtime은 Redis Runtime Cache adapter를 사용합니다. `REDIS_URL`이 비어 있거나 `NODE_ENV=test`이면 in-memory fallback을 사용합니다. Redis 연결 또는 명령 실패는 long-running workflow의 보조 상태를 degraded로 만들 수 있지만, Deployment 원천 기록과 artifact는 계속 RDS/S3를 기준으로 확인해야 합니다.

## GitHub App 기반 Source Repository 연결

Git/CI/CD Deployment Path의 운영 repository 연결은 GitHub App 설치 흐름을 기본 경로로 사용합니다. Web은 GitHub App state를 직접 만들지 않고 API가 발급한 install URL로 redirect만 수행합니다.

API runtime 필수 환경 변수:

```text
GIT_APP_ID=
GIT_APP_SLUG=
GIT_APP_PRIVATE_KEY_BASE64=
GIT_APP_CALLBACK_URL=
GIT_APP_STATE_SECRET=
```

`GIT_APP_PRIVATE_KEY_BASE64`는 GitHub App private key PEM을 base64로 인코딩한 값입니다. `GIT_APP_STATE_SECRET`은 선택값이며, 비워 두면 `AUTH_TOKEN_SECRET`으로 short-lived state를 서명합니다.

GitHub App repository permissions는 다음으로 고정합니다.

- Contents: Read and write
- Pull requests: Read and write
- Actions: Read-only
- Metadata: Read-only

GitHub App 설치 callback 흐름:

```text
GitHub -> Web /integrations/github/callback?installation_id=...&state=...
Web -> API /source-repositories/github/installation-repositories
API -> GitHub installation repositories 조회
Web -> repository 1개 선택
Web -> API /projects/:projectId/source-repositories/github
API -> 기존 active GitHub repo soft deactivate 후 새 active repo 저장
```

## 운영 Redis / ElastiCache 연결

Redis는 SketchCatch API의 내부 Runtime Cache입니다. 제품 resource catalog, Architecture Board, Terraform generator에는 Redis를 추가하지 않습니다.

운영에서는 `infra/aws/cloudformation/runtime-cache-elasticache.yml`로 ElastiCache Redis를 생성한 뒤 output `RedisUrl`을 API runtime의 `REDIS_URL`로 주입합니다. 이 리소스는 비용이 발생하며, API runtime security group에서만 접근 가능하게 제한해야 합니다.

검증 대상:

- Deployment log cursor가 Runtime Cache를 사용할 수 있는지
- Git/CI/CD pipeline status cache가 Runtime Cache를 사용할 수 있는지
- Redis 장애 또는 미설정 시 in-memory fallback으로 degraded 동작이 가능한지

로컬 검증:

```powershell
docker compose -f infra/local/docker-compose.yml up -d postgres redis
$env:REDIS_URL="redis://localhost:6379"
pnpm --filter @sketchcatch/api test -- runtime-cache
```

## Live S3 Deployment Smoke

실제 AWS apply/destroy smoke는 tracked Terraform fixture를 사용하지 않습니다. runner가 실행 시 고유 bucket 이름과 Terraform 문자열을 생성하고, 기존 project asset upload API로 업로드합니다.

사전 준비:

- API 서버가 실제 AWS connection을 사용할 수 있어야 합니다.
- `AWS_CONNECTION_ID`는 사전에 SketchCatch에 생성되어 verified 상태여야 합니다.
- smoke AWS 범위는 S3 bucket 1개입니다.
- bucket 이름은 `sketchcatch-smoke-<account-id>-<region>-<short-run-id>` 형식입니다.

실행:

```powershell
$env:API_BASE_URL="https://<api-host>"
$env:ACCESS_TOKEN="<existing-access-token>"
$env:AWS_CONNECTION_ID="<verified-aws-connection-id>"
$env:SMOKE_ACCOUNT_ID="<aws-account-id>"
$env:AWS_REGION="ap-northeast-2"
.\scripts\smoke\live-s3-deployment.ps1
```

`ACCESS_TOKEN`이 없을 때는 다음 순서로 인증합니다.

1. `SMOKE_EMAIL` / `SMOKE_PASSWORD`로 login
2. login 실패 시 `SMOKE_CREATE_USER=true`일 때만 signup 후 login

smoke report에는 bucket name, deployment id, apply 결과, destroy 결과, resources/outputs/logs count만 남깁니다. token, AWS credential, private key는 report에 포함하지 않습니다.

## 수동 마이그레이션

마이그레이션은 배포 중 자동 실행하지 않습니다. GitHub Actions의 `Run Database Migrations` 워크플로를 수동 실행합니다.

마이그레이션 워크플로는 SSM Run Command로 EC2에 명령을 보내고, EC2에서 현재 배포된 API Docker image의 1회성 컨테이너를 실행합니다. 이때 `/etc/sketchcatch/api.env`의 `DATABASE_URL`을 사용합니다.

## 배포 확인

```bash
curl http://13.125.49.82
curl http://13.125.49.82/health
curl http://13.125.49.82/health/db
```

EC2 내부 확인:

```bash
docker ps
docker logs sketchcatch-web
docker logs sketchcatch-api
docker logs sketchcatch-nginx
```

## API 확인 예시

회원가입 또는 로그인:

```bash
curl -X POST http://13.125.49.82/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "demo-user",
    "email": "demo@example.com",
    "nickname": "데모 사용자",
    "password": "demo-password-123"
  }'
```

응답의 `session.accessToken`을 `ACCESS_TOKEN`에 넣은 뒤 프로젝트 API를 확인합니다.

프로젝트 생성:

```bash
curl -X POST http://13.125.49.82/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "첫 아키텍처",
    "description": "배포 확인용 프로젝트"
  }'
```

S3 presigned upload URL 발급:

```bash
curl -X POST http://13.125.49.82/api/projects/<project-id>/assets/presigned-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "assetType": "diagram_png",
    "fileName": "diagram.png",
    "contentType": "image/png"
  }'
```

## 롤백

이전 Docker image artifact로 컨테이너를 다시 실행합니다.

```bash
sudo env RELEASE_ID=<previous-sha> RELEASE_URL=<previous-image-archive-presigned-url> \
  bash /tmp/sketchcatch-deploy.sh
```
