# 프로젝트 단위 배포 운영 완성 스펙

## 문서 목적

SketchCatch의 부분 구현된 배포 기능을 데모 중심 흐름에서 실제 개발자가 지속적으로 사용할 수 있는 프로젝트 단위 배포 운영 기능으로 완성한다. Architecture Board 저장부터 Direct Deployment 또는 Git/CI/CD 배포, 릴리즈 식별, 실제 요청 관측, 이력, 완료 알림까지 하나의 일관된 계약으로 연결한다.

이 스펙은 저장소 분석 결과를 Amazon Q RAG에 직접 연결하는 작업과 RAG 기반 Fargate 추천 개선을 다루지 않는다. 해당 항목은 사용자의 명시적 제외 요청에 따라 현 상태를 유지한다.

## 제품 원칙

- SketchCatch는 provider-neutral IaC operations service이며 AWS-only 제품으로 설명하지 않는다.
- MVP 구현은 AWS-first, Terraform-first로 진행하되 도메인 계약은 provider-neutral로 유지한다.
- 배포 단위는 환경이 아니라 프로젝트다. 한 프로젝트는 한 시점에 하나의 활성 배포 타깃을 가진다.
- `staging`, `production` 같은 다중 환경 모델은 이번 범위에서 만들지 않는다.
- 초기 전체 배포와 이후 앱만 재배포를 모두 지원한다.
- 모든 변경과 실행은 사용자 저장, 검증 결과 확인, 명시적 승인 뒤에 수행한다.
- 실제 cloud mutation은 Deployment 또는 승인된 Git/CI/CD 경로에서만 실행한다.
- UI는 운영 판단에 필요한 정보만 먼저 보여주고 원문 로그와 상세 근거는 접힌 영역으로 제공한다.

## 목표 사용자 여정

1. 개발자가 소스 저장소와 프로젝트 배포 타깃을 연결한다.
2. SketchCatch가 저장소 증거로 빌드 방식을 감지하고 개발자가 설정을 확인한다.
3. 개발자가 Architecture Board를 편집하고 `Ctrl+S` 또는 `Command+S`로 저장한다.
4. 개발자가 `저장하고 바로 배포`를 눌러 최신 draft를 확정한다.
5. 배포 콘솔이 `검증 → 승인 → 배포` 세 단계만 표시한다.
6. Direct 또는 Git/CI/CD 경로가 선택된 scope를 실행하고 단계별 로그를 스트리밍한다.
7. 완료 화면이 상태, 릴리즈 버전, commit SHA, artifact digest, Output URL을 표시한다.
8. 개발자는 Deployment History에서 이전 실행과 릴리즈 증거를 다시 확인한다.
9. 청중은 15분 제한 QR 세션으로 실제 Output URL에 요청을 보내고 개발자는 CloudWatch 기반 관측값을 확인한다.
10. 완료 또는 실패가 영속 Inbox와 Web Push로 전달된다.

## 범위

### 포함

- 프로젝트당 단일 배포 타깃 설정
- 저장소 기반 빌드 설정 감지와 개발자 확인
- `infrastructure`, `application`, `full_stack` 배포 scope
- Direct Deployment 3단계 흐름
- Architecture Board `Ctrl+S`/`Command+S` 저장
- `저장하고 바로 배포` 버튼과 저장 실패 차단
- ECS/Fargate, EC2/ASG, Lambda, Static runtime GitOps 릴리즈
- Terraform Preview, Plan, 승인, Apply/Destroy의 기존 안전 계약 유지
- Direct/GitOps 공통 릴리즈 원장과 배포 이력
- CI/CD 단계와 증분 로그
- 인간용 버전, commit SHA, provider-neutral artifact digest
- 15분 공개 관측 세션, QR, 실제 요청 수집
- CloudWatch Live Observation
- 영속 Inbox, SSE, Web Push 완료 알림
- non-production AWS/GitHub sandbox E2E와 cleanup 증거

### 제외

- RAG 기반 Fargate 추천 개선과 저장소 분석의 Amazon Q RAG 직접 호출
- 프로젝트 안의 다중 환경 모델
- EKS/Kubernetes runtime
- 임의 shell command 입력형 빌드 설정
- 저장소 분석 결과를 자동 커밋하거나 자동 PR로 만드는 기능
- 무승인 Production apply, deploy, destroy
- Blue/Green, Canary, 점진 트래픽 전환

## 핵심 도메인 계약

### ProjectDeploymentTarget

프로젝트의 유일한 활성 배포 타깃이다.

- `projectId`
- `provider`: MVP는 `aws`
- `connectionId`
- `region`
- `runtimeTargetKind`: `ecs_fargate | ec2_asg | lambda | static_site`
- `confirmedBuildConfig`
- `rolloutStrategy`: 이번 범위는 `all_at_once`
- `createdAt`, `updatedAt`

프로젝트당 활성 row는 하나만 허용한다. 타깃 변경은 이후 Deployment에만 적용하며 과거 릴리즈의 실행 증거는 변경하지 않는다.

### ConfirmedBuildConfig

저장소 증거에서 감지한 빌드 설정을 개발자가 확인한 결과다.

- source root와 감지 근거
- Dockerfile, package manifest, SAM template, AppSpec, static output 정보
- 허용된 build/install 명령 preset
- artifact output 경로
- runtime entrypoint와 health check 경로
- 확인한 commit SHA와 확인 시각

명령은 preset과 구조화된 필드로만 저장한다. 임의 shell 문자열은 허용하지 않는다. 감지 결과가 없거나 둘 이상으로 모호하면 배포 준비를 차단하고 개발자 선택을 요구한다.

### DeploymentScope

- `infrastructure`: Terraform 검증, Plan, 승인, Apply 중심
- `application`: source snapshot, build, artifact, runtime release 중심
- `full_stack`: application artifact를 먼저 준비한 뒤 Terraform과 runtime release를 연결

변경 경로로 scope를 자동 감지하되 개발자가 승인 전 수정할 수 있다.

### ApplicationRelease

Direct Deployment와 Git/CI/CD가 공유하는 릴리즈 원장이다.

- `projectId`, `deploymentId`
- `source`: `direct | gitops`
- `runtimeTargetKind`
- `version`
- `commitSha`
- `artifactDigest`와 digest algorithm
- provider revision: ECS task definition/image digest, Lambda version, CodeDeploy deployment, S3 release key 등
- `outputUrl`
- `status`, `startedAt`, `completedAt`
- 검증과 rollback 증거

버전 우선순위는 exact SemVer tag, 확인된 manifest version, `sha-<앞 12자리>` 순서다. 화면에는 항상 version, commit SHA, artifact digest를 함께 표시한다.

### DeploymentConsolePhase

외부에 노출하는 단계는 다음 세 개로 고정한다.

1. `validation`: 저장, preflight, security/cost 검사, Terraform Plan 또는 artifact build
2. `approval`: scope, 변경 요약, blocker, 비용, 버전/digest 검토
3. `deployment`: Apply 또는 runtime release, health check, Output URL 확정

기존 `save | preflight | plan | approve | apply` 내부 이벤트는 호환을 위해 유지할 수 있지만 UI 단계와 API의 상위 상태는 세 단계로 정규화한다.

## 저장소와 데이터 모델

- `project_deployment_targets`: 프로젝트당 한 개의 활성 타깃과 확인된 build config
- `application_releases`: Direct/GitOps 공통 릴리즈 원장
- 기존 `deployments`: `scope`, `targetKind`, `source`, `releaseId` 연결 필드 추가
- `notifications`: 사용자별 영속 알림과 읽음 상태
- `notification_outbox`: terminal event의 idempotent 전달 큐
- `web_push_subscriptions`: 사용자별 암호화된 Push subscription
- Live Observation manifest/capability의 source of truth는 서버 저장소와 Runtime Cache 계약으로 유지

기존 `liveProfile`은 nullable legacy 필드로 남긴다. `practice`는 `infrastructure`, 기존 demo web service 계열은 `ecs_fargate` 기반 프로젝트 타깃으로 backfill한다. migration은 expand, compatible code, backfill, contract 순서를 지킨다.

## API 계약

### 프로젝트 배포 타깃

- `GET /api/projects/:projectId/deployment-target`
- `PUT /api/projects/:projectId/deployment-target`

PUT은 provider connection 접근 권한, region, runtime 종류, build config를 검증한다. secret 원문을 응답하거나 저장하지 않는다.

### 배포 준비와 실행

- `POST /api/projects/:projectId/deployments/prepare`
- `POST /api/deployments/:deploymentId/approve`
- `POST /api/deployments/:deploymentId/execute`

`prepare`는 최신 저장 revision, scope, source, target을 입력받아 검증 단계의 immutable snapshot을 만든다. `approve`는 snapshot hash를 잠그고, `execute`는 승인된 동일 snapshot만 실행한다. 기존 plan/apply endpoint는 호환 기간 동안 adapter로 유지한다.

### 릴리즈

- `GET /api/projects/:projectId/releases`
- `GET /api/releases/:releaseId`

응답은 version, SHA, digest, provider revision, Output URL, rollback/health evidence를 포함한다.

### 로그와 상태

기존 cursor 기반 증분 로그 계약을 유지한다. Direct와 GitOps 모두 공통 stage, sequence, timestamp, level, masked message를 반환한다. GitHub Actions는 workflow job/step 상태와 로그를 수집해 runtime release 단계와 연결한다.

## Direct Deployment UX

- Workspace 상단에 저장 상태와 `저장하고 바로 배포`를 함께 둔다.
- Architecture Board에서 `Ctrl+S`/`Command+S`는 diagram과 Terraform draft를 서버까지 flush한다.
- 배포 버튼은 저장 성공 뒤에만 콘솔을 열고 검증을 자동 시작한다.
- 저장 실패, stale revision, validation blocker가 있으면 배포를 만들지 않는다.
- 기본 화면에는 상태, scope, 변경 resource 수, blocker, 예상 비용, version, 주요 action, Output URL만 표시한다.
- raw hash, 전체 resource 목록, provider 진단, 상세 로그는 접힌 상세 영역에 둔다.
- 중복 프로젝트 정보, 데모 전용 설명, 반복 확인 카드, traffic simulator 문구를 제거한다.
- History는 별도 탭으로 유지하고 Destroy도 `검증 → 승인 → 배포` 세 단계에 맞춘다.

## Git/CI/CD 배포

### 공통

- 저장소 분석은 Dockerfile, package manifest, SAM template, AppSpec, static output을 감지한다.
- 개발자가 build config를 확인한 뒤에만 workflow를 생성하거나 갱신한다.
- 인프라 변경과 앱 변경 경로로 scope를 감지하며 승인 화면에서 수정할 수 있다.
- CI/CD 화면은 run 목록, 선택한 run의 stage/log, 릴리즈 결과와 Output URL만 우선 표시한다.
- branch/path/repository 설정은 프로젝트 설정으로 이동한다.
- artifact와 로그에는 secret을 남기지 않고 기존 masking 계약을 적용한다.

### AWS build plane

AWS connection bootstrap에 격리된 CodeBuild, 암호화 S3 artifact store, lifecycle이 적용된 ECR repository를 제공한다. 이 인프라는 SketchCatch 내부 실행 기반이며 사용자 Architecture Board Resource로 노출하지 않는다.

### ECS/Fargate

- Docker image를 ECR에 immutable digest로 push한다.
- task definition은 digest를 참조한다.
- immediate replacement를 위해 deployment minimum healthy percent 0, maximum percent 100을 사용한다.
- ECS deployment circuit breaker와 rollback을 켠다.
- 성공은 service 안정화와 health check, 실제 revision 일치로 판정한다.

### Lambda

- artifact digest로 새 version을 publish한다.
- CodeDeploy `LambdaAllAtOnce`로 alias를 전환한다.
- 실패 시 이전 version/alias로 복원하고 원인을 릴리즈 증거에 기록한다.

### EC2/ASG

- versioned S3 bundle과 AppSpec을 만든다.
- CodeDeploy `CodeDeployDefault.AllAtOnce`로 ASG에 배포한다.
- 모든 대상 instance의 성공과 health check를 확인한다.
- 일부 instance 실패도 전체 실패로 처리하고 이전 검증 bundle로 rollback한다.

### Static

- versioned S3 release prefix에 artifact를 업로드한다.
- 활성 release pointer를 교체하고 CloudFront invalidation을 수행한다.
- 실제 객체 digest와 Output URL 응답을 확인한다.

## Architecture Board 저장 계약

- Board의 전역 단축키에 `Ctrl+S`/`Command+S`를 추가한다.
- browser 기본 저장 동작을 막고 draft manager의 단일 flush 경로를 호출한다.
- diagram 변경과 Terraform editor 변경 중 하나라도 실패하면 저장 성공으로 표시하지 않는다.
- 저장 중 중복 입력은 동일 flush promise에 합류시키고 최신 revision을 반환한다.
- 배포 snapshot은 이 revision과 content hash를 참조한다.

## Live Observation과 청중용 QR

- 기존 demo 전용 경로를 `/observe/:publicId` 형태의 제한 공개 세션으로 대체한다.
- 세션은 검증된 HTTPS Output URL에만 요청을 보낸다.
- 기본 만료는 15분, IP당 분당 30회, 세션당 최대 10,000회다.
- 요청 timeout은 3초이며 redirect를 따르지 않고 response body를 저장하지 않는다.
- capability 원문은 URL, query string, RDS, localStorage, sessionStorage, 로그에 남기지 않는다.
- server-verified manifest와 HMAC capability를 사용한다.
- provider-neutral Store contract는 in-memory와 Redis adapter에서 같은 contract suite를 통과해야 한다.
- AWS adapter는 CloudWatch 요청 수, 오류율, p95 latency, availability, capacity, 관련 로그를 공통 observation snapshot으로 정규화한다.
- 기능 flag, Redis, 브라우저, 승인된 AWS sandbox gate가 준비되지 않으면 공개 세션을 생성하지 않는다.

## 완료 알림

- Deployment와 ApplicationRelease terminal event는 idempotency key로 한 번만 outbox에 기록한다.
- 로그인 사용자는 Inbox에서 성공, 실패, 취소 알림과 읽음 상태를 영속적으로 본다.
- 활성 화면에는 인증된 SSE로 새 알림을 전달한다.
- 사용자가 권한을 허용하면 service worker가 Web Push를 표시한다.
- Push subscription은 암호화해 저장하고 endpoint/keys를 로그에 남기지 않는다.
- 브라우저 세션 중복 제거에만 의존하지 않는다.
- 알림은 90일 보관 후 정리한다.

## 보안, 비용, 안전 검증

- AI, 비용, 보안 검사는 실행을 대신 승인하지 않는다.
- high severity finding은 승인 화면에 명확히 표시하고 기존 프로젝트 정책에 맞게 차단 여부를 결정한다.
- 승인 snapshot은 실행 직전에 재검증한다.
- AWS 권한은 runtime별 최소 권한과 project connection 경계를 따른다.
- GitHub workflow는 OIDC 또는 기존 승인된 GitHub App 경로를 사용한다.
- 로그, artifact, notification, QR URL에 credential과 capability 원문을 남기지 않는다.
- 모든 임시 ECR image, S3 artifact, CodeBuild output, test stack에는 retention/cleanup 소유자를 둔다.
- Production mutation은 이번 완료 검증의 범위가 아니다.

## 성능과 예상 시간

artifact가 준비된 immediate replacement 기준 목표 시간은 다음과 같다.

- ECS/Fargate: 90~180초
- Lambda: 5~20초
- EC2/ASG: 120~300초
- 전체 CI 포함: 180~600초

시간은 보장값이 아니라 sandbox acceptance 기준의 관측 목표다. 실제 배포 화면은 경과 시간과 현재 stage를 표시한다.

## 테스트와 완료 기준

### 자동 검증

- migration/backfill과 legacy API 호환 테스트
- project target, build detection, scope, release version/digest, drift 검증 테스트
- Direct 3단계 상태 전이와 저장 실패 차단 테스트
- ECS, Lambda, EC2, Static release adapter와 rollback 테스트
- GitHub workflow stage/log/evidence 수집 테스트
- Live Observation Store, HMAC, rate limit, expiry, redaction 테스트
- notification outbox, Inbox, SSE, Web Push 테스트
- 브라우저 `Ctrl+S`, 저장하고 배포, 3단계 콘솔, History, QR, 알림 테스트
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 변경된 Terraform root의 fmt, validate, test, plan

### sandbox acceptance

명시 승인된 non-production AWS/GitHub sandbox에서 다음을 실제 증거로 남긴다.

1. Direct `infrastructure`, `application`, `full_stack` 실행
2. ECS/Fargate, Lambda, EC2/ASG, Static GitOps commit 감지와 배포
3. CI/CD 단계와 실제 로그 스트리밍
4. version, commit SHA, artifact digest, provider revision 일치
5. Output URL 실제 요청과 15분 QR 세션
6. CloudWatch request/error/latency/capacity 관측
7. Inbox와 Web Push 완료 알림
8. 의도된 실패의 automatic/manual rollback
9. destroy와 임시 artifact/resource cleanup

### 최종 완료 조건

- 배포 UI가 다섯 단계가 아니라 세 단계로 동작한다.
- 저장하지 않은 Board로 배포할 수 없다.
- 프로젝트 단일 타깃과 세 scope가 Direct/GitOps에서 같은 의미를 가진다.
- 네 AWS 주요 runtime이 실제 artifact 기반 GitOps 릴리즈를 수행한다.
- CI/CD와 Direct 로그가 운영 진단에 충분한 stage와 원문을 제공한다.
- 완료 화면과 History에서 version, SHA, digest, Output URL을 확인할 수 있다.
- QR 요청, CloudWatch 관측, 영속 알림이 demo flag 없이 승인된 sandbox에서 동작한다.
- 모든 실제 sandbox resource와 artifact가 cleanup되고 증거가 기록된다.

