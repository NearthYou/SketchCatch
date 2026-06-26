# 배포 운영 문서

SketchCatch 운영 배포는 Docker를 사용하지만 Docker Compose는 사용하지 않습니다. GitHub Actions가 Docker 이미지를 빌드하고 S3에 release artifact를 업로드한 뒤, AWS Systems Manager Run Command로 EC2에 배포 명령을 전달합니다. EC2 Amazon Linux 서버에서는 `docker run`으로 API, 웹, Nginx 컨테이너를 실행합니다.

이 문서는 두 종류의 배포를 구분합니다.

| 구분 | 의미 | 기준 |
| --- | --- | --- |
| 운영 배포 | SketchCatch 서비스 자체를 EC2에 배포 | Docker, S3 release artifact, SSM, Nginx |
| 사용자 Deployment | 사용자가 승인한 IaC Preview를 실제 AWS 리소스에 반영 | Terraform Plan/Apply/Destroy, approval, logs, cleanup |

## AWS E2E 데모 기준

1차 MVP의 최우선 데모는 아래 흐름입니다.

```text
Requirement Prompt
→ Architecture Draft
→ Architecture Board
→ IaC Preview
→ Pre-Deployment Check
→ Terraform Plan
→ 사용자 승인
→ Terraform Apply
→ Outputs 확인
→ Deployment History 확인
→ Destroy/Cleanup
```

4일 데모의 실제 live apply 리소스는 안정성을 위해 아래로 제한합니다.

- VPC
- Public Subnet
- Internet Gateway
- Route Table
- Security Group
- EC2
- S3 Bucket

RDS는 생성/삭제 시간과 비용 리스크가 크므로 기본 live apply 경로에서 제외합니다.

## 사용자 Deployment 안전 정책

- 프론트엔드는 AWS SDK나 Terraform CLI를 직접 실행하지 않습니다.
- 실제 Terraform 실행은 API 서버 또는 future worker에서만 수행합니다.
- `terraform plan` 없이 `terraform apply`를 실행하지 않습니다.
- 사용자가 승인한 `tfplan`만 `apply`합니다.
- `destroy`는 apply와 별도 승인 흐름을 둡니다.
- AWS credential, token, DB password, Terraform sensitive output은 응답과 로그에 남기지 않습니다.
- 배포 로그는 단계, sequence, level, message를 유지합니다.
- 데모 후 생성 리소스 cleanup을 반드시 확인합니다.

## 사용자 Deployment 실행 순서

```text
1. AWS 연결 확인
2. Terraform artifact 복원
3. terraform init
4. terraform validate
5. terraform plan -out=tfplan
6. terraform show -json tfplan
7. Plan summary와 Pre-Deployment Check 표시
8. 사용자 승인
9. terraform apply tfplan
10. terraform output -json
11. Deployment History 저장
12. destroy/cleanup
```

완료 기준:

- Plan 실패 시 Apply 단계로 넘어가지 않습니다.
- 승인 전 계정, region, 생성/수정/삭제 리소스, 비용/위험 요약을 표시합니다.
- Apply 성공 후 사용자가 확인할 수 있는 output을 표시합니다.
- Destroy 실패를 성공으로 표시하지 않습니다.
- 남은 리소스가 있으면 사용자에게 명확히 보여줍니다.

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
CLOUDWATCH_LOGS_ENABLED=false
CLOUDWATCH_LOG_GROUP_PREFIX=/sketchcatch/production
```

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
- 향후 배포 이력과 비용 정보

S3에 저장하는 데이터:

- 다이어그램 PNG/SVG
- Terraform 또는 CloudFormation 파일
- 프로젝트 export zip
- 프로젝트 썸네일

AI 결과물 캐싱은 MVP 범위에 포함하지 않습니다.

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
