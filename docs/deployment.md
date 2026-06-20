# 배포 운영 문서

SketchCatch 운영 배포는 Docker를 사용하지만 Docker Compose는 사용하지 않습니다. GitHub Actions가 Docker 이미지를 빌드하고 S3에 release artifact를 업로드한 뒤, AWS Systems Manager Run Command로 EC2에 배포 명령을 전달합니다. EC2 Amazon Linux 서버에서는 `docker run`으로 API, Web, Nginx 컨테이너를 실행합니다.

## 운영 구조

```text
GitHub Actions
-> pnpm lint/typecheck/build
-> Docker image build
-> docker save release artifact 생성
-> S3 업로드
-> SSM Run Command로 EC2 배포 명령 실행
-> EC2에서 docker load
-> api/web/nginx 컨테이너 재시작
```

## EC2 정보

```text
Host: 13.125.49.82
Instance ID: i-02a591d2abee94f02
OS: Amazon Linux
```

운영 배포는 SSH 대신 SSM을 사용합니다. EC2에는 SSM Agent가 실행되어야 하고, EC2 Instance Profile에는 다음 AWS managed policy가 필요합니다.

```text
AmazonSSMManagedInstanceCore
```

## GitHub Variables

GitHub repository의 `production` environment variables에는 다음 값을 설정합니다.

```text
AWS_REGION=ap-northeast-2
AWS_ROLE_TO_ASSUME=<GitHub Actions OIDC Role ARN>
DEPLOY_ARTIFACT_BUCKET=sketchcatch-555980271919-ap-northeast-2-an
S3_BUCKET_NAME=sketchcatch-555980271919-ap-northeast-2-an
EC2_INSTANCE_ID=i-02a591d2abee94f02
RDS_ENDPOINT=<RDS endpoint>
DATABASE_SSL=true
CLOUDWATCH_LOGS_ENABLED=false
CLOUDWATCH_LOG_GROUP_PREFIX=/sketchcatch/production
```

## GitHub Secrets

```text
DATABASE_URL=<RDS PostgreSQL connection string>
```

실제 DB 비밀번호, AWS Access Key, SSH private key는 저장소에 커밋하지 않습니다.

## IAM 권한

정책 템플릿은 `infra/aws/iam/` 아래에 있습니다.

- `github-actions-deploy-policy.json`: `GitHubActionsDeployRole`에 연결할 배포 권한
- `ec2-runtime-policy.json`: `SketchCatch-EC2-Role`에 연결할 런타임 권한

`SketchCatch-EC2-Role`에는 AWS managed policy `AmazonSSMManagedInstanceCore`도 유지해야 합니다.

## CloudWatch Logs

Docker container log는 Docker `awslogs` log driver로 CloudWatch Logs에 보낼 수 있습니다.

1. `infra/aws/iam/ec2-runtime-policy.json`을 `SketchCatch-EC2-Role`에 연결합니다.
2. GitHub variable `CLOUDWATCH_LOGS_ENABLED=true`로 설정합니다.
3. `CLOUDWATCH_LOG_GROUP_PREFIX=/sketchcatch/production`을 유지합니다.
4. `Deploy Production` workflow를 다시 실행합니다.

예상 log group:

```text
/sketchcatch/production/api
/sketchcatch/production/web
/sketchcatch/production/nginx
```

알람 설정 예시는 `infra/aws/cloudwatch-alarms.md`에 있습니다.

## HTTPS

`sketchcatch.net` 운영 HTTPS는 다음 조합으로 구성합니다.

- Route 53 hosted zone
- ACM DNS validated certificate
- Public Application Load Balancer
- HTTP to HTTPS redirect
- ALB target group에서 EC2 Nginx port 80으로 forwarding

GitHub Actions의 `Provision HTTPS` workflow를 다음 입력으로 실행합니다.

```text
domain_name=sketchcatch.net
```

이 workflow는 `infra/aws/cloudformation/alb-https.yml`을 배포합니다.

실행 전에 `infra/aws/iam/github-actions-deploy-policy.json`의 권한을 `GitHubActionsDeployRole`에 반영해야 합니다.

성공 후 확인:

```bash
curl -I https://sketchcatch.net
curl https://sketchcatch.net/health
curl https://sketchcatch.net/health/db
```

ALB 확인 후 EC2 security group은 port 80을 ALB security group에서만 받도록 제한합니다. EC2에 직접 public `0.0.0.0/0:80`을 열어둘 필요는 없습니다.

## Monitoring

GitHub Actions의 `Provision Monitoring` workflow를 실행합니다.

```text
alarm_email=<notification email>
```

AWS가 구독 확인 이메일을 보냅니다. 이메일 구독을 승인해야 알람이 실제로 전송됩니다.

## RDS와 S3 저장 기준

RDS에 저장하는 데이터:

- 익명 workspace
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

마이그레이션은 배포 중 자동 실행하지 않습니다. GitHub Actions의 `Run Database Migrations` workflow를 수동 실행합니다.

마이그레이션 workflow는 SSM Run Command로 EC2에 명령을 보내고, EC2에서 현재 배포된 API Docker image의 1회성 컨테이너를 실행합니다. 이때 `/etc/sketchcatch/api.env`의 `DATABASE_URL`을 사용합니다.

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

프로젝트 생성:

```bash
curl -X POST http://13.125.49.82/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "clientGeneratedWorkspaceId": "local-browser-1",
    "name": "Hello Architecture",
    "description": "Deployment smoke project"
  }'
```

S3 presigned upload URL 발급:

```bash
curl -X POST http://13.125.49.82/api/projects/<project-id>/assets/presigned-upload \
  -H "Content-Type: application/json" \
  -d '{
    "clientGeneratedWorkspaceId": "local-browser-1",
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
