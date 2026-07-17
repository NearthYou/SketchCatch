# 배포 운영 문서

SketchCatch production steady state는 Docker image를 ECR에 push하고 ECS/Fargate의 API와 web service를 병렬 배포합니다. ALB가 path routing을 담당하며 Docker Compose와 ECS nginx를 사용하지 않습니다. 기존 EC2/SSM/docker run/nginx, EC2 ALB와 legacy ECS service는 제거되었으며 cold rollback artifact만 보관합니다.

이 문서는 SketchCatch 운영 배포와 사용자가 만든 IaC를 실행하는 경로를 구분합니다.

| 구분                      | 의미                                                                      | 기준                                                                |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 운영 배포                 | SketchCatch 서비스 자체를 ECS/Fargate에 배포                              | Docker, ECR, ECS service update, ALB path routing                   |
| Production infra IaC      | SketchCatch 자체 AWS infrastructure를 관리                                | 분리된 S3 state, native lockfile, manual plan/import/apply approval |
| Direct Deployment Path    | SketchCatch가 사용자가 승인한 IaC Preview를 직접 실행                     | Terraform Plan/Apply/Destroy, approval, logs, cleanup               |
| Git/CI/CD Deployment Path | SketchCatch가 IaC Preview를 Source Repository PR과 외부 pipeline으로 넘김 | Terraform commit/PR, pipeline template/status, team review          |

## ECS 배포 속도와 측정

`Deploy Production ECS` workflow는 검증이 끝난 뒤 API와 web image를 별도 job에서 병렬로 build/push합니다. 각 repository의 `buildcache-v1` tag는 BuildKit registry cache 전용이며 배포 대상이 아닙니다. ECS task definition에는 workflow가 ECR에서 확인한 release image digest만 기록합니다.

- `deploy=true`는 image build/push 후 worker task definition을 등록하고 API와 web service를 배포합니다.
- `deploy=false`는 ECR image와 cache만 만들며 ECS service와 task definition은 변경하지 않습니다. Production 실측에서는 이 모드로 cold cache를 한 번 채운 뒤 같은 commit을 `deploy=true`로 배포합니다.
- GitHub Step Summary에는 image별 digest, ECR compressed size, build/push 시간과 전체 안정화 시간이 남습니다.
- 실제 배포 전 read-only preflight가 API와 web의 desired/running count, pending task, primary rollout 상태를 확인하고 이전 API/web/worker task definition ARN을 rollback 기준으로 기록합니다.
- 기준선은 최근 성공 4회 중앙값인 전체 7분 51초와 순차 build/push 81초입니다. 목표는 전체 5분 30초 이하, 병렬 image build critical path 60초 이하입니다.

2026-07-14 production 실측에서는 동일 commit의 cache를 먼저 채운 뒤 `deploy=true`로 배포했습니다.

| 항목 | 기준선 | 실측 | 결과 |
| --- | ---: | ---: | ---: |
| 전체 workflow | 7분 51초 | 6분 9초 | 1분 42초, 21.7% 단축 |
| image build/push critical path | 81초 | 7초 | 74초, 91.4% 단축 |
| API ECS service 안정화 | 3분 43초 | 3분 13초 | 30초 단축 |
| web ECS service 안정화 | 4분 50초 | 2분 56초 | 1분 54초 단축 |

실측 workflow run은 GitHub Actions `29333857003`이며 API와 web release image는 각각 `sha256:f9726dbead5597539a6501d709bd762890fbd3ba68c8fa551e2eee304800ee4c`, `sha256:383a249b11f9e8d5548a3c3daa82c976a24dd1f6b36a2fc42cb408c7f92d9997`로 고정되었습니다. 배포 후 `https://sketchcatch.net/`, `/health`, `/health/db`는 모두 200을 반환했습니다. 전체 5분 30초 목표에는 39초 미달했으므로 validation 1분 28초와 API 안정화 3분 13초가 다음 최적화 대상입니다. 같은 branch의 read-only runtime Terraform plan `29334381609`는 production state와 선언 사이에 변경점이 없음을 확인했습니다.

ALB는 API의 장시간 연결을 고려해 API 60초, web 30초의 deregistration delay를 사용합니다. 두 target group은 10초 간격으로 2회 성공하면 healthy가 됩니다. API health check grace period는 runtime 준비를 위해 60초를 유지하고 web은 30초를 사용합니다. `minimumHealthyPercent=100`, `maximumPercent=200`, circuit breaker rollback은 변경하지 않습니다.

SketchCatch가 사용자 Source Repository에 생성하는 ECS/Fargate CodeBuild는 프로젝트 전용 ECR build cache만 읽고 씁니다. build-only role은 `sketchcatch-<projectSuffix>-build-cache` Repository의 layer action으로 제한되며 사용자 배포용 ECR, ECS, 서비스 S3, CloudFront 권한을 갖지 않습니다. 서버가 생성한 buildspec은 첫 API image build의 BuildKit layer를 cache tag에 저장하고 다음 commit에서 재사용하며, cache login·import·export가 실패하면 배포를 중단하지 않고 cold build로 전환합니다. cache tag는 ECS에 배포하지 않습니다. API image와 frontend는 SketchCatch 내부 Artifact S3에 immutable candidate로 저장되고, API는 multipart complete 전에 실제 part 크기를 확인하고 압축 해제 파일 수·개별 파일·전체 크기를 제한합니다. 내부 Artifact bucket은 Public Access Block, 기본 암호화, TLS-only policy를 사용합니다. 현재 Vite demo frontend는 `VITE_API_BASE_URL=/`로 빌드해 CloudFront same-origin `/api/*`를 사용합니다. 검증된 candidate의 ECR publish와 ECS/S3/CloudFront activation은 승인 뒤 trusted worker가 별도 exact-resource 세션으로 수행합니다.

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

Architecture Draft에서 Anonymous Amazon Q 패턴 검색을 활성화할 때는 다음 runtime 설정을 사용합니다.

```text
AI_ARCHITECTURE_REQUIREMENT_NORMALIZER=openai
AMAZON_Q_ENABLED=true
AMAZON_Q_REGION=ap-southeast-2
AMAZON_Q_CREDIT_CONFIRMED=true
AMAZON_Q_RETRIEVAL_APPLICATION_ID=<anonymous-q-application-id>
```

`AMAZON_Q_RETRIEVAL_APPLICATION_ID`가 비어 있으면 기존 `AMAZON_Q_APPLICATION_ID`를 사용합니다. Architecture Draft는 Creator mode application ID나 Q Business 사용자 구독을 요구하지 않습니다. 선택된 패턴마다 `RETRIEVAL_MODE`를 한 번 호출하므로 API rate/cost limit과 provider metadata를 유지해야 합니다.

Direct Deployment Path의 실제 live apply 리소스는 안정성을 위해 아래로 제한합니다.

- VPC
- Public/Private Subnet
- Internet Gateway
- Elastic IP와 NAT Gateway
- Route Table과 Association
- Security Group
- ALB, Listener, Target Group
- ECS Cluster, Service, Task Definition
- IAM Role과 Policy Attachment
- ECR Repository와 CloudWatch Log Group
- S3 Bucket, Public Access Block, Object, Bucket Policy
- CloudFront Distribution과 Origin Access Control
- EC2

Terraform Plan과 사전 `terraform init`은 안전 검사를 통과한 기본 Template Resource를 더 넓게
분석할 수 있습니다. `practice` live apply 허용 목록 밖의 Resource는 Plan 결과에
`UNSUPPORTED_RESOURCE` 경고로 남으며, 승인과 Apply에서는 live apply 안전 검사를 다시 적용해
fail-closed로 차단합니다. Plan 가능 여부가 실제 배포 허용을 의미하지는 않습니다.

Repository ECS 다이어그램의 `Fargate Task` 표시는 별도 Terraform Resource가 아니라
`aws_ecs_service`가 `desired_count`에 따라 실행하는 런타임 인스턴스입니다. Terraform에는
control-plane `aws_ecs_task_definition` 하나만 생성해 중복되거나 비어 있는 Task Definition을
만들지 않습니다.

Live Observation demo profile은 CloudFront origin 제한에 필요한
`aws_ec2_managed_prefix_list` data source를 허용합니다. Launch Template bootstrap은
Terraform artifact bundle에 포함된 `${path.module}/<basename>.tftpl` 파일만
`base64encode(templatefile(...))`의 `user_data`로 사용할 수 있습니다. 절대 경로, `..`,
하위 디렉터리, 동적 template 경로와 그 밖의 로컬 파일 함수는 계속 차단합니다.

RDS는 생성/삭제 시간과 비용 리스크가 크므로 기본 live apply 경로에서 제외합니다.
현재 cleanup은 사용자가 명시적으로 실행하는 Deployment destroy 흐름으로 처리합니다. 성공한 Deployment 또는 apply 도중 실패했지만 partial state가 저장된 Deployment만 cleanup 대상입니다.

## 사용자 Deployment 안전 정책

### 사용자 런타임 convergence preflight

Application release는 배포 직전에 provider의 current state를 read-only로 확인한다. 동일한
`ApplicationArtifact` fingerprint와 digest/reference, 동일한 `deploymentTargetFingerprint`, healthy
상태가 모두 확인되면 runtime mutation을 생략하고 `already_active`를 기록한다. DB release row,
Runtime Cache, 이전 pipeline 성공 여부만으로는 생략하지 않는다. 조회 권한 부족, timeout, marker가
없는 legacy revision, account/region/config 불일치, digest 불일치, unhealthy/unknown health는 모두
기존 rollout으로 fallback한다.

Direct ECS/Fargate는 active service/task definition과 task tag, image digest, Fargate capacity,
rollout configuration, HTTPS health를 확인한다. Direct HTTPS probe는 credential/query/fragment와
private IP를 거부하고 DNS 응답을 public address로 검증한 뒤 그 address에 고정해 요청한다.
Git/CI/CD application workflow는 사용자 계정 안에서 다음 read-only preflight를 실행한다.

- ECS Service + Fargate: Fargate capacity와 service 안정성, task definition tag, container image digest, HTTPS health
- Lambda Alias/Version: alias/version, x86_64 compute, provider update 상태, version description marker, code digest, CodeDeploy group, HTTPS health
- EC2 + ASG: CodeDeploy group/active revision marker, versioned S3 bundle digest, instance 성공 상태, HTTPS health
- Static S3/CloudFront: active origin prefix, CloudFront origin의 artifact/target marker, versioned manifest digest, distribution 상태, HTTPS health

새 rollout은 다음 실행에서 검증할 수 있도록 secret이 아닌 artifact/target fingerprint marker만
provider revision에 남긴다. GitOps evidence v3는 provider 검증 결과를 기록하며 실패/rollback
evidence는 기존 형식을 유지한다. fingerprint, evidence, fixture, log에는 credential이나 secret 값을
넣지 않는다.

no-op은 runtime mutation만 생략한다. Approval, Plan/Terraform artifact hash, state lineage/serial,
artifact provider 검증, Deployment History 기록은 생략하지 않는다. rollback baseline과 cleanup/
retention도 유지하며 active artifact나 active static prefix를 먼저 삭제하지 않는다.

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
- `in_process` mode에서 서버 재시작으로 실행 주체를 잃은 `RUNNING` Deployment는 startup recovery가 `FAILED`로 정리합니다. ECS worker mode에서는 API가 사용자 runtime을 직접 복구하지 않고 active worker를 보호하거나 recovery-mode worker를 dispatch합니다.
- Representative Use Journey나 리허설 후 생성 리소스 cleanup을 반드시 확인합니다.

### Direct Deployment 최적화 정책

- 최적화 지원 여부는 provider-neutral `ResourceDefinition.capabilities.deployment`에서 판정합니다. Terraform managed resource는 desired-state 최적화 대상이며 data source, `UNKNOWN`, catalog-only resource는 명시적으로 제외합니다. application artifact 재사용은 Direct/GitOps 공통 Registry v1으로 구현하며 runtime no-op은 별도 후속 계층입니다.
- Terraform bundle은 파일명 정렬, JSON key canonicalization, LF 개행으로 정규화합니다. desired-state fingerprint에는 provider lock/identity, 비밀값을 제외한 변수 이름, backend label, project/provider/account/region target, state lineage/serial을 포함합니다.
- 공유 provider plugin cache와 기존 `.terraform.lock.hcl`을 재사용합니다. state가 있으면 Plan workspace에 복원하고 lineage/serial을 identity에 포함합니다. lock, target, state, Terraform content가 바뀌면 반드시 새 Plan을 실행합니다.
- Plan 전 artifact, connection, architecture, current Plan, workspace 준비는 병렬화합니다. 정적 Terraform 안전 검사를 통과한 뒤에만 credential을 준비하며, credential/lock/state 준비도 서로 독립적으로 병렬화합니다.
- 동일 Deployment의 동시 Plan 요청은 single-flight로 합칩니다. pending apply Plan은 실제 `tfplan` hash, S3 optimization evidence v1, Plan summary hash, Pre-Deployment result hash, target/state identity, drift TTL이 모두 일치할 때만 재사용합니다. 기본 drift TTL은 5분입니다.
- cache lookup, sidecar schema/hash/scope, TTL 검증이 실패하면 배포를 실패시키지 않고 `fallback_execute/cache_validation_failed`로 기록한 뒤 정상 Plan을 실행합니다. evidence 생성·저장 실패도 기존 Plan 저장과 승인을 손상시키지 않습니다.
- Terraform Plan이 실제 resource mutation 0건임을 증명할 때만 `no_change/terraform_plan_no_changes`로 기록합니다. Apply 직전에도 사용자 승인, artifact/tfplan hash, account/region, sidecar/summary/TTL을 다시 검증하며, 검증된 no-change만 Terraform Apply를 생략합니다. application/full-stack release 작업은 자체 계약에 따라 계속 실행합니다.
- `execute`, `reuse`, `no_change`, `fallback_execute`, `unsupported`와 제한된 reason enum만 저장합니다. duration, lock/state hit·miss, 정규화된 resource address별 action은 로그에 남기고 credential, token, 변수 값, raw Terraform JSON, 자유 형식 metadata는 남기지 않습니다.
- no-change는 코드 fingerprint만으로 판단하지 않고 state와 drift evidence를 요구합니다. 부분 최적화를 위해 `terraform apply -target`을 사용하지 않으며 Plan/Apply/Destroy의 기존 전체 그래프와 승인 경계를 유지합니다.
- ApplicationArtifact fingerprint는 repository identity, exact commit, 정규화한 build config, build contract/buildspec version, target OS/architecture, secret-free build input identity만 포함합니다. runner, worker 수, queue, retry 같은 artifact byte 비영향 orchestrator/capacity 값은 제외합니다.
- 같은 project/fingerprint의 build는 RDS claim/lease로 하나만 소유하고 build 동안 heartbeat로 lease를 갱신합니다. active lease가 있으면 중복 build를 시작하지 않고, 만료 lease만 새 claim이 인수합니다. Redis Runtime Cache는 이 결정의 source of truth가 아닙니다.
- 재사용 직전 provider adapter가 존재 여부, exact SHA-256 digest, account, region, 승인된 namespace/reference, project ownership scope를 read-only로 검증합니다. S3 custom metadata는 digest 증거로 신뢰하지 않고 provider checksum 또는 실제 object stream을 확인합니다. 실패하면 DB row를 신뢰하지 않고 cache miss로 처리해 정상 build를 실행합니다.
- RDS에는 identity, digest, provider location metadata, 상태만 저장합니다. 실제 사용자 image/zip/bundle은 사용자 ECR/S3 또는 provider storage에 두며 SketchCatch production ECR/S3에 복사하지 않습니다.
- GitOps release evidence v1은 계속 허용합니다. v2 `artifact` extension은 canonical fingerprint, build contract, digest, provider location을 strict validation하며 malformed v2를 v1로 downgrade하지 않습니다. 실제 AWS mutation이나 real credential 없이 test double과 read-only adapter 계약으로 검증합니다.

## Git/CI/CD Deployment Path 정책

Git/CI/CD Deployment Path는 운영 배포와 팀 리뷰를 위한 경로입니다. SketchCatch는 Terraform 파일을 Source Repository에 commit하거나 PR로 넘기고, 외부 pipeline 상태를 추적합니다.

- Git/CI/CD handoff도 User-Accepted Change 이후에만 생성합니다.
- Source Repository token, deploy key, CI secret 원문은 응답, 로그, DB에 저장하지 않습니다.
- PR에는 IaC Preview, Plan 요약, Pre-Deployment Check 결과, Cost Analysis 요약을 연결합니다.
- 운영 apply는 외부 pipeline의 승인 job이나 조직 정책을 따를 수 있지만, SketchCatch는 승인 없는 apply를 권장하거나 자동 실행하지 않습니다.
- 최초 Direct Deployment와 설치 PR은 Terraform·Workflow·Repository/AWS 설정을 준비합니다. 이후 App은 target branch push로, Infra는 사용자가 직접 실행한 `gh workflow run sketchcatch-infra.yml --ref main`으로 따로 배포합니다.
- Infra 명령 실행은 Terraform Plan 후 같은 job의 같은 `tfplan`을 Apply하는 명시적 승인입니다. 이 흐름에 별도 PR, merge, GitHub Environment reviewer 승인을 추가하지 않습니다.
- Direct Deployment Path와 Git/CI/CD Deployment Path는 서로 경쟁하는 선택지가 아니라 사용 맥락이 다른 실행 경로입니다.
- Git/CI/CD 상태 polling과 long-running workflow status는 Redis Runtime Cache를 사용할 수 있지만, 최종 기록은 RDS/S3에 남깁니다.

### CI/CD 관측과 알림 운영 기준

Source Repository를 연결하면 monitoring은 기본 enabled지만 즉시 유효한 실행 대상으로 간주하지 않습니다. `0032_git_cicd_monitoring_runs.sql`은 기존 active Source Repository에 branch와 repository root app/infra path를 채우고 `validationStatus = 'required'`로 backfill합니다. 기존 `git_cicd_handoffs` row는 변경하지 않습니다. 사용자는 프로젝트 설정에서 branch와 app/infra 각각의 repository root 또는 subdirectory를 명시적으로 선택하고 저장을 수락해야 합니다. enabled 설정은 GitHub App의 read 권한으로 branch와 두 directory를 검증한 뒤에만 `valid`가 되며, handoff 생성도 이 상태를 요구합니다. CI/CD console은 승인 Plan, Source Repository, monitoring config, AWS connection, build config, runtime coordinates, ECS HTTPS Output URL의 7개 준비 조건을 모두 표시하고 각 설정 화면로 연결합니다. 설정에서 돌아오거나 browser가 다시 활성화되면 같은 single-flight 조회로 준비 상태를 갱신합니다.

CI/CD console은 active run이 있으면 5초, active run이 없으면 30초마다 RDS 목록을 갱신합니다. Provider discovery는 사용자의 수동 새로고침에서만 실행합니다. 선택한 Logs 화면도 같은 주기로 마지막 `sequence` 이후의 마스킹된 log만 가져오며, rerun의 `logRevision`이 바뀌면 sequence와 표시 log를 함께 초기화합니다. browser tab이 hidden이면 화면 refresh와 log polling을 건너뜁니다. 60초 넘게 갱신되지 않은 non-terminal run은 stale로 표시할 수 있지만, provider 오류만으로 RDS의 마지막 terminal/non-terminal 상태를 덮어쓰지 않습니다.

같은 commit의 App `push`와 Infra `workflow_dispatch`는 GitHub run ID와 attempt가 다른 독립 Pipeline Run으로 저장하고 서로 덮어쓰지 않습니다. GitHub가 `skipped` job의 log를 생성하지 않은 경우에는 log를 요청하지 않고 stage 상태만 저장하며, 오래된 개별 job log가 404 등으로 없어졌다면 해당 stage에 비민감 warning을 남기고 다른 stage와 run 상태의 영속화를 계속합니다. release evidence를 읽지 못한 경우에는 ApplicationRelease를 만들지 않습니다.

Direct Deployment와 Pipeline Run의 성공·실패·취소는 PostgreSQL terminal trigger가 같은 transaction에서
`notifications`와 `notification_outbox`에 기록합니다. 같은 `source:sourceId:status`는 unique key로 한 번만
생성되며 GitOps source Deployment는 Pipeline Run 알림과 중복 생성하지 않습니다. 전역 Inbox는 RDS의
읽음 상태를 사용하고 인증 SSE로 새 항목을 받습니다. browser Notification은 사용자가
`브라우저 알림 켜기`를 눌러 권한을 명시적으로 허용한 경우에만 Service Worker를 등록합니다.
denied/unsupported/exception 상태에서도 Inbox는 계속 동작합니다. 이 기능은 email, webhook 또는 운영
paging을 대신하지 않습니다.

Web Push 운영 설정은 다섯 값을 모두 제공하거나 모두 비워 기능을 끕니다.

```text
WEB_PUSH_VAPID_SUBJECT=mailto:ops@example.com
WEB_PUSH_VAPID_PUBLIC_KEY=<VAPID public key>
WEB_PUSH_VAPID_PRIVATE_KEY=<VAPID private key secret>
WEB_PUSH_SUBSCRIPTION_KEY_ID=v1
WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY=<32-byte base64url secret>
```

VAPID private key와 subscription encryption key는 ECS task definition의 `secrets`로만 주입합니다. Public
key, subject, key ID는 일반 environment에 둘 수 있습니다. 부분 설정은 API startup을 실패시켜 암호화되지
않은 fallback을 허용하지 않습니다. dispatcher는 5초마다 outbox를 claim하고 일시 실패를 최대 5회 bounded
backoff로 재시도합니다. HTTP 400/404/410, 만료, 복호화 실패 subscription은 비활성화하며 endpoint/key나
provider 응답 body는 로그에 남기지 않습니다. Inbox와 비활성 subscription은 90일 retention job으로
정리합니다.

Pipeline Run의 workflow run ID·attempt·execution kind, commit, branch, status, stage, start/end time, 조건부 Web/API URL과 마스킹된 ordered log는 RDS에 남습니다. Project discovery는 enabled/valid target을 모두 처리하고 GitHub Actions 조회를 target branch 최대 2 page와 최근 10 workflow run으로 제한하며, 특정 run refresh는 workflow run ID와 attempt로 고정합니다. Web/API URL의 source는 Terraform artifact output이 아니라 같은 Source Repository와 monitoring target branch에서 가장 최근에 생성된 non-draft/non-cancelled handoff의 user-accepted `staticSiteUrl`/`apiBaseUrl` 설정입니다. 생성 workflow는 이에 대응하는 repository variable을 검증합니다. API는 username/password, query, fragment가 없는 절대 HTTP(S) URL만 허용하며 path와 port는 보존합니다. `handoffId`/`appUrl`/`apiUrl`은 atomic provenance tuple이므로 적용 가능한 handoff가 없을 때만 기존 tuple 전체를 보존하고, handoff가 있으면 null URL을 포함한 새 tuple 전체로 교체합니다. 거부된 URL은 handoff 생성이나 Pipeline Run에 저장하지 않습니다. Runtime Cache는 짧은 pipeline/handoff status 조회를 보조할 뿐 원천 기록이 아닙니다. GitHub provider refresh는 read-only이며 repository commit, workflow, Environment, Actions variable 또는 AWS Resource를 변경하지 않습니다. repository settings, GitHub OAuth, AWS role diff apply는 각각 기존 user-accepted action과 permission gate를 통과해야 합니다.

적용 가능한 handoff가 없는 run의 upsert는 provenance tuple 필드를 update 대상에서 제외해 기존 accepted provenance를 보존합니다. nullable parameter를 PostgreSQL의 untyped `CASE WHEN $n IS NULL`로 전달하지 않으므로 신규 프로젝트나 취소된 handoff 이후의 첫 refresh도 commit/status/stage/log를 정상적으로 기록합니다.

`0033_git_cicd_pipeline_upstream_revision.sql`은 `upstream_ordering_token`과 `log_revision`을 추가합니다. Ordering token은 최대 provider 갱신 시각 뒤에 Infra/App presence와 각 workflow의 zero-padded run ID/attempt를 고정 슬롯으로 저장하므로, 같은 시각의 Infra+App snapshot은 어느 partial snapshot보다 항상 새롭습니다. Conditional upsert는 오래된 token과 같은 revision의 terminal-to-non-terminal 역행을 거부하며, 거부된 snapshot은 stage/log를 쓰지 않습니다. 운영 적용은 승인된 non-production/production migration workflow에서 별도로 실행하고 schema drift를 확인해야 합니다.

CI/CD `Activity`와 `Logs`는 GitHub Actions의 Detect, Build, Artifact Publish, Plan/Apply, Deploy, Health 증거만 보여줍니다. application Runtime log, CloudWatch 측정값, ASG/ECS capacity는 Live Observation에서 확인합니다. `Runtime logs는 Live Observation에서 보기`는 관측 화면으로 이동할 뿐 CI/CD run을 refresh하거나 status를 변경하는 mutation이 아닙니다. CI/CD Output action은 위 trusted handoff source가 있는 Pipeline Run에서 credential/query/fragment가 없는 유효한 HTTP(S) Web/API entry point만 조건부로 노출하며, 새 탭 링크는 `rel="noreferrer"` 경계를 유지합니다.

### 사용자 프로젝트 ECS/Fargate GitOps 릴리즈

GitOps application handoff는 프로젝트의 단일 `ProjectDeploymentTarget`이 ECS/Fargate이고 저장소 분석에서
API Dockerfile과 frontend package/lockfile/static output이 하나씩 확정됐을 때만 생성됩니다. 확인한 commit SHA와
build snapshot이 active SourceRepository와 다르면 `409 conflict`로 중단합니다. 임의 shell command와 AWS runtime
좌표는 workflow 입력으로 전달하지 않습니다.

ECS App workflow는 target branch push의 `${{ github.sha }}`와 GitHub OIDC token을 SketchCatch release-run API에
보냅니다. API는 repository, installation, workflow ref, commit을 재검증하고 프로젝트 lease를 획득한 뒤 build-only
CodeBuild와 trusted worker를 순서대로 제어합니다. workflow에는 AWS credential이나 CodeBuild/ECR/ECS/S3/CloudFront
좌표와 직접 mutation 명령이 없습니다. Build, Publish, Deploy, Health 상태와 제한된 evidence는 SketchCatch가
RDS에 기록하며 provider drift가 있으면 이전 성공 Release Ledger를 덮지 않습니다.

웹 포함 ECS release-run의 `outputUrl`은 trusted worker가 commit marker와 public health를 검증한 CloudFront HTTPS
주소다. 성공 또는 frontend 부분 실패 record가 이 URL을 Pipeline Run의 Web/API entry로 연결하며, CI/CD 화면의
QR과 Live Observation은 사용자가 선택한 정확한 run의 `ApplicationRelease.outputUrl`을 사용한다. 일반 handoff의
수동 URL을 이 verified release URL 대신 성공 evidence로 사용하지 않는다.

GitOps release가 ECS health 뒤 frontend 단계에서 실패하면 pipeline과 ApplicationRelease는 부분 실패로 끝납니다.
project owner가 `POST /api/git-cicd/release-runs/:runId/frontend/retry`를 호출하면 API가 만료되지 않은 동일
ReleaseCandidate와 frontend failure stage를 다시 확인하고 `retry_frontend` trusted worker를 dispatch합니다.
이 경로는 build, ECR publish, ECS update를 반복하지 않습니다. API 또는 worker 재시작 시 active task의 terminal
상태와 durable step을 먼저 확인하며, 상태를 확인할 수 없으면 새 fence나 사용자 AWS mutation을 허용하지 않습니다.

### 사용자 프로젝트 Lambda GitOps 릴리즈

Lambda GitOps handoff는 프로젝트 target이 `lambda`이고 현재 저장소 분석 revision에서
`template.yaml|yml`이 하나만 확인되며, 저장된 `samTemplatePath`와 monitoring app path가 일치할 때만
생성한다. App workflow는 upstream Infra workflow의 정확한 `head_sha`를 checkout하고 `sam validate`와
`sam build`를 수행한다. 저장된 SAM logical ID의 build directory만 ZIP으로 만들고 SHA-256 digest를
계산한 뒤 commit/digest 기반 S3 key에 업로드한다.

workflow는 기존 alias version을 읽고 ZIP digest와 Lambda `CodeSha256`이 같은 새 immutable version을
publish한다. CodeDeploy deployment group은 `CodeDeployDefault.LambdaAllAtOnce`와
`DEPLOYMENT_FAILURE` auto rollback이 모두 설정되어야 한다. AppSpecContent는 이전 version과 새 version을
명시하며, 성공 시 alias가 새 version인지 확인하고 HTTPS health URL을 검사한다. 실패 시 alias가 이전
version으로 복원될 때까지 제한된 시간만 재조회하고 `rolled_back` evidence를 남긴 뒤 workflow를 실패로
종료한다. CodeDeploy 성공 뒤 health check가 실패하면 workflow가 alias를 이전 version으로 즉시 복원하고
`failed` health evidence를 남긴다. 복원되지 않은 실패는 정상 rollback으로 기록하지 않는다.

API는 GitHub log의 bounded base64 evidence를 원문 대신 고정 메시지로 저장한다. verified AWS connection으로
Lambda alias, published version의 `CodeSha256`, CodeDeploy deployment/application/group/config/compute platform,
deployment group auto rollback을 다시 읽는다. weighted alias가 남아 있거나 digest, version, target 좌표,
AllAtOnce/rollback 정책이 다르면 release ledger를 갱신하지 않고 stale refresh로 보고한다. 검증된 결과만
공통 `application_releases`에 `lambda_alias` provider revision, artifact S3 URI, Output URL, health/rollback
evidence로 upsert한다.

### EC2/ASG GitOps 릴리즈

EC2/ASG target은 현재 저장소 분석 revision에서 정확히 하나로 확인된 source root의 `appspec.yml|yaml`만
사용한다. workflow는 해당 source root를 deterministic ZIP으로 만들고 SHA-256 checksum과 함께 versioning이
활성화된 release S3 bucket의 commit/digest key에 업로드한다. S3 `VersionId`가 없는 업로드는 배포하지 않는다.

배포 전에 CodeDeploy deployment group이 `Server`, `CodeDeployDefault.AllAtOnce`, 정확히 하나의 설정된
Auto Scaling group, `DEPLOYMENT_FAILURE` automatic rollback을 사용하는지 확인한다. 또한
`lastSuccessfulDeployment`의 versioned S3 revision을 rollback baseline으로 고정한다. CodeDeploy 실패는 AWS가
만든 rollback deployment가 성공할 때까지 확인한다. CodeDeploy가 일부 instance 성공만으로 성공을 반환해도
전체 target/success 집합이 다르면 release 실패로 판정하며, 이 경우와 배포 후 HTTPS health 실패 모두 같은 이전
revision으로 새 rollback deployment를 명시적으로 실행한다.

완료 시 workflow는 active deployment의 모든 target instance가 `Succeeded`인지 비교하고 Output URL health를
다시 확인한다. API는 verified connection으로 원본·활성 CodeDeploy revision, deployment group 정책, S3
`ChecksumSHA256`/`VersionId`, 현재 ASG의 `Healthy`·`InService` instance 집합을 재조회한다. 전체 집합과 digest,
revision이 일치해야만 공통 release ledger에 `codedeploy_deployment` provider revision과 health/rollback evidence를
기록한다. 실제 sandbox deploy, rollback, artifact cleanup은 공통 승인 게이트가 있는 #378에서 수행한다.

### Static S3/CloudFront GitOps 릴리즈

Static target은 현재 저장소 분석 revision에서 정확히 하나로 감지되고 개발자가 확인한 output 경로와 lockfile
install preset만 사용한다. workflow는 임의 command 대신 `pnpm --frozen-lockfile`, `npm ci`, 또는 Yarn frozen
lockfile preset으로 build한다. output은 source root 아래의 실제 directory여야 하고 `index.html`, symlink 금지,
1~10,000개 파일 제한을 통과해야 한다. 각 파일의 path, size, SHA-256을 정렬한 manifest로 만들고 manifest
digest를 `releases/<commit>/<digest>` immutable prefix로 사용한다.

hosting bucket의 versioning이 `Enabled`여야 한다. 새 immutable prefix에는 output과 manifest를 SHA-256
checksum으로 업로드하고 manifest `VersionId`를 기록한다. 같은 prefix가 이미 있으면 manifest byte와 전체 object
count가 정확히 일치할 때만 재게시 없이 사용한다. CloudFront distribution은 설정된 S3 bucket을 가리키는 정확히
하나의 origin이어야 하며, 현재 `OriginPath`와 기존 convergence custom header를 rollback baseline으로 저장한 뒤
새 release prefix와 비민감 artifact/target marker로 전환한다. marker는 artifact manifest 본문에 넣지 않으므로
deployment target 변경이 artifact digest를 바꾸지 않는다. distribution이 `Deployed`가 된 후 `/*` invalidation
완료와 HTTPS Output URL을 검증한다. distribution 전환, invalidation, health 검증이 실패하면 이전 path와 marker를
복원하고 새 invalidation 완료를 확인한다.

workflow는 bounded static release evidence만 로그 marker로 남긴다. API는 verified connection으로 manifest
VersionId/checksum/body, prefix의 정확한 object 집합, CloudFront ETag/status/origin path/domain/alias와 invalidation
status를 다시 조회한다. commit, digest, file count, active pointer, Output URL host가 모두 일치할 때만 공통
`ApplicationRelease` 원장에 `cloudfront_distribution` revision과 health/rollback evidence를 upsert한다. 실제
sandbox deploy, rollback, artifact cleanup은 공통 승인 게이트가 있는 #378에서 수행한다.

### Git/CI/CD 자동 배포 PR 산출물

Git/CI/CD 설치 PR은 인프라·앱 최초 Direct Deployment의 승인 Plan에서 생성한다. PR 생성 전에는 승인 Plan, active Source Repository, valid monitoring config, verified AWS connection, confirmed build config, runtime coordinates, 안전한 ECS HTTPS Output URL을 모두 재검증한다.

- `repository-settings/apply`: GitHub Environment와 Actions variables를 GitHub App 설치 권한으로 생성/갱신한다. 권한이 부족하면 `github_oauth_required`로 차단한다.
- `github-oauth/start`와 `repository-settings/apply-with-github-oauth`: GitHub App 권한만으로 부족한 경우 user OAuth 승인을 받아 Runtime Cache에 one-time token을 10분만 보관하고, 적용 직후 삭제한다.
- `aws-role-diff/apply`: 사용자가 승인한 GitHub OIDC trust policy diff만 IAM role에 적용하고, 다시 읽어서 검증한다.
- `scripts/smoke/git-cicd-auto-deploy.ps1`은 위 두 apply 단계, pipeline status, static URL marker 확인을 report JSON으로 남긴다.
- 실제 PR merge, Infra `workflow_dispatch`, Terraform apply, S3 release, ASG Instance Refresh, destroy는 비용과 credential, cleanup 승인이 있는 live smoke에서만 완료 증거로 인정한다.

자동 배포 handoff는 선택된 Source Repository에 PR을 만들며 다음 파일을 함께 생성합니다.

- `sketchcatch/<project>/terraform/<artifact>.tf`
- `.github/workflows/sketchcatch-infra.yml`
- `.github/workflows/sketchcatch-app.yml`
- `.github/workflows/sketchcatch-destroy.yml`
- `sketchcatch/<project>/ci-cd/repository-settings.json`
- `sketchcatch/<project>/ci-cd/aws-role-diff.json`
- ECS/Fargate target의 buildspec은 Repository 파일로 만들지 않고 SketchCatch API가 실행 시 생성한다.

`sketchcatch-infra.yml`은 push로 실행되지 않고 `workflow_dispatch`만 허용한다. 사용자가 `gh workflow run sketchcatch-infra.yml --ref main`을 실행하면 GitHub SHA로 checkout한 단일 job에서 Terraform backend를 준비하고 `terraform plan -out=tfplan`과 `terraform apply -auto-approve tfplan`을 순서대로 실행한다. 명령 실행 외의 별도 Environment approval은 없다. ECS/Fargate용 `sketchcatch-app.yml`은 application 경로의 target branch push에서만 SketchCatch release-run API를 호출하고 AWS를 직접 변경하지 않는다. ECS/Fargate의 실제 순서는 CodeBuild preflight → immutable candidate → trusted worker ECR/ECS → frontend S3/CloudFront → HTTPS health입니다. Lambda, EC2/ASG, static site의 기존 runtime adapter 계약은 별도 경로를 유지합니다. `sketchcatch-destroy.yml`은 수동 실행과 Environment approval 뒤 같은 S3 backend로 `terraform destroy`를 실행합니다.

Infra Workflow는 Terraform 실행 전 OIDC로 Infra Run API에 repository, ref, commit SHA, workflow run ID·attempt를 등록한다. Plan·Apply 동안 heartbeat를 유지하고 terminal result를 complete API로 보고한다. Direct·App·Infra 중 다른 실행이 project lease를 소유하면 인프라 실행을 대기시키지 않고 즉시 실패시킨다.

Infra와 Destroy workflow는 Terraform root에 backend 선언이 없으면 임시 `backend "s3"` 선언을 추가합니다. 이미 선언이 있으면 `s3`인지 검증하고 다른 backend는 중복 선언이나 local state fallback 없이 실패시킵니다.

Repository settings와 IAM role 변경은 preview JSON으로 PR에 남깁니다. 실제 repository variables/environment 설정과 AWS role trust/policy 변경은 GitHub App 권한 또는 GitHub user OAuth 추가 승인, AWS role diff 승인, secret masking을 통과한 별도 mutation path에서만 수행해야 합니다. OAuth token 원문은 DB/로그/API 응답에 저장하지 않습니다.

## 프로젝트 배포 non-production sandbox E2E

Direct와 GitOps의 실제 인수 검증은 production 계정이나 production SketchCatch/API repository에서 실행하지
않는다. 실행자는 먼저 아래 환경 변수를 process memory에만 설정하고 preflight를 통과해야 한다.

| 환경 변수 | 의미 |
| --- | --- |
| `SKETCHCATCH_SANDBOX_MUTATION_APPROVED=true` | 이번 실행의 cloud/GitHub mutation 승인 |
| `SKETCHCATCH_SANDBOX_AWS_PROFILE` | STS 조회가 가능한 non-production AWS CLI profile |
| `SKETCHCATCH_SANDBOX_AWS_ACCOUNT_ID` | 승인 시 확인한 12자리 sandbox account |
| `SKETCHCATCH_SANDBOX_REGION` | 실행 region |
| `SKETCHCATCH_SANDBOX_API_BASE_URL` | production이 아닌 HTTPS SketchCatch API |
| `SKETCHCATCH_SANDBOX_ACCESS_TOKEN` | sandbox 사용자 token. report에 기록하지 않음 |
| `SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID` | 위 account를 가리키는 verified AWS Connection |
| `SKETCHCATCH_SANDBOX_GITHUB_REPOSITORY` | production이 아닌 GitOps fixture repository |
| `SKETCHCATCH_SANDBOX_CLEANUP_OWNER` | destroy와 잔여 artifact를 확인할 사람 |
| `SKETCHCATCH_SANDBOX_BUDGET_USD` | 실행 전에 승인한 양수 비용 상한 |

`preflight`는 AWS CLI로 STS identity를 직접 읽고 승인 account와 비교한다. 이어 sandbox API의 AWS
Connection 목록과 `/test`를 호출해 저장된 connection이 현재도 같은 account/region을 AssumeRole할 수 있는지
재검증한다. production AWS account `555980271919`, `sketchcatch.net`, `NearthYou/SketchCatch`는 기본 deny
대상이다. token 원문은 출력하지 않는다.

```powershell
pnpm sandbox:e2e preflight
```

인수 실행은 같은 `runId` 아래 다음 순서로 진행한다.

1. Direct `infrastructure`, `application`, `full_stack` scope를 각각 `검증 → 승인 → 배포`하고 revision
   hash, 로그 hash, Output, release identity를 수집한다.
2. `ecs_fargate`, `lambda`, `ec2_asg`, `static_site` fixture commit을 push하고 감지 SHA, GitHub Actions
   run/stage/log hash, release version/digest/provider revision, HTTPS Output 응답을 수집한다.
3. 각 runtime에 의도한 실패 revision을 한 번 배포해 이전 검증 revision 복원과 health 회복을 확인한다.
4. `full_stack` Output으로 15분 QR 관측을 열고 실제 요청 receipt와 CloudWatch request/error/latency/capacity
   snapshot을 수집한다. 같은 terminal event가 영속 Inbox와 실제 Web Push provider delivery에 도착했는지
   확인한다.
5. Direct 세 deployment를 Destroy하고 GitOps destroy workflow를 완료한 뒤 ECR, S3, CodeBuild,
   CloudWatch를 provider API로 다시 조회한다. 잔여 임시 리소스가 하나라도 있으면 실패다.

최종 JSON report는 `scripts/smoke/deployment-sandbox-e2e.mjs`의 schema 검증을 통과해야 한다. 검증기는
Direct 3개 scope와 GitOps 4개 runtime의 정확한 집합, commit/release/Output 정합성, runtime별 rollback,
실측 관측·알림, Direct Destroy, 네 cleanup 범주의 `remainingCount: 0`, `productionMutation: false`를 모두
요구한다. credential-bearing URL이나 token 형태가 포함된 report도 실패한다.

```powershell
pnpm sandbox:e2e verify <sandbox-report.json>
```

preflight나 최종 검증이 실패하면 issue를 완료하거나 `feature_list.json`을 `passing`으로 바꾸지 않는다.
실제 실행 후 report에는 비용 범위, cleanup owner, known risk를 남기되 credential, capability, raw log는
남기지 않는다.

## Direct Deployment 사용자 단계

사용자에게 노출하는 흐름은 다음 세 단계다.

1. `검증`: `Ctrl+S`/`Command+S` 또는 `저장하고 배포`로 Board와 Terraform working draft를 한 번의
   ProjectDraft 저장으로 고정하고, Pre-Deployment Check와 Terraform Plan을 수행한다.
2. `승인`: 배포 범위, 변경량, blocker, 비용·보안 경고를 확인하고 준비 snapshot과 Plan을 승인한다.
3. `배포`: 승인된 snapshot을 실행하고 상태, 릴리즈 버전, Output URL을 확인한다. Destroy도 같은
   `검증 → 승인 → 배포` 구조를 사용한다.

`저장하고 배포`는 저장 성공 후에만 콘솔을 연다. prepare 요청은 저장된 draft revision을 포함하며 서버의
현재 revision과 다르면 `409 conflict`로 중단한다. `/execute`는 기존 Apply 안전 게이트와 같은 경로를
사용하며 승인 snapshot, Terraform artifact, tfplan, AWS account/region을 다시 확인한다. Raw hash,
리소스 inventory, 전체 로그는 기본 요약에서 접힌 세부정보로 제공한다.

## Direct Deployment Path 실행 순서

사용자에게는 scope와 관계없이 `검증 → 승인 → 배포` 세 단계만 노출한다. 내부 실행은 scope별로 분리한다.

| Scope | 검증 | 배포 |
| --- | --- | --- |
| `infrastructure` | Terraform init/plan/show와 안전·비용·보안 검사 | 승인된 tfplan apply, output/state 저장 |
| `application` | build-only CodeBuild로 확인된 commit의 immutable candidate 준비와 approval manifest 저장 | trusted worker가 같은 candidate를 runtime에 활성화하고 AWS 상태·HTTPS health 재검증 |
| `full_stack` | build-only CodeBuild candidate 준비 후 Terraform plan과 공통 검사 | Terraform apply/output/state/resource 저장 후 trusted worker가 같은 candidate를 활성화 |

`application`은 Terraform 명령을 실행하지 않는다. `full_stack` ECS는 검증 단계에서 Output URL이 아직 없어도
immutable artifact를 준비할 수 있다. Apply 뒤 Terraform 결과를 먼저 저장하고, 비민감 HTTPS
`api_base_url`과 준비 시점 runtime 좌표가 일치할 때만 project target의 Output URL을 원자적으로 연결한 뒤
runtime release를 시작한다. output 누락·안전성 위반·좌표 또는 기존 URL 충돌과 runtime release 검증 실패는
전체 Deployment를 성공으로 표시하지 않으며, 이미 저장한 Terraform state/resource/output 증거는 보존한다.
Direct release는 GitOps와 같은 `ApplicationRelease`에 version, commit SHA, API OCI와 frontend manifest를 묶은
composite SHA-256, provider revision, frontend VersionId/invalidation, Output URL, health, rollback evidence를
저장한다. candidate는 SketchCatch 내부 Artifact S3에 두며 사용자 서비스 S3와 구분한다.

신규 Repository 기반 ECS/Fargate 웹 프로젝트는 `auto`에서 `full_stack`을 선택해 최초 앱까지 배포한다. ECS target은 있지만 confirmed build config가 없으면 `infrastructure`로 조용히 축소하지 않고 설정 확정을 요구한다. infrastructure-only 성공과 bootstrap 문서는 CI/CD 설치 조건을 충족하지 않는다. 이 경우 CI/CD 화면의 `최초 앱 배포하기`가 Direct `application` scope를 열고, 앱 릴리즈 성공 뒤에만 CI/CD 화면으로 돌아와 readiness를 갱신한다.

`infrastructure` 또는 `full_stack` ECS/Fargate Apply는 Terraform Output과 resource inventory를 RDS에 저장한
직후, application release 전에 같은 증거로 `ProjectDeploymentTarget` metadata 동기화를 시도한다. 이 후처리는
RDS와 승인된 Plan artifact만 사용하며 AWS Resource를 생성·수정·삭제하지 않는다. 필수 Output이나 Repository
빌드 근거가 불완전하면 readiness가 해당 항목을 수동 action으로 표시한다. 일시적인 metadata 동기화 오류는
Deployment log에 warning으로 남기되 이미 성공한 Terraform Apply를 `FAILED`로 되돌리지 않는다.

`application` Destroy는 Terraform을 실행하지 않는다. 현재 release와 이전 정상 revision을 담은
`application-release-cleanup-plan.json`을 생성하고 account/region/hash 승인을 받은 뒤 trusted worker가
이전 revision을 복구한다. 승인 뒤 release revision이 바뀌면 실행을 거부하며, AWS adapter 재조회가 복구 상태를
확인한 경우에만 `DESTROYED`로 완료한다. `infrastructure`와 `full_stack`은 Terraform state 기반 Destroy를 유지한다.

아래 순서는 `infrastructure`와 `full_stack`의 Terraform 내부 실행 증거다. UI 단계 수를 뜻하지 않는다.

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
15. Deployment History, TerraformOutput, DeployedResource 저장 (`RUNNING` 유지)
16. ECS/Fargate이면 성공 Output으로 ProjectDeploymentTarget metadata best-effort 동기화
17. full_stack이면 Apply output/resource identity와 runtime fingerprint 재검증
18. trusted worker가 API OCI archive를 ECR에 push하고 새 ECS revision task health 확인
19. frontend assets, index.html, CloudFront /* invalidation, public commit marker 순서로 활성화
20. 모든 scope별 실행이 끝난 뒤 SUCCESS 또는 PARTIALLY_FAILED 표시
21. cleanup 필요 시 terraform plan -destroy
22. 사용자 승인
23. destroy tfplan apply
24. DESTROYED 상태와 cleanup 결과 확인
```

완료 기준:

- Plan 실패 시 Apply 단계로 넘어가지 않습니다.
- 승인 전 계정, region, 생성/수정/삭제 리소스, 비용/위험 요약을 표시합니다.
- Plan 승인 화면의 최소 요약은 현재 `terraform show -json tfplan` 결과에서 생성합니다.
- Pre-Deployment Check와 Safety Gate warning은 Plan 결과에 보존하되 Plan record 자체나 Plan 승인을 blocked로 만들지 않습니다. High warning이 있어도 사용자는 Plan을 승인할 수 있으며, finding은 승인 전 검토 정보로 계속 표시합니다.
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

### ECS/Fargate 전환 기반

ECS 정상 경로는 nginx 없이 ALB가 API와 web 서비스로 직접 전달합니다. production Route53 alias는 ECS ALB를 가리키며 DNS 변경은 별도 plan 검토와 명시적 승인이 필요합니다.

Terraform 정의는 `infra/aws/terraform`에 있습니다.

- API와 web은 각각 독립된 Fargate task definition과 ECS service를 사용합니다.
- ALB listener는 `/api`, `/api/*`, `/health`, `/health/db`를 API target group으로, 나머지 `/*`를 기본 web target group으로 전달합니다.
- API target group은 port `4000`, web target group은 port `3000`이며 둘 다 Fargate `awsvpc`에 맞춘 `ip` target mode입니다.
- ALB가 `X-Forwarded-For`와 `X-Forwarded-Proto`를 전달하고, Fastify는 production topology의 ALB 한 hop만 신뢰합니다. 임의의 leading `X-Forwarded-For` 값은 client IP rate-limit identity로 사용하지 않습니다.
- Next.js client의 API base URL은 same-origin `/api`입니다. `API_PROXY_TARGET` rewrite는 local/dev fallback이며 production ALB의 `/api` rule보다 앞서지 않습니다.
- 기존 EC2 ALB와 legacy ECS target은 제거되어 ECS ALB만 production traffic을 받습니다.
- NAT Gateway는 기본 생성하지 않고 public Fargate + ALB 구조를 유지합니다.
- API secret은 ECS task definition의 `secrets` reference로 전달합니다.

이 정의는 비용이 발생하는 ALB, API task, web task, CloudWatch Logs, ECR repository를 포함합니다. API와 web은 각각 autoscaling `min=1`, `max=2`로 운영해 평소 두 task만 실행하고 CPU 부하가 있을 때만 service별 두 task까지 확장합니다. Container Insights는 비용 때문에 켜지 않고 ALB `HealthyHostCount`로 serving task 0을 감시합니다.

warm rollback용 EC2, ALB, CloudFormation stack, legacy ECS service와 target group은 삭제했습니다. `.github/workflows/deploy.yml`과 `provision-https.yml`도 제거해 자동 또는 수동 routine 경로로 재생성되지 않게 했습니다. `deploy/ec2`는 cold restore 때 검증 artifact를 실행하는 참고 도구로만 남습니다.

### ECS 배포 워크플로

`Deploy Production ECS`는 수동 실행하며 `docker save`와 S3 image tarball 업로드를 사용하지 않습니다. `main` 병합 자체는 production cloud resource를 변경하지 않습니다.

ECS 배포 흐름:

```text
GitHub Actions
-> pnpm lint/typecheck/build
-> api/web Docker image build
-> ECR push
-> 현재 API/web/worker task definition 조회
-> worker task definition을 새 API image로 등록
-> API의 ECS_WORKER_TASK_DEFINITION을 새 worker revision으로 갱신
-> API/web task definition revision을 병렬 등록하고 service 안정화 대기
```

두 ECS service update는 병렬이지만 원자적이지 않습니다. 한 service만 성공하면 API와 web revision이 달라질 수 있으므로 image SHA와 각 service revision을 기록하고 실패한 service를 재배포하거나 성공한 service를 이전 revision으로 되돌려야 합니다. worker revision은 API 배포 전에 등록되며 API task definition이 해당 ARN을 명시적으로 참조합니다. 정상 ECS 배포에서는 DB migration을 자동 실행하지 않으며 별도 수동 workflow에서 다룹니다.

단일 app service에서 API/web service로 분리하는 cutover는 완료됐습니다. 현재 listener에는 API/web target만 있으며 legacy service나 weighted rollback target이 없습니다.

ECS workflow에 필요한 GitHub `production` environment variables:

```text
AWS_REGION=ap-northeast-2
AWS_ROLE_TO_ASSUME=<GitHub Actions OIDC Role ARN>
ECR_API_REPOSITORY=sketchcatch-production-api
ECR_WEB_REPOSITORY=sketchcatch-production-web
ECS_CLUSTER_NAME=sketchcatch-production-cluster
ECS_API_SERVICE_NAME=sketchcatch-production-api
ECS_WEB_SERVICE_NAME=sketchcatch-production-web
ECS_API_TASK_DEFINITION_FAMILY=sketchcatch-production-api
ECS_WEB_TASK_DEFINITION_FAMILY=sketchcatch-production-web
ECS_WORKER_TASK_DEFINITION_FAMILY=sketchcatch-production-worker
ECS_API_CONTAINER_NAME=api
ECS_WEB_CONTAINER_NAME=web
ECS_WORKER_CONTAINER_NAME=worker
```

ECS workflow는 application secret 원문을 GitHub Actions log나 task definition 파일에 직접 쓰지 않습니다. API task definition에 필수 secret reference가 없거나 같은 이름이 평문 `environment`에 있으면 배포를 중단합니다.

API/web ECS service의 task revision은 GitHub Actions가 관리하고 Terraform은 service의 `task_definition` drift를 무시합니다. Application Auto Scaling이 desired count를 관리하므로 Terraform도 `desired_count` drift를 무시합니다. network, ALB 연결, autoscaling target, deployment circuit breaker, `minimumHealthyPercent=100`, `maximumPercent=200`은 Terraform 관리 범위입니다.

### SketchCatch production infrastructure Terraform

Phase 9부터 SketchCatch 자체 production infrastructure를 Terraform-managed IaC로 전환할 구조를 `infra/aws/production`에 둡니다. 이 경로는 사용자의 Direct Deployment Path 및 Git/CI/CD Deployment Path와 state, credential, workflow를 공유하지 않습니다.

| group             | root                                   | 범위                                                   | 기본 보호                                                                 |
| ----------------- | -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `runtime`         | `infra/aws/terraform`                  | ECS, ALB, ECR, IAM, CloudWatch, runtime security group | 기존 `production/ecs-foundation/terraform.tfstate` 유지, state audit 우선 |
| `edge`            | `infra/aws/production/edge`            | Route53, ACM                                           | DNS/certificate owner와 rollback 승인 전 빈 root                          |
| `data`            | `infra/aws/production/data`            | S3 artifact bucket, RDS, Redis/ElastiCache             | backup/deletion protection/restore evidence 전 빈 root                    |
| `legacy-rollback` | `infra/aws/production/legacy-rollback` | encrypted AMI 기반 임시 EC2/ALB cold restore           | 기본 disabled, incident 승인 때만 생성                                    |

모든 group은 versioning과 encryption이 적용된 production S3 backend의 서로 다른 key를 사용하고 `use_lockfile = true`로 lock을 획득합니다. runtime key는 state migration이 승인되기 전까지 변경하지 않습니다. backend bucket은 자신의 state에서 관리하지 않습니다.

`Production Infrastructure Plan` workflow는 `workflow_dispatch`와 GitHub Environment `production-infra-plan` required reviewer를 사용합니다. group별 `<group>-review-only` 문자열, resource-read-only AWS plan role, 선택한 exact state/lock key 권한이 있어야 review-only Plan이 실행됩니다. Runtime Cache 복구 apply는 `runtime-cache-ingress` scope, 성공한 review-only run ID, exact head SHA, `runtime-cache-ingress-apply-<run-id>` 확인 문자열을 모두 검증합니다. 새 binary plan이 API/worker Redis ingress 두 건의 `create`만 포함할 때만 1일 retention artifact로 전달하고, `production` Environment 배포 역할로 해당 plan 파일을 apply한 뒤 artifact를 즉시 삭제합니다. `destroy`, `import`, `-auto-approve`는 허용하지 않습니다. runtime plan은 전체 production tfvars JSON이 없으면 실패합니다.

전체 runtime Apply는 별도 승인 경로다. `apply-reviewed-runtime-complete`는 같은 review-only run ID와 exact head SHA, `runtime-complete-apply-<run-id>` 확인 문자열, repository owner dispatch, `production` Environment 승인을 모두 요구한다. 새 binary plan은 API/worker Task Definition 교체, web 서비스 안정화 값, ALB/Target Group, web metric filter, artifact bucket CORS, `ecs_task`·`ecs_worker_execution` inline policy만 정확히 포함해야 한다. API/worker image, 기존 Secret 연결, worker execution role의 기존 Secret 접근이 달라지거나 영구 리소스 삭제가 있으면 apply 전에 fail-closed로 중단한다.

apply를 승인하기 전에 `GitHubActionsDeployRole`에는 `infra/aws/iam/github-actions-deploy-policy.json`의 최신 정책이 연결되어 있어야 합니다. Runtime Cache 복구 권한은 `production/ecs-foundation/terraform.tfstate`와 그 `.tflock`, 현재 Runtime Cache 보안 그룹의 ingress 생성 및 결과 조회로 제한합니다. 보안 그룹 교체로 ARN이 바뀌면 정책 템플릿과 정적 검증을 함께 갱신하고 별도 IAM 변경 승인을 거쳐야 하며, workflow 자체는 IAM을 변경하지 않습니다.

import는 다음 순서를 지킵니다.

1. 현재 state와 실제 remote object의 ownership을 대조합니다.
2. 하나의 service family만 resource/import block PR로 준비합니다.
3. backup, import ID, destination address, rollback owner를 검토합니다.
4. review-only plan을 `0 add / 0 change / 0 destroy`로 맞춥니다.
5. 별도 live approval 뒤에만 import를 수행하고 다시 zero-change plan을 확인합니다.

Route53/ACM, S3/RDS/Redis는 같은 import batch로 묶지 않습니다. CloudFormation stack이 소유한 child resource는 stack이 존재하는 동안 Terraform으로 중복 소유하지 않습니다. 기존 `aws_route53_record.ecs_alias`를 edge로 옮길 때도 중복 import가 아니라 승인된 state move 또는 ownership handoff가 필요합니다.

상세 inventory, backend key와 IAM 경계는 `infra/aws/production/README.md`와 `import-manifest.json`을 따릅니다. runtime live apply는 명시 승인과 저장 plan 검토 뒤에만 수행하며 edge/data/cold-rollback state는 각각 별도 승인을 유지합니다.

## Cold rollback artifact

- encrypted sanitized AMI: `ami-0a65f0b7656bf2221`
- encrypted snapshot: `snap-04862810b1ed8a101`
- verified release SHA: `e5bea5ed27316f64258718b3064f67ec03369b53`
- Docker archive: `s3://sketchcatch-555980271919-ap-northeast-2-an/sketchcatch/docker/e5bea5ed27316f64258718b3064f67ec03369b53.tar.gz`
- archive size: `166650766` bytes
- archive SHA256: `138dcc19a7e67ee4a658f2a6139349c3c8161047fdc0782d84514f07158e7161`

AMI에는 runtime secret과 container를 제거했으며 secret은 복구 시 ECS task definition이 참조하는 Secrets Manager/SSM에서 다시 주입합니다.

## GitHub 변수

GitHub repository의 `production` 환경 변수에는 다음 값을 설정합니다.

```text
AWS_REGION=ap-northeast-2
AWS_ROLE_TO_ASSUME=<GitHub Actions OIDC Role ARN>
S3_BUCKET_NAME=sketchcatch-555980271919-ap-northeast-2-an
RDS_ENDPOINT=<RDS 엔드포인트>
DATABASE_SSL=true
TF_PLUGIN_CACHE_DIR=/var/cache/sketchcatch/terraform-plugin-cache
TRIVY_CACHE_DIR=/var/cache/sketchcatch/trivy
CLOUDWATCH_LOGS_ENABLED=false
CLOUDWATCH_LOG_GROUP_PREFIX=/sketchcatch/production
LIVE_OBSERVATION_ENABLED=false
```

`TF_PLUGIN_CACHE_DIR`과 `TRIVY_CACHE_DIR`은 ECS task의 ephemeral 경로입니다. worker는 one-off task이며 host volume cache에 의존하지 않습니다.

API startup은 listen 전에 작은 Terraform 구성을 한 번 검사해 Trivy process와 policy loading을 미리 수행합니다. Warm-up이 실패하면 warning을 기록하고 API startup과 deterministic fallback 검사는 계속합니다.

동일 Terraform 파일 집합의 Trivy finding은 SHA-256 key로 process-local cache와 Redis Runtime Cache에 5분간 보관합니다. 같은 API process의 동일 key 검사는 진행 중인 scan 하나를 공유합니다. Key에는 Trivy version, checks bundle digest와 제외 rule 정책도 포함하며, cache read/write가 실패하면 cache를 우회해 실제 검사를 계속합니다.

첫 요청의 응답 시간은 Trivy CLI 시작 시간과 분리합니다. Public S3, 공개 SSH, Public RDS, IAM wildcard 핵심 규칙은 API process 안에서 즉시 검사하고, Trivy 심층검사는 Runtime Cache에 상태를 기록하는 백그라운드 작업으로 실행합니다. 심층검사가 완료되기 전에는 Plan을 시작하지 않습니다.

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
- `ec2-runtime-policy.json`: cold rollback instance profile을 재사용할 때만 검토할 legacy runtime 권한

`ecs:RegisterTaskDefinition`과 `ecs:DescribeTaskDefinition`은 ECS service authorization에서 요청 시점의 family resource scope를 지원하지 않으므로 `Resource: "*"` 예외를 사용합니다. 대신 ECR repository, ECS service, worker `RunTask`, task ARN, `iam:PassRole`, RDS snapshot prefix와 SNS topic을 각각 exact ARN으로 제한합니다.

GitHub ECS deploy/migration role은 ECS API/web/worker task family, service, worker `RunTask`/`DescribeTasks`, RDS pre-migration snapshot과 worker roles `iam:PassRole`에만 필요한 권한을 가져야 합니다.

승인된 Runtime Cache ingress Terraform apply를 수행할 때만 같은 role에 exact runtime state/lock 객체 접근, 현재 Runtime Cache 보안 그룹과 AWS가 생성 시 함께 평가하는 신규 `security-group-rule/*`에 대한 `ec2:AuthorizeSecurityGroupIngress`, 그리고 `ec2:DescribeSecurityGroupRules`/`ec2:DescribeSecurityGroups` 조회를 추가합니다. exact Cache 보안 그룹 승인을 동시에 요구하므로 다른 보안 그룹에는 적용할 수 없습니다. provider 기본 태그를 위한 `ec2:CreateTags`도 `ec2:CreateAction=AuthorizeSecurityGroupIngress` 조건에서 생성 시점에만 허용합니다. state 객체의 삭제와 security group ingress revoke 권한은 이 복구 경로에 포함하지 않습니다.

사용자 AWS 계정 연결은 SketchCatch가 생성한 CloudFormation Quick Create URL로 connection-scoped IAM Role을 만드는 방식을 기본으로 합니다. 2026-07-07 기준 새 AWS 연결 Quick Create 템플릿은 사용자 계정에 `SketchCatchTerraformExecutionRole-<connection-prefix>` 형식의 Role을 생성합니다. 예전 고정 이름 `SketchCatchTerraformExecutionRole` Role이 사용자 AWS 계정에 남아 있어도 새 Stack 생성이 같은 `RoleName`으로 충돌하지 않도록 하기 위함입니다. 템플릿은 External ID가 포함된 trust policy와 MVP demo용 `AWS::IAM::Policy`를 함께 생성합니다. 정책 이름은 Stack 이름을 포함해 같은 Role에 고정 이름 inline policy를 다시 붙이는 충돌을 줄입니다. MVP demo 권한은 VPC, Subnet, Internet Gateway, Route Table, Security Group, EC2, S3 실습을 막힘 없이 검증하기 위해 `ec2:*`와 `s3:*`를 허용합니다. 사용자는 stack 생성 후 AWS account ID만 SketchCatch에 입력하고, API는 `arn:aws:iam::<accountId>:role/SketchCatchTerraformExecutionRole-<connection-prefix>`를 계산해 STS AssumeRole 검증을 수행합니다. 기존 고정 이름 Role은 하위 호환을 위해 검증/사용을 계속 허용합니다. SketchCatch 런타임 Role에는
`arn:aws:iam::*:role/SketchCatchTerraformExecutionRole`와
`arn:aws:iam::*:role/SketchCatchTerraformExecutionRole-*` 양쪽에 대한 `sts:AssumeRole` 권한이
필요합니다.

Direct application release용 연결 Role은 CodeConnections 생성·조회·사용, 프로젝트 CodeBuild project와
build-only service role의 create/reconcile, `codebuild:BatchGetProjects`, `StartBuild`, `BatchGetBuilds`, `StopBuild`를
허용합니다. 동적으로 생성하는 service role에는 SketchCatch 관리 permissions boundary를 반드시 연결합니다.
CodeBuild service role에는 Repository checkout, log 전송, SketchCatch API가 발급한 presigned multipart upload와 프로젝트 전용 build-cache ECR layer read/write만
허용하며 사용자 배포용 ECR/ECS/서비스 S3/CloudFront/`iam:PassRole` 권한을 주지 않습니다. 실제 application mutation은 trusted
worker가 연결 Role을 AssumeRole하면서 승인된 resource ARN으로 제한한 session policy를 사용합니다. 기존
CloudFormation Stack은 템플릿 변경이 자동 반영되지 않으므로 개발 단계의 기존 연결은 다시 연결해야 합니다.

현재 trusted worker는 ECR `BatchCheckLayerAvailability`, layer upload, `PutImage` AWS SDK API로 OCI layout을
게시합니다. ECR 인증 capability인 `ecr:GetAuthorizationToken`은 AWS가 repository ARN scope를 지원하지 않으므로
별도 `Resource: "*"` statement로 격리하고, 실제 layer/image action은 승인된 ECR repository ARN으로만 제한합니다.
ECR/ECS와 frontend S3/CloudFront는 STS 2,048자 제한과 권한 분리를 위해 서로 다른 phase session policy를
사용합니다.

CodeConnections 생성은 RDS의 `CREATING` 예약이 AWS `CreateConnection`보다 먼저입니다. 동시 요청은 예약 row를
공유하고, 생성 도중 API가 중단되면 결정적 이름과 SketchCatch ownership tag가 모두 맞는 AWS connection만
재채택합니다. 프로젝트 또는 AWS connection 삭제도 RDS deletion claim을 먼저 기록해 새 lease와 build 환경
준비를 차단한 다음 managed CodeBuild/role/CodeConnections를 정리합니다. cleanup이 실패하면 metadata를 지우지
않고 claim을 해제해 다시 시도할 수 있습니다.

GitHub 빌드 연결만 해제할 때도 사용자 확인 뒤 기존 managed cleanup으로 SketchCatch 소유 Resource만 정리합니다.
CodeConnection을 `DELETING`으로 claim해 새 build 준비를 막고, 진행 중인 build·deployment가 없을 때만
CodeBuild project, 전용 Role, log group, build cache ECR, CodeConnection을 삭제합니다. AWS 계정 연결과
배포된 application/runtime Resource는 삭제하지 않습니다. 상태 새로고침과 Direct/GitOps 실행은
`DELETING` 상태를 사용할 수 없으며, 중단된 claim은 1시간 뒤 같은 정리를 재시도할 수 있습니다.

## CloudWatch Logs

ECS task는 `awslogs` log driver로 API/web/worker 로그를 보냅니다.

예상 로그 그룹:

```text
/sketchcatch/production/ecs/api
/sketchcatch/production/ecs/web
/sketchcatch/production/ecs/worker
```

알람 설정 예시는 `infra/aws/cloudwatch-alarms.md`에 있습니다.

## HTTPS

`sketchcatch.net`은 Route53 alias, retained ACM DNS validation certificate와 ECS public ALB로 제공됩니다. HTTP는 HTTPS로 redirect하고 HTTPS listener가 API/web target group으로 직접 전달합니다. 기존 CloudFormation ALB stack과 `Provision HTTPS` workflow는 삭제됐습니다.

성공 후 확인:

```bash
curl -I https://sketchcatch.net
curl https://sketchcatch.net/health
curl https://sketchcatch.net/health/db
```

ACM certificate ARN은 `arn:aws:acm:ap-northeast-2:555980271919:certificate/41364729-a158-4a3e-a8c0-8a268f8a218d`이며 cold restore에서도 동일 certificate를 명시 입력합니다.

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
- Workflows: Read and write
- Administration: Read and write
- Environments: Read and write
- Variables: Read and write
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

ECS 전환 뒤에는 CloudFormation stack output `SecurityGroupId`를 production runtime Terraform의 `runtime_cache_security_group_id`에 입력합니다. review-only production Plan 워크플로는 `RedisUrl`과 `SecurityGroupId` output을 함께 가진 Runtime Cache stack을 정확히 하나만 허용하고, 보안 그룹이 complete runtime tfvars의 VPC에 속하는지 검증한 뒤 이 값을 자동 주입합니다. 장애 복구 검토에서는 `runtime_plan_scope=runtime-cache-ingress`로 두 ingress 규칙만 계획해 다른 runtime drift와 분리하고, 전체 검토에서는 `complete`를 사용합니다. runtime Terraform이 현재 ECS API 보안 그룹과, worker dispatch가 활성화된 경우 ECS worker 보안 그룹에서만 `runtime_cache_port`로 들어오는 ingress를 관리합니다. `live_observation_enabled=true` 또는 `enable_ecs_worker_dispatch=true`인데 이 연결이 없으면 plan을 실패시켜, ECS 이전 보안 그룹만 남은 상태에서 배포가 성공한 것처럼 보이지 않게 합니다.

검증 대상:

- Deployment log cursor가 Runtime Cache를 사용할 수 있는지
- Git/CI/CD pipeline status cache가 Runtime Cache를 사용할 수 있는지
- Redis 장애 또는 미설정 시 in-memory fallback으로 degraded 동작이 가능한지
- Live Observation이 활성화된 production에서는 존재하지 않는 UUID의 public bootstrap이 `404 LIVE_OBSERVATION_COLLECTOR_NOT_FOUND`를 반환하는지. `503 LIVE_OBSERVATION_COLLECTOR_UNAVAILABLE`이면 Redis endpoint, TLS 또는 보안 그룹 연결을 복구해야 함

로컬 검증:

```powershell
docker compose -f infra/local/docker-compose.yml up -d postgres redis
$env:REDIS_URL="redis://localhost:6379"
pnpm --filter @sketchcatch/api test -- runtime-cache
```

## Live Observation 운영 설정

Live Observation은 verified manifest가 있는 성공 Deployment의 실제 Output URL, CloudWatch 측정값, ASG 또는 ECS/Fargate capacity, 최근 runtime log를 15분 동안 관측하는 opt-in 기능입니다. 운영 API runtime에는 다음 비민감 환경 변수를 주입합니다.

```text
LIVE_OBSERVATION_ENABLED=false
SKETCHCATCH_PUBLIC_BASE_URL=https://sketchcatch.net
```

`SKETCHCATCH_PUBLIC_BASE_URL`은 audience page가 public Live Observation API를 호출할 기준 origin입니다. Nginx/ALB는 이 origin의 `/api/live-observations/...` 요청을 API로 전달해야 하며 exact SketchCatch Web origin만 CORS 응답을 받을 수 있습니다.

운영 조립은 v2 Store route만 등록하며 legacy token path와 direct `/events` route는 등록하지 않습니다. audience URL은 `/observe/:observationId`이고 session-bound transient capability는 exact-Origin bootstrap 응답으로만 전달되며 URL, RDS, Redis, browser storage, 로그에 저장하지 않습니다. 같은 active session의 여러 audience client가 bootstrap을 반복하는 것은 정상 동작입니다.

`LIVE_OBSERVATION_ENABLED=true`이면 application startup은 다음 capability keyring을 필수로 검증합니다.

```text
LIVE_OBSERVATION_CAPABILITY_CURRENT_KID=<1-32 character safe kid>
LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET=<32-byte unpadded base64url>
LIVE_OBSERVATION_CAPABILITY_PREVIOUS_KID=
LIVE_OBSERVATION_CAPABILITY_PREVIOUS_SECRET=
LIVE_OBSERVATION_CAPABILITY_PREVIOUS_STOPPED_ISSUING_AT=
```

`CURRENT_KID`와 `CURRENT_SECRET`은 capability require 함수를 호출할 때 필수다. previous 3개 값은 rotation 동안에만 all-or-none으로 설정한다. secret은 승인된 secret manager의 cryptographic generator로 정확히 32-byte를 생성해 직접 주입하며 terminal/log에 출력하거나 저장소·평문 ECS environment에 기록하지 않는다.

안전한 two-phase rotation runbook:

1. Cutover phase: v2 issuance를 중지하고 모든 old process가 previous secret으로 더 이상 발급하지 않는지 확인한다. 마지막 old issuer가 멈춘 뒤 그 absolute UTC instant를 `stoppedIssuingAt`으로 한 번 기록한다. 새 process에는 새 key를 current로, old key를 previous로, 기록한 동일 시각을 `LIVE_OBSERVATION_CAPABILITY_PREVIOUS_STOPPED_ISSUING_AT`으로 배포한다. future timestamp는 사용하지 않는다.
2. Cleanup phase: `stoppedIssuingAt + 15분`이 지난 뒤 previous 3개 값을 함께 제거한다. 정확한 경계부터 previous key는 거부되며, overlap 중에도 Store의 trusted `createdAt`이 `stoppedIssuingAt`보다 늦은 session은 previous key로 검증하거나 재생성하지 않는다. Store create/read는 claims와 같은 `Redis TIME` 또는 injected Store clock에서 canonical `evaluatedAt`을 반환하고 capability operation에 함께 전달한다. API process clock, client timestamp, 별도 clock sample로 대체하지 않는다. process restart나 재배포가 `stoppedIssuingAt`을 현재 시각으로 다시 쓰거나 overlap을 연장해서는 안 된다.

Production에서 `LIVE_OBSERVATION_ENABLED=true`이면 `REDIS_URL`이 실제 Redis/ElastiCache에 연결되고 `PING`, `INCRBY`, `PEXPIRE`, `SET NX PX`를 수행할 수 있어야 합니다. Redis가 없거나 readiness가 실패하면 세션 생성은 `503 LIVE_OBSERVATION_CACHE_UNAVAILABLE`로 차단됩니다. in-memory fallback은 test와 로컬 단일 API 검증에서만 허용합니다.

AWS Connection Quick Create Role에는 기존 demo 배포 권한과 함께 다음 read-only 관측 action이 필요합니다.

```text
autoscaling:DescribeAutoScalingGroups
autoscaling:DescribeScalingActivities
ec2:DescribeInstances
elasticloadbalancing:DescribeLoadBalancers
elasticloadbalancing:DescribeTargetGroups
elasticloadbalancing:DescribeTargetHealth
cloudwatch:GetMetricData
cloudwatch:GetMetricStatistics
logs:FilterLogEvents
ecs:DescribeServices
```

Diagram-to-Terraform의 Live Observation v2 output은 Terraform reference와 provider-neutral graph edge로 하나의 일관된 runtime을 증명할 때만 생성합니다. HTTPS:443 listener가 정확한 ALB, Target Group, ACM certificate를 참조하고, `name`이 certificate `domainName`과 같으며 `records`가 해당 `aws_lb.*.dns_name` 하나만 가리키는 Route53 CNAME이어야 합니다. Target Group은 정확히 하나의 ECS Service 또는 ASG에 연결되어야 하고, ECS Application Auto Scaling Target은 선택된 Service를 `resourceId`로 참조해야 합니다. 로그 group은 선택된 runtime에서 ECS Service→Task Definition→Log Group 또는 ASG→Launch Template→Instance Profile→Role/Policy→Log Group의 소유 방향으로만 추적하며, 공유 support resource에서 sibling runtime 방향으로 역탐색하지 않습니다. ASG request alarm은 정확히 하나의 `alarmActions`→`aws_autoscaling_policy`→`autoscalingGroupName` 체인과 선택된 ALB/Target Group `arn_suffix` dimension을 모두 요구합니다. 추가·미해결 action, sibling ASG dimension/edge, 다른 Target Group dimension은 전체 evidence를 무효화합니다. ECS request threshold도 선택된 scaling target과 ALB/Target Group을 가리키는 정책이 정확히 하나일 때만 출력하고 중복·상충 정책은 graph 순서와 무관하게 생략합니다. 여러 runtime이 붙거나, 연결되지 않은 여러 runtime 중 하나를 골라야 하거나, coherent target이 둘 이상이면 모든 Live Observation output을 생략합니다. reference가 없는 legacy graph는 LB, Target Group, runtime이 각각 하나뿐이고 다른 연결과 충돌하지 않을 때만 호환합니다. 출력은 custom domain 기반 `traffic_url`, `traffic_hostname`, 검증 증거인 `load_balancer_dns_name`, `load_balancer_arn`, `target_group_arn`, 단일 capacity target, `scale_out_threshold`와 선택적인 `log_group_name`/`log_group_names`입니다. ASG와 ECS capacity output이 동시에 존재하면 materializer도 모호한 evidence로 거부합니다. S3 website, HTTP `api_base_url`, ALB 기본 DNS를 traffic URL로 사용하지 않으며 HTTP-only·DNS 누락·certificate/CNAME 불일치 graph는 Live Observation 대상이 아닙니다.

CloudWatch 관측은 선택된 동일 Target Group의 `HTTPCode_Target_2XX_Count`, `HTTPCode_Target_3XX_Count`, `HTTPCode_Target_4XX_Count`, `HTTPCode_Target_5XX_Count`를 합산해 request 수를 만들고, 같은 Target Group의 `TargetResponseTime` p95와 하나의 완료 60초 period로 정렬합니다. 각 query result가 유일한 `StatusCode=Complete`여야 하며 `PartialData`, `InternalError`, `Forbidden`, 누락 status는 unavailable입니다. p95가 선택한 period는 response result의 최신 point만 비교하지 않고 전체 finite point에서 정확히 찾습니다. 같은 period에 하나 이상의 response class가 있어야 하며 status가 Complete인 sparse class만 0으로 취급합니다. 다른 period의 class를 합치거나 whole-ALB `RequestCount`를 분모로 사용하지 않습니다. ASG running은 `InService` instance, ECS/Fargate running은 service task count이며 healthy는 `DescribeTargetHealth`의 실제 healthy target 수를 사용합니다. STS와 AWS read는 5초 abort deadline을 공유합니다. metric이 60초보다 지연되거나 period가 어긋나거나 metric/capacity/log 조회가 실패하면 UI와 Store는 기존 숫자를 재사용하지 않고 정량 필드를 `null`로 표시합니다. CloudWatch Logs는 최근 5분 최대 50건만 읽고 credential-shaped 값은 저장 전 중앙 masker로 제거합니다.

Live Observation 전용 자동 회귀 테스트는 현재 보호선에 포함되지 않습니다. 이 절의 동작은
자동 검증된 것으로 간주하지 않습니다.

실제 `scripts/smoke/live-demo-web-service.ps1` 실행은 AWS 비용 리소스를 생성하므로 명시적 승인과 verified AWS Connection이 있을 때만 수행합니다. smoke 또는 실제 acceptance를 마치면 관측 `stop`이 아니라 기존 Deployment Destroy 흐름으로 ALB, ASG, EC2, S3 리소스를 cleanup하고 결과를 기록해야 합니다.

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

마이그레이션은 배포 중 자동 실행하지 않습니다. GitHub Actions의 `Run Production Database Migrations` 워크플로를 수동 실행합니다. workflow는 먼저 migration compatibility guard를 통과하고 RDS snapshot을 생성한 뒤 현재 worker task definition으로 ECS one-off task를 실행합니다. `DATABASE_URL`은 worker task secret reference에서 읽습니다.

## 배포 확인

```bash
curl https://sketchcatch.net/
curl https://sketchcatch.net/health
curl https://sketchcatch.net/health/db
```

ECS 확인:

```bash
aws ecs describe-services --cluster sketchcatch-production-cluster --services sketchcatch-production-api sketchcatch-production-web
aws elbv2 describe-target-health --target-group-arn <api-target-group-arn>
aws elbv2 describe-target-health --target-group-arn <web-target-group-arn>
```

## API 확인 예시

회원가입 또는 로그인:

```bash
curl -X POST https://sketchcatch.net/api/auth/signup \
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
curl -X POST https://sketchcatch.net/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "첫 아키텍처",
    "description": "배포 확인용 프로젝트"
  }'
```

S3 presigned upload URL 발급:

```bash
curl -X POST https://sketchcatch.net/api/projects/<project-id>/assets/presigned-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "assetType": "diagram_png",
    "fileName": "diagram.png",
    "contentType": "image/png"
  }'
```

## 롤백

일반 release rollback은 API/web service를 이전 검증 ECR image SHA의 task revision으로 되돌립니다. ECS/ALB 자체를 사용할 수 없는 사고만 아래 cold rollback runbook을 사용합니다.

# ECS 런타임 설정과 secret 주입

ECS production과 cold rollback 모두 generated `api.env`/`web.env` 파일 또는 S3 presigned env download를 runtime source of truth로 사용하지 않습니다. source of truth는 ECS task definition의 environment/secret mapping이며 cold restore도 같은 secret store에서 값을 주입합니다.

ECS task definition의 책임은 다음처럼 나눕니다.

| 구분 | 저장 위치 | 예시 |
| --- | --- | --- |
| GitHub Actions vars | 배포 workflow가 image build/push와 service update에 쓰는 비민감 설정 | `AWS_REGION`, `ECR_API_REPOSITORY`, `ECR_WEB_REPOSITORY`, `ECS_CLUSTER_NAME`, `ECS_API_SERVICE_NAME`, `ECS_WEB_SERVICE_NAME`, API/web task family와 container name |
| ECS environment | task definition에 평문으로 남아도 되는 비민감 runtime 설정 | `NODE_ENV`, `PORT`, `DATABASE_SSL`, `S3_BUCKET_NAME`, `SKETCHCATCH_PUBLIC_BASE_URL`, `LIVE_OBSERVATION_ENABLED`, `OAUTH_REDIRECT_BASE_URL`, `GIT_APP_ID`, `GIT_APP_SLUG`, `GIT_APP_CLIENT_ID`, OAuth login client ID |
| Secrets Manager | DB credential 또는 외부 provider secret | `DATABASE_URL`, `GIT_APP_PRIVATE_KEY_BASE64`, `GIT_APP_CLIENT_SECRET`, `OPENAI_API_KEY`, `NAVER_OAUTH_CLIENT_SECRET`, `KAKAO_OAUTH_CLIENT_SECRET`, `GIT_OAUTH_CLIENT_SECRET` |
| SSM Parameter Store SecureString | 서명 secret 또는 secure runtime endpoint | `AUTH_TOKEN_SECRET`, `CLOUDFORMATION_TEMPLATE_TOKEN_SECRET`, `GIT_APP_STATE_SECRET`, `REDIS_URL` |
| GitHub Actions secrets | OIDC로 대체할 수 없는 workflow 입력 | application secret 원문은 두지 않음 |

ECS Terraform에는 secret 원문을 넣지 않고 ARN만 넣습니다.

```hcl
api_secret_arns = {
  DATABASE_URL                         = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/database-url-..."
  GIT_APP_PRIVATE_KEY_BASE64           = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/git-app-private-key-base64-..."
  OPENAI_API_KEY                       = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/openai-api-key-..."
  NAVER_OAUTH_CLIENT_SECRET            = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/naver-oauth-client-secret-..."
  KAKAO_OAUTH_CLIENT_SECRET            = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/kakao-oauth-client-secret-..."
  GIT_OAUTH_CLIENT_SECRET              = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/git-oauth-client-secret-..."
  GIT_APP_CLIENT_SECRET                = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/git-app-client-secret-..."
  AUTH_TOKEN_SECRET                    = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/auth-token-secret"
  CLOUDFORMATION_TEMPLATE_TOKEN_SECRET = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/cloudformation-template-token-secret"
  GIT_APP_STATE_SECRET                 = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/git-app-state-secret"
  REDIS_URL                            = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/redis-url"
}
```

`Deploy Production ECS` workflow는 현재 ECS task definition을 다운로드한 뒤 image만 교체합니다. 이때 API container에 위 secret 이름들이 `environment`가 아니라 `secrets`로 들어 있는지 검증하고, 누락되거나 평문 environment로 들어 있으면 배포를 중단합니다. workflow artifact와 log에는 secret 원문이 남지 않아야 합니다.

Rollback 기준은 다음과 같습니다.

- application rollback은 ECS task definition revision과 ECR image SHA를 기준으로 합니다.
- infrastructure-wide rollback은 cold artifact와 disabled-by-default Terraform root를 사용합니다.
- ECS secret 값을 갱신하면 새 task가 값을 읽도록 ECS service `force-new-deployment`가 필요합니다.

## ECS worker RunTask dispatch

Phase 5부터 API는 `DEPLOYMENT_WORKER_MODE=ecs`가 설정된 경우 Terraform 실행을 API process 안에서 바로 시작하지 않고,
`deployment_jobs` row를 만든 뒤 ECS `RunTask` one-off worker task로 넘깁니다. 기본값은 `in_process`이므로 Phase 5/6
worker runtime이 실제 운영 검증을 끝내기 전까지 기존 direct background 실행을 유지할 수 있습니다.

Phase 6부터 API image에는 `dist/deployment-worker.cjs` worker entrypoint가 포함됩니다. worker는
`SKETCHCATCH_DEPLOYMENT_JOB_ID`로 `RUNNING` job을 조회하고, 검증된 access context로 기존 deployment service를 실행한 뒤
job을 `SUCCEEDED`, `FAILED`, `CANCELLED` 중 하나로 종료합니다. 실패 요약과 process error log에는 기존 masking을 적용합니다.

infra/aws/terraform은 one-off worker task definition, 전용 execution/task role, inbound 없는 worker security group과 RDS 최소 ingress를 관리합니다. API task role에는 worker family와 cluster로 제한한 dispatch 권한만 추가합니다.

production은 ECS worker mode가 활성화되어 있습니다. connection setup의 caller principal에 worker task role ARN이 포함돼야 하며 외부 AWS 계정의 기존 execution role trust는 별도 점검 대상입니다. worker execution role은 필요한 secret만 읽습니다.

ECS worker mode에 필요한 API runtime environment:

```text
DEPLOYMENT_WORKER_MODE=ecs
ECS_WORKER_CLUSTER=<ECS cluster name or ARN>
ECS_WORKER_TASK_DEFINITION=<worker task definition family/revision or ARN>
ECS_WORKER_CONTAINER_NAME=<worker container name>
ECS_WORKER_SUBNETS=<subnet-id-1,subnet-id-2>
ECS_WORKER_SECURITY_GROUP_IDS=<sg-id-1,sg-id-2>
ECS_WORKER_COMMAND=["node","dist/deployment-worker.cjs"]
ECS_WORKER_ENVIRONMENT={"NODE_ENV":"production"}
ECS_WORKER_ASSIGN_PUBLIC_IP=ENABLED
```

`ECS_WORKER_COMMAND`는 JSON string array여야 하며, `ECS_WORKER_ENVIRONMENT`는 string 값만 가진 JSON object여야 합니다.
API는 dispatch 시 `SKETCHCATCH_DEPLOYMENT_ID`, `SKETCHCATCH_DEPLOYMENT_JOB_ID`,
`SKETCHCATCH_DEPLOYMENT_OPERATION`을 container override environment로 추가합니다. worker runtime은 operation과 access context의
source of truth로 DB의 `deployment_jobs` row를 사용하며, override의 operation 값만 신뢰해 실행하지 않습니다.

현재 Phase 1 네트워크는 NAT Gateway 없이 public subnet을 사용하므로 worker도 같은 구성을 사용한다면
`ECS_WORKER_ASSIGN_PUBLIC_IP=ENABLED`가 필요합니다. private subnet과 NAT Gateway 또는 필요한 VPC endpoint를 갖춘 뒤에만
`DISABLED`로 전환합니다. worker security group은 inbound rule 없이 필요한 AWS API, RDS, Redis egress만 허용하는 전용 그룹을
사용합니다.

API task role에는 최소한 아래 권한이 필요합니다. 실제 ARN은 production 계정/region/task family에 맞춰 좁혀야 합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RunWorkerTask",
      "Effect": "Allow",
      "Action": ["ecs:RunTask"],
      "Resource": "arn:aws:ecs:<region>:<account-id>:task-definition/<worker-task-family>:*",
      "Condition": {
        "ArnEquals": {
          "ecs:cluster": "arn:aws:ecs:<region>:<account-id>:cluster/<cluster-name>"
        }
      }
    },
    {
      "Sid": "ManageWorkerTask",
      "Effect": "Allow",
      "Action": ["ecs:StopTask", "ecs:DescribeTasks"],
      "Resource": "arn:aws:ecs:<region>:<account-id>:task/<cluster-name>/*",
      "Condition": {
        "ArnEquals": {
          "ecs:cluster": "arn:aws:ecs:<region>:<account-id>:cluster/<cluster-name>"
        }
      }
    },
    {
      "Sid": "TagWorkerTaskOnRun",
      "Effect": "Allow",
      "Action": "ecs:TagResource",
      "Resource": "arn:aws:ecs:<region>:<account-id>:task/<cluster-name>/*",
      "Condition": {
        "StringEquals": {
          "ecs:CreateAction": "RunTask"
        }
      }
    },
    {
      "Sid": "PassWorkerTaskRoles",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::<account-id>:role/<worker-task-execution-role>",
        "arn:aws:iam::<account-id>:role/<worker-task-role>"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    }
  ]
}
```

ecs:RunTask는 worker task definition과 cluster로 제한합니다. ecs:StopTask, ecs:DescribeTasks, ecs:TagResource는 해당 cluster의 task ARN으로 제한하며 RunTask tags를 사용하므로 ecs:CreateAction = RunTask 조건의 TagResource가 필요합니다. iam:PassRole은 worker task execution role과 worker task role에만 허용하고 ecs-tasks.amazonaws.com 조건을 유지합니다.

## ECS 복구, 관측성, smoke 운영

### API startup reconciliation

API startup은 `DEPLOYMENT_WORKER_MODE`에 따라 `RUNNING` deployment를 복구합니다.

| 조건                                           | startup 처리                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `in_process` mode                              | API process 재시작 중 중단된 `RUNNING` deployment를 기존 방식대로 `FAILED`로 정리합니다.                          |
| ECS task가 `PENDING`, `RUNNING` 등 active 상태 | `deployment_jobs`의 deployment를 보호하고 worker가 계속 완료하도록 둡니다.                                        |
| `DescribeTasks`가 일시적으로 실패              | 실행 중인 deployment를 실패로 오판하지 않고 보호하며 경고를 남깁니다.                                             |
| ECS task가 `STOPPED`                           | active job을 `FAILED`로 종료하고 `recover_application_release` worker를 dispatch해 durable step과 AWS 상태를 재검증합니다. |
| ECS task가 잠시 보이지 않음                    | job 갱신 후 5분 안에는 eventual consistency로 보고 보호하며, grace period 이후에도 `MISSING`이면 실패 처리합니다. |
| task ARN 없는 `QUEUED`/`DISPATCHING` job       | 5분 안에는 보호하고 이후에는 stale dispatch로 실패 처리합니다.                                                    |
| task ARN 없는 `RUNNING` job                    | 유효하지 않은 실행 상태로 보고 job과 deployment를 실패 처리합니다.                                                |

DB의 active `deployment_jobs`가 실행권의 source of truth입니다. ECS 조회 오류만으로 job을 terminal 처리하지 않습니다. startup log에는
`activeDeploymentCount`, `deferredInspectionCount`, `failedJobCount`, `recoveryRetryCount`, `recoveredDeploymentCount`만 기록하며 secret이나 원문 오류를 남기지 않습니다.
최근 `QUEUED`/`DISPATCHING`, `MISSING`, 일시적인 조회 오류가 있으면 API는 5분 간격으로 reconciliation을 반복합니다.
retryable 상태가 없어지면 중단하며 timer는 `unref` 처리되어 process 종료를 막지 않습니다.

application release 복구와 frontend 부분 실패 재시도는 각각 `recover_application_release`,
`retry_application_frontend` operation을 가진 새 `deployment_jobs` row로 ECS worker에 전달합니다. API process는 이
mode에서 ECR/ECS/S3/CloudFront를 직접 변경하지 않습니다. worker는 저장된 release candidate와 lease holder/fencing
version을 다시 확인하고, stale fence이면 AWS mutation과 terminal 결과 저장을 모두 거부합니다.

### CloudWatch Logs와 alarms

| container               | log group                               | 기본 filter 목적                       |
| ----------------------- | --------------------------------------- | -------------------------------------- |
| API                     | `/sketchcatch/<environment>/ecs/api`    | Pino `level = 50` error                |
| web                     | `/sketchcatch/<environment>/ecs/web`    | `ERROR`, `Error`, `error` text         |
| nginx (retained log)    | `/sketchcatch/<environment>/ecs/nginx`  | 신규 steady-state log 없음             |
| worker                  | `/sketchcatch/<environment>/ecs/worker` | `Deployment worker failed` process log |

log group은 `log_retention_days` 동안 유지합니다. alarm을 활성화하면 custom metric과 alarm 비용이 발생합니다. API/web/worker error, API/web unhealthy/zero healthy target, CPU/memory, ALB 5xx와 RDS metric missing을 감시하며 `cloudwatch_alarm_action_arns`에 구독자가 있는 운영 SNS topic ARN을 넣어야 실제 알림이 전달됩니다.

```hcl
enable_ecs_observability_alarms    = true
cloudwatch_alarm_action_arns       = ["arn:aws:sns:<region>:<account-id>:<topic>"]
ecs_log_error_alarm_threshold      = 1
ecs_service_cpu_alarm_threshold    = 80
ecs_service_memory_alarm_threshold = 80
```

### non-mutating smoke

기본 preflight는 AWS에 접속하지 않고 Terraform template, 수동 deploy/migration gate, Route53 기본 비활성화를 확인합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke/ecs-ops-preflight.ps1 -PreflightOnly
```

별도로 read-only AWS 조회를 승인한 경우에만 `-ReadOnlyAws`를 사용합니다. 이 mode도 `describe/list`만 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke/ecs-ops-preflight.ps1 `
  -ReadOnlyAws -AwsRegion ap-northeast-2 `
  -ClusterName <cluster> -ApiServiceName <api-service> `
  -WebServiceName <web-service> `
  -WorkerTaskDefinition <worker-task-family:revision>
```

parallel ECS ALB의 `/`, `/health`, `/health/db` 확인에는 `-PreflightOnly -CheckHttp -EcsBaseUrl <url>`을 사용합니다.
migration은 ECS deploy에 자동 결합하지 않고 `.github/workflows/migrate.yml`의 production approval을 사용합니다.
실행 전 DB rollback 기준과 artifact SHA를 기록하고, 실행 후 `/health/db`, job query, application log에서 schema 오류가 없는지 확인합니다.

worker live smoke는 preflight에 포함하지 않습니다. 별도 승인 시 다음 순서를 지킵니다.

1. worker task revision, image SHA, roles, subnet, security group, secrets를 기록합니다.
2. mutation 없는 검증 job으로 `deployment_jobs`, task status, worker log의 terminal 상태를 확인합니다.
3. Terraform plan의 account, region, backend key, 예상 resource, cleanup owner를 확인합니다.
4. apply/destroy는 명시적 live 승인, 비용 범위, destroy 기준이 모두 있을 때만 실행합니다.
5. 종료 후 task가 `STOPPED`인지, active job과 임시 artifact/resource가 남지 않았는지 확인합니다.

### Steady-state ECS 확인

1. API/web service desired/running count가 평소 각각 1인지 확인합니다.
2. Application Auto Scaling target이 service별 `min=1`, `max=2`인지 확인합니다.
3. API/web target health가 healthy이고 listener에 legacy target이 없는지 확인합니다.
4. production `/`, `/health`, `/health/db`가 200이고 보호된 `/api/projects`가 미인증 요청에 401인지 확인합니다.
5. API/web/worker task revision과 image SHA를 기록합니다.
6. alarm과 SNS subscription 상태를 확인합니다.

### Cold rollback runbook

cold rollback은 ECS ALB나 cluster를 정상적인 revision rollback으로 복구할 수 없는 incident에만 사용합니다.

1. incident commander, 복구 시작 시각, 현재 ECS task revision, DB migration revision과 Route53 TTL을 기록합니다.
2. S3 Docker archive의 size와 SHA256을 위 `Cold rollback artifact` 값과 대조합니다.
3. `infra/aws/production/legacy-rollback`에 `enable_cold_rollback=true`, retained AMI, VPC, public subnet, ACM certificate, RDS/Redis security group ID를 입력해 별도 state로 plan합니다.
4. 생성 대상이 임시 EC2, ALB, target group, listener와 scoped security group뿐이며 Route53 변경이 없는지 확인한 뒤 apply합니다.
5. Secrets Manager/SSM 값을 임시 runtime에 주입하고 검증 SHA artifact를 실행합니다. AMI에 secret이 있다고 가정하지 않습니다.
6. production Host와 TLS SNI로 임시 ALB의 `/`, `/health`, `/health/db`를 direct smoke하고 로그인과 대표 read path를 확인합니다.
7. direct smoke가 모두 통과한 뒤에만 Route53 alias 변경을 별도 plan/승인으로 수행합니다.
8. incident 종료 후 DNS를 ECS ALB로 복구하고 cold state를 destroy해 임시 EC2/ALB/security group rule을 제거합니다. retained AMI와 S3 artifact는 삭제하지 않습니다.

### RDS migration과 restore

- RDS는 자동 백업 7일과 deletion protection을 유지합니다.
- migration workflow는 실행 전 encrypted snapshot을 만들고 ECS worker one-off task로 migration을 수행합니다. 성공 후 `sketchcatch-production-pre-migration-*` snapshot은 최신 3개만 유지합니다.
- schema 변경은 expand, compatible code deploy, backfill, 최소 한 release 관찰, contract 순서를 지킵니다.
- destructive contract migration은 `-- sketchcatch:contract-migration-after: vX.Y.Z` marker 없이는 CI에서 실패합니다.
- migration journal은 append-only입니다. CI는 PR base의 기존 tag/timestamp 변경·삭제와 마지막 적용 시각보다 과거에 추가된 migration을 거부합니다.
- runtime migrator는 운영 DB가 이미 `0045`/`0046`까지 적용해 `0044_github_codebuild_release_plane`을 timestamp 기준으로 건너뛴 이력만 hash와 `created_at`으로 확인해 원래 SQL과 Drizzle 이력을 먼저 복구합니다. 신규 DB와 이미 `0044`를 기록한 DB에는 이 복구를 실행하지 않습니다.
- restore drill은 snapshot에서 새 DB instance로 복원하고 subnet/parameter/security group을 기존과 맞춘 뒤 `/health/db`와 대표 query를 검증합니다. 원본 DB를 덮어쓰지 않으며 검증 후 복구 instance cleanup을 별도 승인합니다.

### Route53 변경 기준

production alias는 ECS ALB로 고정합니다. ECS release rollback에는 Route53을 변경하지 않습니다. cold ALB 전환이 필요하면 direct smoke evidence와 별도 승인 뒤에만 변경하고, ECS 복구 후 원래 ECS ALB DNS/zone ID로 되돌립니다.
