# ECS 전환 및 RunTask Worker 실행 마일스톤

## 작업 전 공통 규칙

모든 phase 작업자는 `docs/sw/spec.md`, `docs/sw/plan.md`, `docs/sw/agents.md`를 먼저 읽고 시작한다. 범위와 계약이 충돌하면 canonical 문서인 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다.

우선순위 기준:

- P0: ECS 전환을 안전하게 시작하거나 비용 폭주를 막기 위해 선행되어야 하는 작업
- P1: ECS production 안정화 이후 Terraform 실행 격리와 운영 안정성을 위해 필요한 핵심 구조 작업
- P2: 안정화 후 구조 개선 또는 운영 편의성 강화 작업

## Phase 0. 운영 계획과 추적 기준 정리

- Priority: P0
- Issue title: `Chore: ECS 전환 운영 계획과 비용 기준 정리`
- Branch: `chore/sw/{issue}-ecs-operating-plan`
- PR title: `Chore: ECS 전환 운영 계획과 비용 기준 정리`
- Depends on: 없음

범위:

- `docs/sw/spec.md`, `docs/sw/plan.md`, `docs/sw/agents.md`를 기준 문서로 둔다.
- ECS 전환 feature tracker와 비용 guardrail을 정리한다.
- Terraform runtime mode 기본값과 optional private runtime 의사결정을 기록한다.
- parallel ALB cutover, Phase 1 single ECS task, RunTask one-off worker, SQS deferred decision을 추적 기준에 반영한다.

완료 기준:

- 팀원이 ECS 전환 목표, 비용 기준, phase 순서를 문서만 보고 이해할 수 있다.
- 각 phase의 issue/branch/PR 규칙이 프로젝트 Git 규칙과 맞다.
- `pnpm harness:check`가 통과한다.

## Phase 1. nginx 포함 ECS lift-and-shift

- Priority: P0
- Issue title: `Feat: nginx 포함 ECS 운영 서비스 기반 추가`
- Branch: `feature/sw/{issue}-ecs-app-service`
- PR title: `Feat: nginx 포함 ECS 운영 서비스 기반 추가`
- Depends on: Phase 0

범위:

- Terraform backend, ECR, ECS cluster, task definition, service, ALB, target group, security group을 추가한다.
- nginx + web + api single ECS task로 기존 EC2 `docker run` 구조를 유지한다.
- parallel ALB와 Route53 cutover path를 만든다.
- 기본 Terraform plan에서 NAT Gateway가 생성되지 않게 한다.

완료 기준:

- staging 또는 preview 환경에서 ECS app task가 기동된다.
- ALB health check가 통과한다.
- `/health`, `/health/db`, root page smoke가 통과한다.
- EC2 production rollback 경로가 아직 제거되지 않는다.
- API/worker 분리, ECS RunTask worker, secret 구조 전환은 이 phase에서 구현하지 않는다.

## Phase 2. ECR/ECS 배포 안정화

- Priority: P0
- Issue title: `Feat: ECR 기반 ECS 배포 워크플로 전환`
- Branch: `feature/sw/{issue}-ecs-deploy-workflow`
- PR title: `Feat: ECR 기반 ECS 배포 워크플로 전환`
- Depends on: Phase 1

범위:

- Docker tar/S3/SSM 배포를 ECR push + ECS service update로 전환한다.
- GitHub Actions가 api/web/nginx 이미지를 ECR에 push한다.
- ECS service update와 rollout 상태 확인을 배포 절차에 넣는다.
- EC2 rollback 유지 기간과 cleanup runbook을 문서화한다.

완료 기준:

- 이미지 tag와 task definition revision이 추적 가능하다.
- ECS rollout 실패 시 배포가 실패로 끝난다.
- EC2 rollback 절차가 남아 있다.
- `pnpm docker:build` 또는 동등한 Docker build 검증이 통과한다.

## Phase 3. secret/runtime config 정리

- Priority: P0
- Issue title: `Feat: ECS 런타임 Secret 주입 구조 정리`
- Branch: `feature/sw/{issue}-ecs-secrets-config`
- PR title: `Feat: ECS 런타임 Secret 주입 구조 정리`
- Depends on: Phase 1

범위:

- 기존 `/etc/sketchcatch/api.env` 모델을 ECS task env/secrets 주입으로 대체한다.
- Secrets Manager, SSM SecureString, ECS plain env의 책임을 분리한다.
- GitHub Actions가 secret 원문을 파일, S3, presigned URL, 로그에 남기지 않게 한다.
- task definition secret ARN 주입을 Terraform으로 관리한다.

완료 기준:

- DB credential, GitHub App private key, OAuth secrets, OpenAI key는 Secrets Manager에서 읽는다.
- auth signing secret, Redis URL 등 secure config는 SSM SecureString에서 읽는다.
- non-secret config만 ECS env에 남는다.
- secret masking regression check가 통과한다.

## Phase 4. Deployment job 모델과 RunTask 계약

- Priority: P1
- Issue title: `Feat: Deployment RunTask job 모델 추가`
- Branch: `feature/sw/{issue}-deployment-runtask-jobs`
- PR title: `Feat: Deployment RunTask job 모델 추가`
- Depends on: Phase 1, Phase 2

범위:

- `deployment_jobs` 모델, DB lease, job status 계약을 추가한다.
- plan/apply/destroy 요청을 job으로 표현한다.
- API가 ECS `RunTask` one-off worker task를 요청하기 위한 provider-neutral job 계약을 정리한다.
- 기존 public deployment API endpoint는 유지한다.
- RDS/S3/Redis 기록 계약을 `docs/data-models.md`와 맞춘다.
- SQS queue와 상시 worker service는 추가하지 않는다.

완료 기준:

- job 생성, lease 획득, 상태 전이, 실패 기록이 테스트된다.
- 같은 job을 두 RunTask worker가 동시에 실행하지 못한다.
- 기존 deployment history 조회가 깨지지 않는다.

## Phase 5. ECS RunTask one-off worker runtime

- Priority: P1
- Issue title: `Feat: Terraform 실행을 ECS RunTask worker로 이관`
- Branch: `feature/sw/{issue}-deployment-runtask-worker`
- PR title: `Feat: Terraform 실행을 ECS RunTask worker로 이관`
- Depends on: Phase 4

범위:

- worker entrypoint를 추가한다.
- 기존 plan/apply/destroy service 실행을 ECS RunTask worker task로 옮긴다.
- API route는 inline background 실행 대신 job 생성과 ECS RunTask 요청을 담당한다.
- Terraform/Trivy cache 전략을 ephemeral 기본값으로 두고, 필요 시 EFS 또는 bake-in으로 확장 가능하게 둔다.
- SQS FIFO, DLQ, plan/mutation queue, always-on worker service는 이 phase에서 구현하지 않는다.

완료 기준:

- API는 job id를 반환하고 ECS RunTask worker가 실행 결과를 기록한다.
- Terraform 실행 상태가 기존 UI/API 계약으로 조회된다.
- worker task 실패 후에도 stale lease recovery 대상이 된다.
- cost guardrail 테스트가 통과한다.

## Phase 6. RunTask recovery/observability/smoke 강화

- Priority: P1
- Issue title: `Feat: RunTask worker 복구와 운영 관측성 강화`
- Branch: `feature/sw/{issue}-runtask-worker-ops-hardening`
- PR title: `Feat: RunTask worker 복구와 운영 관측성 강화`
- Depends on: Phase 5

범위:

- Redis cancel signal, DB polling fallback, stale lease recovery를 구현한다.
- CloudWatch alarms, budget alarms, log retention, failed RunTask alarm을 추가한다.
- cleanup runbook과 rollback runbook을 정리한다.
- app smoke와 RunTask worker smoke를 분리한다.

완료 기준:

- Pub/Sub cancel을 놓쳐도 DB polling으로 취소가 반영된다.
- stale lease가 재시도 또는 실패 상태로 정리된다.
- budget alarm과 failed RunTask alarm이 Terraform plan에 나타난다.
- 운영 runbook이 `docs/deployment.md` 또는 관련 문서에 연결된다.

## Phase 7. Queue 기반 worker 확장 판단

- Priority: P2
- Issue title: `Chore: Queue 기반 worker 확장 필요성 판단`
- Branch: `chore/sw/{issue}-worker-queue-decision`
- PR title: `Chore: Queue 기반 worker 확장 필요성 판단`
- Depends on: Phase 6

범위:

- ECS RunTask 운영 증거를 기준으로 SQS FIFO, DLQ, plan/mutation queue, always-on worker service가 필요한지 판단한다.
- 필요한 경우 별도 implementation phase를 만든다.
- 필요하지 않으면 RunTask worker 운영 기준을 유지한다.

완료 기준:

- queue 기반 worker service가 현재 범위에 들어오는지 명확히 결정된다.
- 결정 결과가 `docs/sw/spec.md` 또는 canonical 운영 문서에 반영된다.
- 구현이 필요하면 phase/issue/rollback/cost 기준이 별도로 생긴다.

## Phase 8. nginx 제거와 ALB path routing

- Priority: P2
- Issue title: `Feat: ECS nginx 제거와 ALB path routing 전환`
- Branch: `feature/sw/{issue}-ecs-alb-path-routing`
- PR title: `Feat: ECS nginx 제거와 ALB path routing 전환`
- Depends on: Phase 1, Phase 2, Phase 7 운영 안정성 확인

범위:

- ALB `/api`, `/api/*`, `/health`, `/health/db`는 API로, 기본 `/*`는 web으로 전달한다.
- API와 web을 독립 ECS task definition/service/target group으로 분리한다.
- nginx container를 ECS steady state와 ECS deploy workflow에서 제거한다.
- EC2/SSM rollback이 유지되는 동안 nginx image/config/ECR/log group은 legacy 자산으로 보존한다.
- Next.js same-origin `/api`, Fastify forwarded headers, split service deploy 순서를 검증한다.

완료 기준:

- Terraform 정적 contract가 listener rule, target group, task/service 분리를 검증한다.
- nginx 없이 root page와 API/health path가 올바른 target group으로 전달되는 구성이 확인된다.
- EC2 rollback 자산의 보존 범위와 제거 조건이 문서화된다.
- live ALB/Route53 전환과 production smoke는 별도 명시 승인 후 운영 evidence로 남긴다.
## 전체 완료 기준

- ECS 전환이 EC2 운영 경로를 대체한다.
- 기본 6개월 모드에서 NAT Gateway가 생성되지 않는다.
- optional private runtime 모드가 Terraform 변수로 동작한다.
- ECS production 안정화 후 Terraform 실행이 ECS RunTask one-off worker, DB lease, RDS/S3/Redis 기록 계약을 통해 수행된다.
- 비용 guardrail, cleanup, rollback, 로그 보존 기준이 문서와 Terraform에 반영된다.
- SQS FIFO와 always-on worker service는 별도 결정 전까지 scope 밖으로 유지된다.
