# 배포 운영 문서

SketchCatch 운영 배포는 Docker를 사용하지만 Docker Compose는 사용하지 않습니다. GitHub Actions가 Docker 이미지를 빌드해 S3에 업로드하고, AWS Systems Manager Run Command로 EC2에 배포 명령을 전달합니다. EC2는 Amazon Linux 서버에서 `docker run`으로 API, Web, Nginx 컨테이너를 실행합니다.

## 운영 구조

```text
GitHub Actions
→ pnpm lint/typecheck/build
→ Docker 이미지 빌드
→ docker save 이미지 아티팩트 생성
→ S3 업로드
→ SSM Run Command로 EC2 배포 명령 실행
→ docker load
→ docker run으로 api/web/nginx 컨테이너 재시작
```

## EC2 정보

```text
Host: 13.125.49.82
Instance ID: i-02a591d2abee94f02
OS: Amazon Linux
```

운영 배포는 SSH를 사용하지 않습니다. EC2에는 SSM Agent가 동작해야 하며, EC2 Instance Profile에는 다음 AWS managed policy가 필요합니다.

```text
AmazonSSMManagedInstanceCore
```

## GitHub Variables

GitHub repository 또는 `production` environment variables에 다음 값을 설정합니다.

```text
AWS_REGION=ap-northeast-2
AWS_ROLE_TO_ASSUME=<이미 만든 GitHub Actions OIDC Role ARN>
DEPLOY_ARTIFACT_BUCKET=sketchcatch-555980271919-ap-northeast-2-an
S3_BUCKET_NAME=sketchcatch-555980271919-ap-northeast-2-an
EC2_INSTANCE_ID=i-02a591d2abee94f02
RDS_ENDPOINT=<RDS endpoint>
DATABASE_SSL=false
```

## GitHub Secrets

```text
DATABASE_URL=<RDS PostgreSQL connection string>
```

실제 DB 비밀번호와 AWS Access Key는 저장소에 커밋하지 않습니다.

## IAM 권한

GitHub Actions OIDC Role에는 S3 아티팩트 업로드와 SSM 명령 실행 권한이 필요합니다.

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:PutObject",
    "s3:GetObject",
    "s3:DeleteObject",
    "s3:ListBucket",
    "ssm:SendCommand",
    "ssm:GetCommandInvocation",
    "ec2:DescribeInstances"
  ],
  "Resource": "*"
}
```

운영 환경에서는 위 정책을 실제 버킷 ARN, EC2 인스턴스 ARN, SSM 문서 ARN으로 좁혀야 합니다.

## RDS와 S3 저장 기준

RDS에 저장하는 데이터:

- 익명 워크스페이스
- 프로젝트 정보
- 아키텍처 JSON
- S3 파일 메타데이터

S3에 저장하는 데이터:

- 다이어그램 PNG/SVG
- Terraform 파일
- 프로젝트 export zip
- 프로젝트 썸네일

AI 결과물 캐싱은 MVP 범위에 포함하지 않습니다.

## 수동 마이그레이션

마이그레이션은 배포 중 자동 실행하지 않습니다. GitHub Actions의 `Run Database Migrations` workflow를 수동 실행합니다.

마이그레이션은 SSM Run Command로 EC2에 명령을 보내 실행합니다. EC2에 배포된 현재 API Docker 이미지에서 1회성 컨테이너를 실행하며 `/etc/sketchcatch/api.env`의 `DATABASE_URL`을 사용합니다.

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

S3 presigned 업로드 URL 발급:

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

이전 Docker 이미지 태그로 컨테이너를 다시 실행합니다.

```bash
sudo env RELEASE_ID=<previous-sha> RELEASE_URL=<previous-image-archive-presigned-url> \
  bash /tmp/sketchcatch-deploy.sh
```
