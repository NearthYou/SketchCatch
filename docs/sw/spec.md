# ECS 전환 및 RunTask Worker 전환 6개월 운영형 스펙

## 목적

SketchCatch 운영 인프라를 EC2 중심 배포에서 ECS/Fargate 중심 운영 구조로 전환한다. 목표는 단순히 “당장 ECS로 옮기는 것”이 아니라, 학생 크레딧 약 100만원으로 6개월 동안 저트래픽 포트폴리오 서비스를 유지하면서도 장기 제품화에 맞는 Terraform 실행 격리 구조까지 단계적으로 확보하는 것이다.

## 운영 기준

- 기본 운영 기간은 6개월이다.
- 기본 비용 전략은 저비용 포트폴리오 운영이다.
- production은 API와 web ECS service를 각각 `desiredCount = 1`로 유지한다.
- staging app은 기본 `desiredCount = 0`으로 둔다.
- 상시 실행 worker service는 현재 phase 범위에 두지 않는다.
- Terraform 기본 모드는 `portfolio_cost_mode = "six_month"`다.
- 기본 runtime은 public Fargate + ALB 구조이며 NAT Gateway를 만들지 않는다.
- 필요할 때만 `private_runtime = true`, `enable_nat_gateway = true`로 NAT Gateway 1개와 Single-AZ private runtime을 켠다.

## 최종 운영 구조

```text
Route53
-> Parallel ALB
   -> /api, /api/*, /health, /health/db -> ECS api service
   -> default /*                         -> ECS web service
-> RDS shared instance
-> Redis
-> S3 artifacts
```

Phase 1에서는 nginx, web, api를 한 task에 묶어 첫 전환 리스크를 줄였다. Phase 8 steady state에서는 nginx를 제거하고 ALB가 API와 web service로 직접 path routing한다. 기존 nginx와 EC2/SSM 자산은 rollback 보존 기간 동안 legacy로 유지한다.

장기 구조:

```text
ALB
├─ /api/* -> ECS api service
└─ /*     -> ECS web service

API
-> deployment_jobs
-> ECS RunTask one-off worker task
-> Terraform/Trivy execution
-> RDS/S3/Redis status and artifacts
```

API/worker 분리는 ECS production 배포가 안정화된 뒤 진행한다. Terraform 실행은 상시 worker service나 SQS queue를 먼저 도입하지 않고, ECS `RunTask` 기반 one-off worker task로 시작한다.

## 핵심 결정

### IaC

- `infra/aws/terraform`을 ECS runtime 운영 인프라 source of truth로 유지한다.
- `infra/aws/production`은 edge, persistent data, legacy rollback state와 import gate의 source of truth로 둔다.
- EC2 기존 리소스와 ECS 신규 리소스가 cutover 동안 병렬로 존재할 수 있게 한다.
- Terraform 변수로 6개월 저비용 모드와 optional private runtime 모드를 모두 지원한다.

### Production infrastructure state

- SketchCatch 자체 production infrastructure state는 사용자 project의 Terraform artifact/state와 분리한다.
- 기존 ECS runtime backend key `production/ecs-foundation/terraform.tfstate`는 승인된 state migration 전까지 유지한다.
- Route53/ACM은 `edge`, S3/RDS/Redis는 `data`, EC2/SSM/nginx rollback은 `legacy-rollback` state로 격리한다.
- S3 backend는 encryption, bucket Versioning, `use_lockfile = true`를 요구한다.
- import는 remote object 하나를 하나의 Terraform address/state만 소유하게 하며, CloudFormation child resource를 중복 import하지 않는다.
- high-risk group은 backup, ownership, rollback, zero-change plan을 확인하기 전 resource/import block을 추가하지 않는다.
- production infra plan/import/apply/destroy는 product API나 ECS worker에서 호출하지 않고 운영자 승인 경로만 사용한다.

### Cutover

- ECS는 parallel ALB로 먼저 검증한다.
- 검증 후 Route53 alias를 ECS ALB로 전환한다.
- cutover 후 기존 EC2와 parallel rollback 리소스는 정해진 기간 안에 stop/delete한다.

### ECS app service

- Phase 1에서는 nginx + web + api single ECS service를 사용한다.
- EC2 운영 구조와 컨테이너 경계를 유지해 첫 전환 리스크를 줄인다.
- Phase 8부터 API/web를 독립 ECS service로 운영하고 ALB path routing을 사용한다.
- 실제 전환은 legacy nginx 100/API·web 0 warmup, target health와 direct smoke, API·web 100/legacy 0 split 순서를 지킨다.

### RDS

- 비용 절감을 위해 RDS instance는 1개를 유지한다.
- `sketchcatch_production`, `sketchcatch_staging` DB와 user를 분리한다.
- production HA보다 6개월 지속 가능 비용을 우선한다.

### RunTask Worker

- API inline 장기 실행이 아니라 Deployment job을 만들고 ECS `RunTask` one-off worker task가 Terraform/Trivy 실행과 artifact/status 기록을 담당한다.
- DB lease가 job 실행권의 source of truth다.
- Redis Pub/Sub은 cancel 즉시 신호용이고, DB cancel flag가 최종 기준이다.
- SQS FIFO, DLQ, plan/mutation queue, always-on worker service는 현재 범위에서 제외한다.
- queue 기반 worker service가 필요해지면 ECS production 안정화와 RunTask 운영 증거를 확인한 뒤 별도 phase/issue로 결정한다.

### Secrets

- Secrets Manager: DB credential, GitHub App private key, OAuth client secrets, OpenAI API key
- SSM SecureString: auth signing secrets, Redis URL 등 secure config
- ECS env: non-secret runtime config
- GitHub Actions, S3 artifact, log, task definition에는 secret 원문을 남기지 않는다.
- generated env file과 S3 presigned env download 의존성 제거는 ECS app service 안정화 이후 secret/runtime config phase에서 진행한다.

## 비용 가드레일

- production API와 web service는 각각 desired count 1로 24/7 실행한다. cutover 관찰 기간에는 legacy nginx service 1개가 추가로 실행된다.
- staging app은 기본 0으로 둔다.
- worker는 필요할 때만 ECS `RunTask`로 실행하고 상시 desired count를 두지 않는다.
- NAT Gateway는 기본 생성하지 않는다.
- `enable_nat_gateway = true`는 명시적 시연/보안 모드에서만 사용한다.
- CloudWatch Logs retention은 production 14~30일, staging 7일로 제한한다.
- AWS Budget alarm은 월 사용액 50%, 80%, 100%에 둔다.
- EC2 rollback과 parallel ALB는 cutover 후 정해진 기간 안에 정리한다.

## 안전 계약

- Terraform plan/apply/destroy는 명시적 Deployment 작업 또는 승인된 worker job에서만 실행한다.
- 위 사용자 Deployment 계약은 SketchCatch production infrastructure Terraform과 별개이며, production infra는 전용 state와 운영자 approval을 사용한다.
- API는 job 생성, 상태 조회, 승인, 취소 요청을 담당한다.
- ECS `RunTask` worker task는 Terraform/Trivy 실행과 artifact/status 기록을 담당한다.
- job 상태, lease, cancel flag는 RDS에 남긴다.
- Terraform artifact와 실행 결과는 S3에 남긴다.
- 실행 로그와 사용자 표시 상태는 Redis/RDS/S3 기록 계약을 유지한다.
- task 실패, 재시작, stale lease, cancel/retry를 정상 운영 시나리오로 다룬다.

## Git 운영 규칙

- 모든 phase는 GitHub issue를 먼저 만든다.
- issue branch는 `gh issue develop`으로 Development에 연결한다.
- 일반 phase PR base는 `dev`다.
- `main`, `dev` 직접 push는 금지한다. 단, 사용자가 명시적으로 예외 승인한 경우만 허용한다.
- 브랜치 이름은 `feature/sw/{issue}-{task}`, `chore/sw/{issue}-{task}`, `refactor/sw/{issue}-{task}` 형식을 따른다.
- PR 제목은 `Type: Korean title` 형식을 따른다.

## 테스트 기준

- 공통: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- Docker: `pnpm docker:build`
- Terraform: `terraform fmt`, `terraform validate`, staging `terraform plan`
- Production infra Phase 9: `node scripts/check-production-infra.mjs`, group별 `terraform init -backend=false`, `terraform validate`
- App smoke: `/health`, `/health/db`, root page, login/API 기본 흐름
- Worker tests: ECS RunTask 요청 계약, DB lease 획득 실패/성공, stale lease recovery
- Cancel tests: DB cancel flag, Redis Pub/Sub signal, missed Pub/Sub 후 polling fallback
- Deployment tests: plan, apply, destroy plan, destroy가 기존 RDS/S3/Redis 기록 계약을 유지하는지 확인
- Cost tests: Terraform plan에서 NAT Gateway가 기본 생성되지 않는지 확인

## 완료 기준

- ECS app service가 production traffic을 받을 수 있다.
- ECR push + ECS service update 배포가 EC2 SSM 배포를 대체한다.
- `/etc/sketchcatch/api.env` 모델이 ECS secret/env 주입 구조로 대체된다.
- API가 Terraform 실행을 직접 오래 붙잡지 않고 Deployment job과 ECS RunTask worker 실행을 만든다.
- worker가 DB lease, cancel/recovery, artifact/status 기록 계약을 지킨다.
- 기본 Terraform plan에서 NAT Gateway가 생성되지 않는다.
- optional private runtime 모드가 Terraform 변수로 켜진다.
- 운영자는 비용, rollback, cleanup, 로그 보존 기준을 문서와 Terraform에서 확인할 수 있다.
- 운영자는 SketchCatch production infra의 state group, import 순서, locking, live-operation blocker를 repo에서 확인할 수 있다.
