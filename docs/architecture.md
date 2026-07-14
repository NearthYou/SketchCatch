# 아키텍처

SketchCatch는 pnpm workspace와 Turborepo 기반 모노레포다. MVP는 AWS + Terraform 기준으로 구현하지만, 구조는 Provider Adapter와 Terraform Provider 확장을 통한 멀티 클라우드 지원을 전제로 한다.

## 저장소 구조

```mermaid
flowchart TB
  subgraph Repo["SketchCatch monorepo"]
    Web["apps/web\nNext.js + React"]
    Api["apps/api\nFastify + TypeScript"]
    UI["packages/ui\n공유 UI"]
    Types["packages/types\n공유 타입"]
    Infra["infra / deploy / .github\n운영 설정"]
    Docs["docs\nSSOT 문서"]
  end

  Web --> Types
  Web --> UI
  Web --> Api
  Api --> Types
  Api --> RDS["RDS PostgreSQL"]
  Api --> S3["S3 artifacts"]
  Api --> Cache["Redis Runtime Cache"]
```

주요 디렉터리:

- `apps/web`: Architecture Board, IaC Preview, Pre-Deployment Check, Deployment 화면
- `apps/api`: 인증, 프로젝트, draft, Terraform 생성/검증, Deployment API
- `packages/types`: API와 프론트가 공유하는 도메인 타입
- `packages/ui`: 공유 presentational UI
- `infra`, `deploy`, `.github`: 운영 배포와 AWS 운영 설정
- `docs`: 제품/데이터/아키텍처/개발/배포 SSOT

## 기술 스택

| 영역 | 선택한 기술 | 기준 |
| --- | --- | --- |
| 패키지 관리 | pnpm workspace | 모노레포 패키지 연결 |
| 빌드 | Turborepo | 앱/패키지 빌드 순서 관리 |
| 프론트엔드 | Next.js, React, TypeScript | 작업 화면과 API 연동 |
| API 서버 | Fastify, TypeScript | 명확한 route/service 분리 |
| DB | RDS PostgreSQL | 프로젝트, 설계, 배포 이력 저장 |
| ORM | Drizzle ORM | 타입 안전 DB schema와 migration |
| 파일 저장 | S3 | Terraform, export, image, tfplan, state/output artifact |
| Runtime Cache | Redis | Deployment, Reverse Engineering, Git/CI/CD 상태와 15분 Live Observation 세션·집계 보조 |
| IaC | Terraform | MVP 기준 IaC, 멀티 클라우드 확장 기반 |
| AI 계층 | Bedrock, Amazon Q, Amazon Transcribe | 추천, 설명, Guardrails, AWS 특화 reasoning, 음성 전사 |
| 운영 배포 | ECS/Fargate, ALB, ECR | API/web 분리 서비스와 path routing |
| CI/CD | GitHub Actions, OIDC | 장기 AWS key 없는 운영 배포 |

## 실행 경계

| 책임 | 위치 | 금지 |
| --- | --- | --- |
| UI 표시와 사용자 승인 | `apps/web` | AWS SDK 직접 호출, Terraform CLI 실행 |
| Terraform 생성/검증 API | `apps/api` | 프론트에 실행 책임 위임 |
| Terraform Plan/Apply/Destroy | `apps/api` 또는 ECS RunTask worker | 승인 없는 apply/destroy |
| SketchCatch production infra Plan/Import/Apply | 승인된 GitHub Actions/운영자 경로 | product API/worker에서 호출, 승인 없는 state/resource mutation |
| AWS 연결 확인 | `apps/api` 또는 ECS RunTask worker | credential 응답/로그 노출 |
| Provider Adapter와 Reverse Engineering | `apps/api` 또는 ECS RunTask worker | provider별 credential/raw state 프론트 노출 |
| Git/CI/CD handoff와 상태 추적 | `apps/api` 또는 ECS RunTask worker | 승인 없는 commit/apply, secret 저장 |
| Runtime Cache 사용 | `apps/api` 또는 ECS RunTask worker | 사용자 Practice Architecture Resource로 노출 |
| Live Observation UI | `apps/web` | AWS SDK 호출, ASG desired capacity 직접 변경, 사용자 입력 target URL |
| Live Observation 세션·관측 | `apps/api`의 provider-neutral service + AWS adapter | token 로그/RDS 저장, 실패 시 sample AWS 상태 생성 |
| 파일 artifact 저장 | S3 + RDS metadata | Terraform 원문 RDS 영구 저장 |

프론트엔드는 버튼과 상태를 보여줄 뿐 실제 클라우드 변경을 직접 수행하지 않는다. 실제 리소스 변경은 backend/worker에서 승인 게이트, 로그 마스킹, cleanup 경로를 갖춘 뒤 실행한다.

음성 Requirement Input은 Amazon Transcribe로 전사한 뒤 사용자 확인을 거쳐 Requirement Prompt가 된다. AI, Bedrock, Amazon Q Assistance는 추천과 설명을 보강하지만 Practice Architecture, IaC Preview, Git 변경, Deployment 실행을 사용자 수락 없이 변경하지 않는다.

## SketchCatch production infrastructure 관리 경계

SketchCatch 자체 production infrastructure Terraform은 사용자가 만드는 Practice Architecture와 Direct Deployment/Git/CI/CD Deployment state에서 분리합니다.

```text
SketchCatch product Deployment
-> 사용자 project별 artifact/state
-> API 또는 ECS RunTask worker

SketchCatch production infrastructure
-> infra/aws/terraform (runtime)
-> infra/aws/production/edge
-> infra/aws/production/data
-> infra/aws/production/legacy-rollback
-> 운영자 승인 GitHub Environment
```

production infrastructure는 S3 backend의 group별 key와 native lockfile을 사용합니다. 기존 ECS runtime root와 `production/ecs-foundation/terraform.tfstate` key는 state migration 승인 전까지 유지합니다. Route53/ACM, S3/RDS/Redis, cold rollback은 서로 다른 state로 격리하고, high-risk root에는 discovery, backup, ownership, zero-change plan 검토 전 resource/import block을 추가하지 않습니다.

production runtime은 cutover를 마쳤으며 ALB가 API/health path를 API service로, 나머지 path를 web service로 직접 전달합니다. legacy nginx ECS service와 target group, 기존 EC2와 ALB는 삭제되어 warm rollback은 제공하지 않습니다.

CloudFormation이 소유한 resource는 stack이 남아 있는 동안 Terraform으로 중복 소유하지 않습니다. import도 state를 변경하는 live operation이므로 plan-only workflow와 별도 승인 경계를 통과한 후에만 수행합니다.

## 데이터 저장 기준

| 데이터 | 저장 위치 |
| --- | --- |
| 사용자, refresh token hash | RDS |
| 프로젝트 정보 | RDS |
| Source Repository 연결과 마지막 Repository Analysis 요약 | RDS |
| `ArchitectureJson` snapshot | RDS |
| `ProjectDraft.diagramJson`, working `terraformFiles` | RDS + 브라우저 복구 상태 |
| Deployment, Plan summary, 로그 metadata | RDS |
| Deployment 완료 알림, outbox, Inbox 읽음 상태 | RDS |
| Web Push subscription | RDS, endpoint hash + AES-256-GCM encrypted payload |
| S3 파일 metadata | RDS |
| Terraform 파일 | S3 |
| `tfplan`, state, output artifact | S3 |
| 다이어그램 이미지, export zip, thumbnail | S3 |
| Redis Runtime Cache 데이터 | Redis, 짧은 TTL |
| Live Observation session, receipt dedup, 1초 bucket | Redis, 최대 15분 TTL |

RDS는 원천 데이터와 metadata를 저장한다. S3는 파일성 산출물을 저장한다.
Redis는 Deployment, Reverse Engineering, Git/CI/CD Integration처럼 오래 걸리는 workflow 상태와 streaming-friendly metadata를 보조한다. Live Observation은 예외적으로 15분 세션, public token SHA-256 lookup, receipt dedup, 원자 count, 1초 bucket을 Redis에만 저장하며 영구 Deployment 기록으로 승격하지 않는다. Redis 데이터는 원천 기록이 아니며, 최종 기록은 RDS/S3에 남긴다.

## 핵심 서비스 흐름

```mermaid
flowchart LR
  Input["Requirement Input\ntext or voice"] --> Prompt["Requirement Prompt"]
  Prompt --> Draft["Architecture Draft"]
  Repo["Source Repository"] --> Draft
  Existing["Existing Cloud State"] --> Reverse["Reverse Engineering"]
  Reverse --> Draft
  Draft --> Board["Architecture Board\nDiagramJson"]
  Board --> IaC["IaC Preview\nTerraform"]
  IaC --> Check["Pre-Deployment Check"]
  IaC --> Artifact["TerraformArtifact\nS3 object"]
  Artifact --> Direct["Direct Deployment Path"]
  Artifact --> Git["Git/CI/CD Deployment Path"]
  Check --> Approval["User Approval"]
  Direct --> Approval
  Git --> Approval
  Approval --> History["Deployment History\nlogs + outputs + cleanup"]
  History --> Observe["Live Observation\nlive event + CloudWatch + ASG actual"]
```

Representative Use Journey는 위 실제 서비스 흐름을 증명하는 발표/리허설 경로다. 별도 데모 전용 기능을 만들지 않는다.

## API 범위

현재 API 범위는 구현 상태에 따라 바뀔 수 있지만, 공통 원칙은 아래와 같다.

- 인증된 사용자는 프로젝트를 생성하고 조회한다.
- 프로젝트는 `ArchitectureSnapshot`과 `ProjectDraft`를 가진다.
- Terraform 생성 API는 `DiagramJson`을 입력으로 받는다.
- Pre-Deployment Check는 비용/보안/설정 위험을 반환한다.
- Deployment API는 생성, init, plan, approval, apply, logs, destroy 흐름으로 확장한다.
- Live Observation API는 valid v2 manifest와 현재 verified connection을 가진 성공 Deployment에서만 15분 Store 세션을 만들고 인증 snapshot/SSE, capability-free audience URL, 제한된 public bootstrap/request를 제공한다.
- Git/CI/CD Integration API는 Source Repository 연결, Terraform handoff, PR 생성, pipeline 상태 추적 흐름으로 확장한다.
- Repository Analysis API는 repository 원문을 실행하거나 저장하지 않고, 마지막 구조화된 AI Handoff와 분석 revision만 RDS에 저장한다.
- Reverse Engineering API는 Provider Adapter를 통해 기존 cloud Resource를 스캔하고 Practice Architecture와 import suggestion을 반환한다.
- 실제 AWS credential과 Terraform 실행 세부는 프론트에 노출하지 않는다.

API DTO와 모델명은 [데이터 모델](./data-models.md)을 따른다.

## Deployment/CI/CD 콘솔 상태 경계

Workspace의 전체 화면 콘솔은 Direct Deployment와 CI/CD를 독립된 최상위 화면으로 보여주지만, 두 경로의 원천 기록을 합치지 않는다. Direct 화면은 `Deployment`, Plan, Terraform Output과 Deployment log를 읽고, CI/CD 화면은 Source Repository의 commit에 귀속된 `GitCicdPipelineRun`을 읽는다. 마지막으로 선택한 최상위 화면만 project별 `localStorage`에 복구하며, 이 UI preference는 Deployment나 Pipeline Run 상태를 변경하지 않는다.

Git/CI/CD 관측의 영구 source of truth는 RDS다.

- `git_cicd_monitoring_configs`는 Source Repository별 활성 여부, branch, 명시적인 app/infra path, validation 상태와 시각을 저장한다.
- `git_cicd_pipeline_runs`는 `(source_repository_id, commit_sha)`별 하나의 commit-scoped run과 change scope, 최종 상태, start/end/refresh 시각, 적용 가능한 accepted handoff에서 가져온 비민감 Web/API URL을 저장한다.
- `git_cicd_pipeline_stages`는 Detect, app Build, infra Plan/Apply, app Deploy, Verify 상태를 run별로 저장한다.
- `git_cicd_pipeline_logs`는 마스킹된 stage message를 run별 증가 `sequence`로 저장한다.
- `handoff_id`는 승인된 Git/CI/CD handoff와 연결할 때만 사용하며, 기존 handoff record를 Pipeline Run으로 변환하지 않는다.

Web은 화면이 보일 때 active Pipeline Run이 있으면 5초, 모두 terminal이면 30초 간격으로 인증 API를 polling한다. 자동 console polling은 RDS 목록만 읽고, 사용자의 수동 새로고침은 project-scoped discovery를 실행한다. CI/CD Logs는 선택한 run의 마지막 `sequence` 이후만 증분 조회한다. `logRevision`이 바뀌는 rerun에서는 sequence와 표시 log를 함께 초기화한다. Workspace-level observer는 콘솔을 닫아도 같은 project가 mount된 동안 project-scoped discovery를 먼저 실행하고 RDS 목록을 읽어 Direct/Pipeline terminal 전환을 같은 5초/30초 정책으로 관측한다. discovery가 stale이면 기존 observer baseline을 보존한다. document가 숨겨진 동안 화면 refresh와 log fetch는 provider 호출을 진행하지 않는다.

API refresh는 GitHub Actions, job, commit file과 마스킹된 log를 read-only로 조회해 RDS record를 idempotent하게 갱신한다. Project discovery는 모든 enabled/valid target을 처리하며, branch run 목록은 최대 2 page와 최근 10 commit group까지만 hydrate한다. 특정 run refresh는 `head_sha`를 전달해 해당 commit만 조회한다. 같은 Source Repository와 monitoring target branch에서 가장 최근에 생성된 non-draft/non-cancelled `GitCicdHandoff`가 있으면, 사용자 수락 설정인 `staticSiteUrl`과 `apiBaseUrl`을 각각 Pipeline Run의 `appUrl`과 `apiUrl` provenance로 연결한다. `handoffId`, `appUrl`, `apiUrl`은 하나의 provenance tuple이다. 적용 가능한 handoff가 없으면 기존 tuple 전체를 보존하고, handoff가 있으면 두 URL이 null이어도 들어온 tuple 전체로 교체한다. URL은 username/password, query, fragment가 없는 절대 HTTP(S) entry/base URL만 허용하며 path와 port는 보존한다. 거부된 값은 Pipeline Run에 저장하지 않는다. provider 조회가 실패하면 마지막으로 저장된 status와 `lastRefreshedAt`을 보존하고 stale 응답을 반환한다. Redis Runtime Cache는 handoff/pipeline status의 짧은 보조 cache로 사용할 수 있지만 Pipeline Run, stage, log의 최종 기록을 대체하지 않는다.

각 provider snapshot은 최대 갱신 시각, Infra/App 고정 presence slot, 각 workflow의 zero-padded run ID/attempt slot으로 만든 `upstreamOrderingToken`과 로그 소유권을 나타내는 별도 `logRevision`을 가진다. 같은 최대 갱신 시각의 strict workflow superset은 어느 단일 workflow snapshot보다 항상 크다. RDS conditional upsert는 더 오래된 token과 같은 revision의 terminal-to-non-terminal 역행을 원자적으로 거부하고, 거부 시 stage/log write도 수행하지 않는다. 따라서 늦게 도착한 partial refresh가 완료 상태나 rerun log를 과거 상태로 되돌리지 않는다.

모니터링 설정 변경에는 `userAcceptedChangeId`가 필요하며, enabled 상태는 branch와 app/infra path가 GitHub에서 검증되어야 한다. Pipeline refresh와 조회는 Git commit, workflow 설정, repository settings, AWS Resource를 변경하지 않는다. Git/CI/CD handoff, repository settings 적용, GitHub OAuth 보강, AWS role diff 적용은 각각 기존의 명시적 사용자 승인 경계를 유지한다.

완료 알림의 source of truth는 RDS Inbox와 idempotent outbox다. Direct Deployment와 GitOps Pipeline Run의
성공·실패·취소 terminal transition이 원본 상태 변경 transaction 안에서 사용자 알림과 outbox를 한 번만
만든다. 인증 SSE는 활성 화면에 같은 notification을 전달하고, background dispatcher는 암호화된
subscription을 복호화해 Service Worker Web Push로 전달한다. 브라우저 저장소나 polling snapshot은 중복
방지 기준으로 사용하지 않는다. Push 권한 거부·미지원·만료·전달 실패가 있어도 영속 Inbox는 유지된다.
endpoint와 subscription key 원문은 RDS와 로그에 남기지 않으며 알림과 비활성 subscription은 90일 후
정리한다.

CI/CD Logs는 GitHub Actions의 build/deploy workflow 증거이며 Runtime application log가 아니다. Runtime Log 동작은 Live Observation으로 이동할 뿐 Pipeline Run status를 변경하지 않는다. Direct Deployment 링크는 non-sensitive Terraform Output에서 분류하지만, CI/CD 링크는 위 accepted handoff 설정에서 유래한 `appUrl`/`apiUrl`이 credential/query/fragment 없는 HTTP(S) 검증을 통과한 경우에만 조건부로 표시한다.

## Live Observation 실행 경계

공개 audience page는 URL에 capability를 넣지 않고 session-bound bootstrap credential을 메모리에만 보유한다. 여러 audience client는 같은 active session에서 bootstrap을 반복할 수 있다. 실제 요청은 ACM custom hostname의 CNAME이 manifest의 public AWS ALB DNS와 정확히 일치하는지 다시 조회하고, ALB의 모든 A/AAAA 응답이 public address인지 검증한 뒤 선택한 IP로 HTTPS 연결을 고정한다. DNS와 HTTPS는 하나의 3초 wall-clock deadline을 공유하고 HTTPS는 남은 시간만 explicit destroy timer로 사용한다. TLS SNI와 Host는 custom hostname을 유지하며 POST와 redirect 미허용 조건으로 전송하고, status headers를 받는 즉시 response/socket을 destroy하여 body를 drain하지 않으며 성공한 2xx 뒤에만 Store receipt를 반영한다. DNS 불일치, 빈 응답, 하나라도 private·loopback·link-local·metadata·multicast·reserved address가 포함된 응답은 upstream 연결 전에 generic unavailable로 차단한다. IPv6는 native global unicast만 허용하고 IETF special assignment, 6to4, 반환된 6bone, documentation, IPv4-mapped 범위를 차단한다. public write endpoint는 `/requests` 하나뿐이며 IP별 전역 한도는 ALB가 추가한 client IP의 SHA-256 fingerprint로만 집계한다.

API의 Live Observation service는 session/receipt/snapshot 계산을 소유하고 provider-neutral snapshot port만 호출한다. URL의 Deployment ID와 Store session의 Deployment ID가 같은지 lease 전에 확인하고, verified manifest와 현재 verified AWS connection의 partition/region/account가 모두 일치할 때만 AWS target을 만든다. AWS adapter는 선택된 Target Group 범위의 CloudWatch `HTTPCode_Target_2XX_Count`, `HTTPCode_Target_3XX_Count`, `HTTPCode_Target_4XX_Count`, `HTTPCode_Target_5XX_Count`, `TargetResponseTime` p95, ASG `InService` 또는 ECS running capacity, ELB target health, bounded CloudWatch Logs를 조회한다. 각 CloudWatch query result가 유일하고 `StatusCode=Complete`일 때만 사용하며 `PartialData`, `InternalError`, `Forbidden`, 누락 status는 unavailable이다. request 수는 p95가 선택한 완료 period를 각 response class의 전체 finite point에서 정확히 찾아 합산하고, 같은 period에 하나 이상의 다른 response class가 있어 period 존재가 증명된 sparse class만 0으로 취급한다. latency만 있거나 response class가 완전히 비어 있거나 다른 period의 class만 있으면 합치지 않으며 freshness는 period 종료 시각부터 계산한다. 동일 observation/target read는 settlement 이후 10초 동안 bounded cache하고 pending read는 TTL로 중복 시작하지 않는다. cache가 pending으로 가득 차면 fail-closed하고 STS와 모든 AWS read는 하나의 5초 abort deadline을 공유한다. observer lease와 fencing token을 획득한 service만 Store의 latest observation을 갱신한다. Store 장애는 GET의 `LIVE_OBSERVATION_CACHE_UNAVAILABLE` 503 또는 SSE의 단일 sanitized error event로 반환한다. SSE는 1초 snapshot, 15초 heartbeat를 제공하고 Web은 연결 실패 시 인증 GET snapshot 후 exponential backoff로 재연결한다. AWS evidence가 지연되거나 unavailable이면 이전 정량값을 유지하지 않고 공통 snapshot의 모든 숫자를 `null`로 만들며 상태를 명시한다.

## 멀티 클라우드 확장 방향

MVP는 AWS Provider Adapter 기준이다. `Resource`, `Practice Architecture`, `InfrastructureGraph`, `Reverse Engineering`은 provider-neutral 모델을 유지하고, provider별 차이는 adapter에 둔다. 장기적으로는 아래처럼 확장한다.

| 단계 | 범위 |
| --- | --- |
| MVP | AWS + Terraform |
| 이후 | AzureRM Provider, Google Provider |
| 장기 | 클라우드별 비용 비교, 클라우드별 아키텍처 리뷰 |

문서와 코드에서 SketchCatch를 AWS 전용 서비스로 표현하지 않는다. 단, MVP 구현은 AWS-first로 진행한다.

## 기술 결정 기록

### ADR-001: pnpm workspace와 Turborepo를 사용한다

`apps/web`, `apps/api`, `packages/types`, `packages/ui`가 같은 도메인 타입을 공유하므로 모노레포로 시작한다.

### ADR-002: API 서버는 Fastify로 시작한다

Fastify는 route/service 분리가 쉽고, MVP API와 Zod 검증에 충분하다.

### ADR-003: RDS에는 원천 데이터, S3에는 파일 아티팩트를 저장한다

프로젝트와 설계 JSON은 RDS에 저장하고, Terraform 파일, tfplan, export zip은 S3에 저장한다.

### ADR-004: 운영 배포는 staged ECS/Fargate와 ALB path routing을 사용한다

API와 web을 독립 Fargate service로 병렬 배포합니다. web은 permissionless task role과 별도 security group을 사용해 API의 RDS allowlist와 AWS runtime 권한에서 분리합니다. 각 service는 비용 우선으로 Application Auto Scaling `min=1`, `max=2`를 사용하고 deployment circuit breaker, `minimumHealthyPercent=100`, `maximumPercent=200`을 유지합니다. legacy ECS service와 기존 EC2/SSM/docker run 경로는 삭제되었고, 장애 복구는 암호화된 sanitized AMI와 검증 image artifact를 사용하는 cold rollback만 제공합니다.

Terraform 실행은 API process가 아니라 ECS RunTask one-off worker가 담당합니다. worker는 전용 task definition, execution role, task role, no-ingress security group을 사용하고, API에는 해당 worker를 dispatch·조회·중단·tag·PassRole하는 최소 권한만 둡니다. 기존 사용자 execution role trust를 worker principal로 재검증하기 전에는 worker dispatch를 활성화하지 않습니다.

### ADR-005: MVP는 Terraform 우선으로 간다

Terraform은 diff, plan, apply, state, provider 확장 측면에서 제품 방향과 맞는다. CloudFormation은 AWS 참고 또는 향후 호환 대상으로만 둔다.

### ADR-006: SketchCatch production infrastructure state를 관리 group별로 분리한다

ECS/ALB/ECR/IAM/CloudWatch runtime은 기존 state key를 유지하고, Route53/ACM은 `edge`, S3/RDS/Redis는 `data`, opt-in cold restore는 `legacy-rollback` state로 격리한다. 모든 state는 versioned S3 backend와 native lockfile을 사용한다. 사용자 Deployment state와 production infrastructure state는 어떤 실행 경로도 공유하지 않는다.
