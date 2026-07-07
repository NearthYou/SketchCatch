# Demo Web Service E2E 스펙

## 목적

이 문서는 SketchCatch 발표용 대표 여정인 `S3 정적 웹사이트 -> EC2 API -> ALB -> ASG -> RDS -> CI/CD`를 실제 서비스 흐름으로 증명하기 위한 스펙이다.

핵심 목표는 데모 전용 스크립트가 아니라 SketchCatch의 기존 `Requirement Input -> Architecture Board -> IaC Preview -> Pre-Deployment Check -> Direct Deployment 또는 Git/CI/CD -> Deployment History -> Auto Cleanup` 경로를 확장하는 것이다.

## 확정 범위

- S3 정적 웹사이트는 실제 AWS live apply/destroy 대상으로 만든다.
- EC2 API는 실제 AWS live apply/destroy 대상으로 만든다.
- ALB와 ASG는 실제 AWS live apply/destroy 대상으로 만든다.
- RDS는 기본 live apply 대상이 아니라 Preview, Cost Analysis, Pre-Deployment Check 대상으로 둔다.
- RDS live apply는 별도 profile과 명시 확인이 있을 때만 허용한다.
- 트래픽 증가는 실제 부하 테스트가 아니라 UI Simulation으로 보여준다.
- CI/CD는 Static Site Pipeline으로 구현한다. GitHub Actions가 S3 static site 파일 변경을 배포하고 SketchCatch가 PR, pipeline status, static site URL을 추적한다.

## 비범위

- 실제 ASG scale-out 강제 부하 테스트는 하지 않는다.
- RDS를 기본 Direct Deployment Path에 포함하지 않는다.
- 사용자가 임의로 입력한 EC2 `user_data`는 허용하지 않는다.
- EC2 API 애플리케이션 소스 변경까지 GitHub Actions로 배포하지 않는다.
- HTTPS, ACM, CloudFront는 기본 demo path에 포함하지 않는다.

## Deployment Live Profile

Direct Deployment는 live apply 허용 범위를 profile로 구분한다.

```ts
type DeploymentLiveProfile =
  | "practice"
  | "demo_web_service"
  | "demo_web_service_with_rds";
```

- `practice`: 기존 안전 범위다. VPC, Subnet, Internet Gateway, Route Table, Security Group, EC2, S3 Bucket 중심으로 제한한다.
- `demo_web_service`: S3 static website, EC2 API, ALB, Launch Template, ASG를 허용한다.
- `demo_web_service_with_rds`: `demo_web_service`에 RDS 관련 리소스를 추가로 허용한다. 이 profile은 별도 확인과 cleanup 경고가 필요하다.

## Managed User Data

EC2 API 서버 부팅은 `aws_launch_template.user_data`를 사용하되, SketchCatch가 생성한 managed demo bootstrap만 허용한다.

허용 조건:

- `user_data`는 base64 literal이어야 한다.
- decode 결과에 SketchCatch demo marker가 있어야 한다.
- marker와 스크립트 hash가 expected metadata와 일치해야 한다.
- API 서버는 `/health`와 `/api/status`를 제공해야 한다.

차단 조건:

- `aws_instance.user_data`
- 사용자가 직접 입력한 임의 bootstrap
- heredoc user data
- `file`, `templatefile`, `filebase64` 계열 함수
- `connection`, `provisioner`, `dynamic` block

## Demo Web Service Architecture

기본 demo architecture는 다음 리소스를 만든다.

- VPC
- 2개 public subnet
- Internet Gateway
- Route Table과 association
- ALB security group
- EC2 API security group
- S3 website bucket
- S3 website configuration
- S3 bucket policy
- `index.html` S3 object
- demo image S3 object
- Launch Template
- Auto Scaling Group
- ALB
- ALB Target Group
- ALB Listener

EC2 API 서버는 port `8080`에서 실행한다. ALB health check는 `/health`를 사용한다. `/api/status`는 instance id, AZ, run id를 반환한다.

## Outputs

Demo deployment는 최소 다음 Terraform outputs를 제공한다.

- `static_site_url`
- `static_site_bucket`
- `alb_dns_name`
- `api_base_url`
- `asg_name`

Web Deployment 패널은 위 output을 별도 demo card로 보여준다.

## S3 Static Site

`index.html`은 다음을 수행한다.

- 사용자가 URL로 접속하면 실제 페이지가 열린다.
- `api_base_url`을 사용해 `/api/status`를 호출한다.
- 응답 instance id 또는 run id를 화면에 표시한다.
- demo image object를 함께 표시한다.

정적 사이트 공개는 bucket ACL이 아니라 제한된 read-only bucket policy로 처리한다.

## Traffic Simulation

트래픽 시뮬레이터는 실제 부하를 만들지 않는다.

표시 항목:

- 예상 동시 사용자 수
- 현재 ASG desired/max capacity
- 예상 병목
- 권장 desired capacity
- ALB/ASG/RDS 개선 제안

UI에는 실제 scale-out 실행이 아니라 simulation이라는 점을 명확히 표시한다.

## Static Site CI/CD

Git/CI/CD handoff는 두 종류를 지원한다.

```ts
type GitCicdHandoffKind = "terraform" | "static_site";
```

`static_site` handoff는 Source Repository PR에 다음 파일을 추가하거나 갱신한다.

- `site/index.html`
- `site/assets/demo.svg`
- `.github/workflows/sketchcatch-static-site.yml`

workflow는 repository 환경 변수와 secret을 사용한다.

- `AWS_REGION`
- `AWS_ROLE_TO_ASSUME`
- `STATIC_SITE_BUCKET`
- `STATIC_SITE_URL`

SketchCatch는 PR URL, pipeline run URL, pipeline status, static site URL을 Deployment 패널에 표시한다.

## Smoke

`scripts/smoke/live-demo-web-service.ps1`은 API 호출만으로 다음을 수행한다.

1. project 생성
2. architecture snapshot 생성
3. demo Terraform artifact 업로드
4. deployment 생성
5. init
6. plan
7. approve
8. apply
9. `static_site_url` HTTP 200 확인
10. `api_base_url/health` HTTP 200 확인
11. ALB HTTP 200 확인
12. resources, outputs, logs 조회
13. destroy plan
14. approve
15. destroy
16. smoke report 저장

smoke report에는 token, AWS credential, private key, presigned secret URL을 저장하지 않는다.
