# Demo Web Service E2E 구현 마일스톤

## 원칙

- 구현 기준 문서는 `docs/sw/spec5.md`다.
- 변경 순서는 shared types, API DTO/schema, deployment safety, Terraform renderer, Web UI, smoke 순서로 진행한다.
- 실제 AWS mutation은 plan, approval, log, masking, cleanup 경계를 반드시 통과한다.
- RDS는 기본 live apply 대상이 아니다.
- 트래픽 증가는 UI Simulation으로 보여준다.

## M0. 문서, 이슈, 브랜치 정리

- Priority: P0
- Issue: #189
- Branch: `feature/sw/189-196-demo-web-service-e2e`

목표:

- Demo Web Service E2E 범위와 실행 계획을 고정한다.

주요 변경:

- `docs/sw/spec5.md` 작성
- `docs/sw/plan5.md` 작성
- `docs/sw/agents.md` 작성
- `docs/sw/README.md` 링크 추가

완료 기준:

- 구현자가 문서만 보고 live 범위, CI/CD 범위, safety 정책, smoke 기준을 이해할 수 있다.

테스트:

- `pnpm harness:check`
- markdown link 대상 수동 확인

## M1. Resource catalog와 Terraform Preview 확장

- Priority: P0
- Issue: #190
- Branch: `feature/sw/190-demo-resource-catalog`

목표:

- Demo Web Service에 필요한 리소스를 1급 Terraform resource로 표현한다.

주요 변경:

- `aws_s3_object`, `aws_s3_bucket_website_configuration`, `aws_s3_bucket_policy` 추가
- `aws_lb`, `aws_lb_target_group`, `aws_lb_listener` 추가
- Launch Template, ASG parameter panel 보강
- Demo Web Service template 생성

완료 기준:

- Board와 Terraform Preview에서 S3 static site, ALB, ASG 구조가 생성된다.

테스트:

- resource definition lookup test
- web catalog test
- Terraform Preview renderer test
- Terraform Sync proposal test

선행 의존성:

- M0

## M2. Deployment live profile과 safety gate 확장

- Priority: P0
- Issue: #191
- Branch: `feature/sw/191-demo-live-profile-safety`

목표:

- 기존 practice 안전 범위를 유지하면서 demo web service profile만 필요한 live resource를 허용한다.

주요 변경:

- `DeploymentLiveProfile` 타입 추가
- `CreateDeploymentRequest.liveProfile` 추가
- live apply whitelist를 profile별로 분리
- managed demo user data validator 추가
- read-only S3 website policy validator 추가
- RDS optional live warning 추가

완료 기준:

- `practice`는 기존 범위만 허용한다.
- `demo_web_service`는 S3 static site, EC2 API, ALB, ASG를 허용한다.
- arbitrary `user_data`는 계속 차단된다.

테스트:

- deployment plan summary test
- terraform artifact safety test
- deployment safety gate test
- deployment route schema test

선행 의존성:

- M1

## M3. S3 static website live deployment

- Priority: P0
- Issue: #192
- Branch: `feature/sw/192-static-site-live-smoke`

목표:

- S3 bucket 생성이 아니라 실제 HTML, image, URL 접속까지 증명한다.

주요 변경:

- static site Terraform fixture generator 추가
- `index.html` object와 demo image object 생성
- website endpoint output 생성
- `scripts/smoke/live-static-site-deployment.ps1` 또는 통합 smoke에 URL 확인 추가

완료 기준:

- apply 후 `static_site_url`이 200을 반환한다.
- destroy 후 cleanup이 완료된다.

테스트:

- smoke script parse test
- Terraform artifact safety test
- optional live smoke with prepared AWS connection

선행 의존성:

- M2

## M4. EC2 API, ALB, ASG demo deployment

- Priority: P1
- Issue: #193
- Branch: `feature/sw/193-ec2-alb-asg-demo`

목표:

- 정적 웹사이트가 실제 EC2 API와 ALB를 통해 연결되는 모습을 보여준다.

주요 변경:

- managed demo bootstrap script 생성
- Launch Template user data binding
- ASG desired capacity 2 구성
- ALB target group/listener/health check 구성
- `api_base_url`, `alb_dns_name`, `asg_name` output 추가

완료 기준:

- `/health`가 200을 반환한다.
- `/api/status`가 instance/run metadata를 반환한다.
- ALB endpoint가 정상 응답한다.

테스트:

- managed user data hash test
- Terraform Preview test
- smoke URL check

선행 의존성:

- M3

## M5. Traffic Simulation과 RDS optional live UX

- Priority: P1
- Issue: #194
- Branch: `feature/sw/194-traffic-rds-demo-ux`

목표:

- 실제 부하 테스트 없이 트래픽 증가와 RDS 위험을 설명 가능하게 만든다.

주요 변경:

- Traffic Simulator UI 추가
- ASG desired/max와 예상 사용자 수 기반 권장값 표시
- RDS Preview/Cost/Check only 배지 표시
- RDS optional live 승인 checkbox 추가

완료 기준:

- 사용자가 traffic simulation 결과와 RDS live 위험을 구분할 수 있다.

테스트:

- Web source-layout test
- Traffic simulation helper test
- RDS approval state test

선행 의존성:

- M4

## M6. Static Site CI/CD handoff

- Priority: P1
- Issue: #195
- Branch: `feature/sw/195-static-site-cicd`

목표:

- 앱 소스 변경이 GitHub Actions를 통해 S3 static site에 반영되는 흐름을 보여준다.

주요 변경:

- `GitCicdHandoffKind` 추가
- `static_site` handoff 생성
- static site workflow PR 파일 생성
- static site URL과 pipeline status 표시

완료 기준:

- PR 생성 후 pipeline status가 SketchCatch에 표시된다.
- workflow 성공 후 static site URL 변경 확인이 가능하다.

테스트:

- GitHub provider payload test
- pipeline status provider test
- Deployment panel handoff UI test

선행 의존성:

- M3

## M7. HARNESS-007 representative smoke

- Priority: P2
- Issue: #196
- Branch: `feature/sw/196-representative-smoke`

목표:

- 대표 사용자 여정 smoke 증거를 남기고 HARNESS-007을 완료 상태로 만든다.

주요 변경:

- `scripts/smoke/live-demo-web-service.ps1` 추가
- smoke report schema 문서화
- `agent-progress.md` evidence 기록
- `feature_list.json` HARNESS-007 evidence 갱신

완료 기준:

- representative smoke가 실제 또는 명시적으로 승인된 반자동 환경에서 통과한다.
- `feature_list.json`에 concrete verification command가 기록된다.

테스트:

- smoke script parse test
- API/web targeted tests
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

선행 의존성:

- M1-M6
