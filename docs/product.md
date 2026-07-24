# 제품 방향

SketchCatch는 자연어/음성 요구사항, Source Repository, 기존 클라우드 상태를 입력으로 받아 provider-neutral 인프라 설계를 만들고, AI/Bedrock/Amazon Q로 설계와 위험을 보강하며, Terraform IaC Preview, CI/CD Integration, managed deployment, Reverse Engineering까지 연결하는 **multi-cloud-ready IaC 운영 서비스**다.

MVP는 AWS와 Terraform을 기준으로 구현한다. 다만 제품 모델은 AWS 전용이 아니라 Provider Adapter를 통한 Azure, GCP 등 다른 클라우드 확장을 전제로 한다.

## 1차 MVP 목표

1차 MVP의 최우선 목표는 아래 한 문장으로 고정한다.

> 사용자가 요구사항, Source Repository, 기존 클라우드 상태 중 하나에서 시작해 Architecture를 만들고, IaC Preview와 안전 검사를 거쳐 managed deployment 또는 CI/CD delivery로 운영 가능한 IaC 흐름을 완성한다.

기능 개수를 늘리는 것보다, 아래 핵심 서비스 여정이 실제로 이어지는 것이 우선이다.

```text
Requirement Input
→ Requirement Prompt
→ AI Architecture Recommendation
→ Architecture Draft
→ Architecture Board
→ IaC Preview
→ deployment check
→ User-Accepted Change
→ managed deployment 또는 CI/CD delivery
→ Deployment History
→ Auto Cleanup
```

## 핵심 포지셔닝

SketchCatch는 단순 다이어그램 도구가 아니다.

- 자연어 요구사항을 인프라 그래프로 구조화한다.
- 음성 요구사항은 Amazon Transcribe 기반 Voice Requirement Input으로 받고, 사용자가 확인한 뒤 Requirement Prompt로 확정한다.
- 다이어그램과 Terraform이 같은 설계 데이터를 바라보게 한다.
- AI, Bedrock, Amazon Q Assistance는 Architecture Draft, 설명, 리뷰, 수정 제안을 보강한다.
- Architecture Board Compiler는 AI Draft, 현재 Board, Reverse Engineering 결과를 Template 사례에 근거해 Resource 의미와 시각 배치까지 다시 구성하는 제안을 만들며, 틀리거나 IaC 유효성을 위반한 변경도 diff와 진단으로 드러낸 뒤 사용자 승인을 받는다.
- 배포 전 비용, 보안, 설정 위험을 보여주되 High Security Risk도 사용자 검토 정보로 유지하며 Terraform Plan 승인은 허용한다.
- 사용자가 승인한 Terraform Plan만 managed deployment로 실제 클라우드에 반영한다.
- 팀 운영 배포는 Source Repository와 CI/CD Integration으로 넘긴다.
- Reverse Engineering은 기존 클라우드 Resource를 Provider Adapter로 스캔해 인프라 설계로 복원하고, 사용자가 선택할 때만 보드에 저장한다.
- 실제 배포 기록, 로그, output, cleanup 상태를 Deployment History에 남긴다.

## 대상 사용자

| 사용자                 | 상황                                                          | 핵심 니즈                                         |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| 애플리케이션 개발자    | 서비스 요구사항을 인프라 설계와 IaC로 빠르게 옮겨야 함        | 쉬운 설계, 구조 이해, 안전한 배포                 |
| 백엔드 개발자          | 서비스 개발은 가능하지만 인프라 경험이 부족함                 | 빠른 인프라 초안, 코드 생성, 배포 보조            |
| 사이드프로젝트 팀      | 인프라 전담자가 없음                                          | 저비용 구조, 빠른 배포, 위험 검증                 |
| 초기 스타트업          | MVP를 빠르게 출시해야 함                                      | 실용적인 기본 아키텍처와 비용 관리                |
| 플랫폼/DevOps 엔지니어 | 기존 cloud state 분석, IaC 전환, 운영 배포 흐름 정리가 필요함 | Reverse Engineering, CI/CD handoff, 위험 요약 |
| 기술 리드/SRE          | 팀원의 설계와 운영 변경을 검토해야 함                         | 품질 리뷰, 변경 영향 확인, 안전한 승인 흐름       |

## 유지할 핵심 기능

| 기능 | 기준 |
| --- | --- |
| Requirement Input | 텍스트와 Voice Requirement Input을 Requirement Prompt로 정규화한다. |
| AI Architecture Recommendation | Requirement Prompt를 Architecture Draft로 변환하고 수락 전 설명을 제공한다. |
| 다이어그램 편집 | Architecture Board에서 Resource와 관계를 직접 수정한다. |
| Board 자동 정리 | Resource·관계·설정·실제 소속은 유지하고 위치·크기·소속 없는 표시 프레임·연결선 모양만 정리한 최대 3개의 정리안을 사용자가 원본과 비교하고 하나를 선택하게 한다. 데스크톱은 thumbnail 갤러리와 좌우 비교, 모바일은 가로 갤러리와 원본/정리안 전환을 사용한다. 표시 프레임은 일반 Board 편집에 자동으로 따라가지 않고 다음 자동 정리 요청 때 다시 계산한다. 안전한 시각 변경이 있으면 측정상 개선 여부와 관계없이 비교·적용할 수 있다. |
| Terraform 생성 | 다이어그램 기반 설계를 IaC Preview로 변환한다. |
| deployment check | 비용, 보안, 설정 위험을 설명하고 수정 방향을 제안한다. |
| managed deployment | sandbox/practice 실행에서 Plan, 승인, Apply, 로그, Outputs, Auto Cleanup까지 연결한다. |
| Live Observation | 성공한 Demo Web Service Deployment의 실제 요청, CloudWatch 측정값, ASG/EC2 또는 ECS/Fargate runtime 상태를 15분 세션으로 관측한다. 트래픽 흐름 아래에서는 현재 상태와 사용자 영향, 근거가 있는 중요 신호 최대 3개, 확인할 수 없는 내용을 짧게 보여주며 CloudWatch의 지표 목록을 복제하지 않는다. |
| CI/CD Integration | IaC Preview를 Source Repository PR과 외부 pipeline 상태로 연결한다. |
| Reverse Engineering | 기존 클라우드 상태를 인프라 설계로 복원한다. `보드에 적용`은 구조를 보드에 저장하는 동작만 뜻하며, Terraform 코드 생성·import나 AWS 변경은 별도 Terraform 작업 흐름에서만 수행한다. |

Live Observation은 실제 배포 앱의 check-in/heartbeat 성공 뒤 collector가 확인한 Store receipt의 10초 rolling pressure가 `warning` 이상이 되면 같은 관측 화면에 경고를 유지한다. AI Design Simulation은 배포 Architecture와 비민감 관측 수치로 용량 설정 검토 방향을 제안한다. 사용자가 직접 승인한 경우에만 정확히 하나의 ECS Application Auto Scaling Target에서 정수 `max_capacity`를 1 증가시켜 Project Draft에 저장한다. 저장 성공 뒤 경고를 해제하되 실제 AWS 반영이나 정상화로 표현하지 않으며 새 Plan, 승인, 재배포 경계는 그대로 유지한다.

## 축소할 기능

| 기능                       | 기준                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 고도화된 트래픽 시뮬레이터 | 미래 용량 예측·임의 target·무제한 부하 생성은 지원하지 않는다. 성공 Deployment의 제한된 Live Observation은 실제 서비스 흐름 검증 용도로만 제공한다. |
| 병목 예측 엔진             | 정밀 예측이 아니라 잠재 병목 가능성 경고로 제한한다.                                                                                                |

## 강화할 기능

| 기능 | 기준 |
| --- | --- |
| 실제 AWS managed deployment | Plan, 승인, Apply, 로그, Outputs, Destroy/Cleanup까지 연결한다. |
| CI/CD 운영 경로 | Terraform commit/PR, pipeline template, Plan 결과, 실행 상태를 연결한다. |
| Application Artifact 재사용 | managed deployment와 CI/CD가 같은 provider-neutral Registry를 사용하되 provider의 실제 artifact와 project ownership을 다시 검증한 경우에만 build를 재사용한다. |
| Runtime Convergence | 동일한 Application Artifact와 runtime configuration이 provider에서 healthy 상태로 실제 실행 중인 경우에만 rollout을 생략한다. DB나 Runtime Cache 기록만으로 성공 처리하지 않으며 provider 조회 실패·불일치·unhealthy 상태는 안전한 rollout으로 fallback한다. ECS Service(Fargate/EC2 Capacity Provider), 단일 EC2, EC2+ASG, EKS(Managed/Self-managed/Fargate), Kubernetes Deployment, Lambda Alias/Version, Static S3/CloudFront는 독립 Adapter 경계를 유지한다. |
| 리버스 엔지니어링 | Provider Adapter로 기존 cloud Resource를 원본 그대로 복원한다. 일부 reader 권한이 부족해도 읽은 Resource는 유지하고, 읽지 못한 AWS 서비스·필요 API 권한·재시도 방법은 별도로 안내한다. 표시 타입을 팔레트 아이콘으로 정규화해도 providerResourceType과 실제 AWS 상태는 보존한다. `보드에 적용`은 가져온 구조를 저장할 뿐 Terraform 코드 생성·import·실행이나 AWS 변경을 수행하지 않는다. 기존 연결의 Stack·Role·배포 권한은 유지하고, 연결별 Manager Stack은 CloudFormation 실행·제어·정리 확인 권한을, Policy Stack은 Reverse Engineering 읽기 Policy만 소유한다. 사용자는 Manager Stack을 AWS Console에서 승인하며 Policy Stack은 환경설정의 명시적 승인 뒤 서버가 생성·갱신한다. 제거는 Policy Stack 다음 Manager Stack 순서이며, SketchCatch가 소유한 Stack·Policy·Role 제거를 확인할 수 없으면 비활성 재시도 상태로 유지한다. MVP는 AWS-first로 시작한다. |
| 비용 분석 | 인프라 설계, IaC Preview, Deployment Plan, Deployment History 단위의 Cost Risk를 보여준다. |
| Well-Architected 기반 리뷰 | 보안, 비용, 신뢰성, 성능, 운영 관점으로 아키텍처를 리뷰한다. |
| Runtime Cache | Redis를 내부 Runtime Cache로 사용해 Deployment, Reverse Engineering, CI/CD 상태 추적과 로그 스트리밍을 보조한다. |

공개 Repository는 GitHub 계정 연결 없이 분석하고 Architecture Board를 만들 수 있다. 분석 결과의 `AI로 직접 설계`는 저장된 프로젝트가 없어도 분석한 프로젝트 이름으로 AI 다이어그램 설계 채팅을 즉시 시작하며, 기존 프로젝트에서 시작한 경우에는 해당 프로젝트 문맥을 유지한다. Board 저장 시 Repository URL, branch, 분석 commit SHA와 선택 Template을 프로젝트의 `RepositoryAnalysisRecord`에 저장한다. 공개 조회에 실패하면 실제 공개/비공개 여부를 단정하지 않고 입력 오류 또는 접근 제한 가능성을 함께 안내한다. GitHub가 연결되어 있으면 입력한 owner/name과 정확히 일치하는 Repository만 연결하고, 연결되어 있지 않으면 전역 GitHub 연결 또는 Repository 권한 추가로 이어진다.

GitHub App installation은 Dashboard 전역 설정에서 사용자 계정 단위로 관리한다. 프로젝트별 Source Repository, 감시 branch/path, 배포 타깃, readiness와 CI/CD 실행 기록은 Workspace의 `Delivery`에서 관리한다. GitHub callback은 정확한 Repository 연결만 마친 뒤 원래 분석으로 돌아가며 배포 설정을 요구하지 않는다. 배포 modal의 CI/CD 화면은 요약과 최근 결과만 보여주고 상세 수정은 `Delivery 열기`로 이동한다. 설정 저장은 실제 cloud 배포, PR 생성 또는 Git 변경을 자동 실행하지 않는다.

Delivery는 현재 Board provenance와 정확히 연결된 active Source Repository를 selector 없이 자동 적용하고 `owner/name · default branch · 자동 적용`으로 표시한다. Board provenance만 있고 PR 권한이 연결되지 않았으면 해당 Repository의 `PR 권한 연결 필요` 동작을 제공한다. 자동 적용은 PR 생성 승인이나 Git 변경 실행을 뜻하지 않으며, Monitoring과 AWS 배포 타깃의 추천값은 사용자가 저장하기 전까지 `저장 전 추천값`, 편집하면 `미저장 변경`으로 구분한다.

분석 SHA와 마지막 인증 분석 SHA가 다르면 코드 변경 사실만 안내한다. SketchCatch는 이 차이만으로 새 cloud Resource의 추가·변경·삭제를 추론하지 않고, 기존 Board를 자동 재생성하거나 덮어쓰지 않으며 CI/CD readiness도 차단하지 않는다.

웹 포함 ECS/Fargate의 application release는 Repository 코드를 제한된 CodeBuild에서 한 번 검증해 immutable `ReleaseCandidate`로 SketchCatch 내부 Artifact S3에 저장한다. Terraform Plan 승인과 Apply 뒤 trusted worker가 같은 candidate를 ECR/ECS와 서비스 S3/CloudFront에 활성화한다. CodeBuild와 GitHub Actions는 사용자 서비스 AWS Resource를 직접 변경하지 않으며, Direct와 CI/CD 실행은 프로젝트 lease로 동시에 하나만 허용한다.

Repository 기반 ECS/Fargate 웹 프로젝트의 최초 앱은 managed deployment가 배포한다. 정상 신규 흐름은 `full_stack`으로 인프라 Apply와 같은 Deployment에서 API·frontend를 활성화하고 CloudFront HTTPS URL을 확인한다. 기존 bootstrap-only 프로젝트는 Terraform을 다시 Apply하지 않는 `application` scope로 복구한다. CI/CD 설치 PR은 이 최초 릴리즈가 성공한 뒤에만 만들 수 있으며, merge는 후속 애플리케이션 변경 자동화만 설치한다.

`AWS CodeBuild용 GitHub 권한`은 활성 GitHub App installation이 정확히 하나이고 verified AWS connection이 있을
때만 시작한다. 설정 화면은 GitHub App, AWS 계정, AWS CodeBuild용 GitHub 권한 순서로 안내하고 AWS로 이동하기
전에 승인 대상 GitHub 계정과 repository 범위를 보여준다. 사용자는 AWS가 요구하는 GitHub 승인만 수행하고
CodeConnections ARN, CodeBuild project, service role 이름을 입력하지 않는다. CodeConnections `AVAILABLE`은 AWS
승인 완료만 뜻하며 특정 Repository checkout 성공을 뜻하지 않는다. SketchCatch는 AWS connection마다 관리
CodeConnections 하나를 만들고, Source Repository가 있는 프로젝트가 첫 Plan을 요청할 때 프로젝트별 build-only
CodeBuild 환경을 lazy create한다. Plan 전 검증은 확정 commit SHA로 실제 CodeBuild checkout을 실행하고 AWS가
반환한 resolved commit이 일치할 때만 Repository 접근 완료로 기록한다. ECS가 정상 배포된 뒤 frontend만 실패하면 기존
CloudFront URL·QR·Live Observation을 유지하고 같은 candidate로 웹 단계만 재시도한다.

AWS CodeConnections 조회 응답은 승인에 사용한 GitHub 계정 이름을 제공하지 않으므로 SketchCatch는 두 승인 화면의
계정명이 같다고 주장하지 않는다. 대신 활성 GitHub App installation을 하나로 제한하고 예상 계정을 먼저 표시하며,
최종 안전 조건은 AWS CodeBuild가 프로젝트의 exact Repository와 confirmed commit을 실제 checkout하는지로 판정한다.
| Deployment 관측 | Live event, CloudWatch measured, ASG/EC2 또는 ECS/Fargate actual capacity를 서로 다른 근거로 표시하고 AWS 조회 실패 시 sample 값을 만들지 않는다. |

## AWS-first 실행 범위와 Representative Use Journey

managed deployment의 안정성을 위해 실제 live apply 기본 경로는 아래 리소스로 제한한다.

- VPC
- Public Subnet
- Internet Gateway
- Route Table
- Security Group
- EC2
- S3 Bucket
- CloudFront Distribution과 Origin Access Control
- Application Load Balancer와 Target Group
- ECR Repository
- ECS Cluster, Task Definition, Fargate Service
- CloudWatch Log Group

RDS처럼 생성/삭제 시간과 비용 리스크가 큰 Resource는 기본 live apply 경로에서 제외할 수 있다. 화면, IaC Preview, Cost Analysis, deployment check 대상에는 둘 수 있지만 실제 managed deployment 실행은 별도 승인과 cleanup 계획이 있어야 한다.

`demo_web_service` Representative Use Journey는 ALB, Target Group, Launch Template, ASG, CloudWatch Alarm, Step Scaling Policy를 제한된 안전 프로필로 추가한다. 이 프로필은 ASG `min/desired/max=1/1/2`, `RequestCountPerTarget` 60건/분, scale-out `+1`, cooldown 180초만 허용하며 v1에는 scale-in이 없다. Live Observation의 `중지`와 `세션 종료`는 관측만 끝내고, 비용 리소스 정리는 기존 Deployment Destroy/Cleanup에서만 수행한다.

발표나 리허설에서는 별도 데모 전용 기능을 만들지 않는다. `Representative Use Journey`는 실제 서비스 흐름을 증명하는 대표 사용 여정이어야 한다.

## 3주 로드맵

### 1주차: 핵심 서비스 여정 연결

- 텍스트/음성 Requirement Input에서 Architecture Draft 생성
- Architecture Board에서 VPC/EC2/S3 중심 설계 확인
- Terraform 생성과 정적 diagnostics 연결
- deployment check와 비용/위험 요약 표시
- AWS 연결, Terraform Plan, 승인, Apply, 로그, Outputs 연결
- Destroy/Cleanup 확인
- Representative Use Journey 리허설과 실패 대비 백업 경로 준비

### 2주차: 운영 경로와 상태 추적 확장

- 필수 파라미터 validation 강화
- Terraform 파일 분리, variables, outputs 정리
- 배포 실패 상태, 재시도, 로그 조회 안정화
- 비용 분석과 보안 위험 규칙 추가
- 프로젝트 상세, 내 프로젝트 목록, 기본 알림 연결
- 실제 AWS 반복 배포/cleanup QA
- Source Repository 연결, Terraform commit/PR, CI/CD 상태 추적 v0
- Redis Runtime Cache 기반 long-running workflow status/cache 도입

### 3주차: 리버스 엔지니어링과 확장 기반

- Workspace UX, 상태 표시, 에러 문구 정리
- Deployment 진행률, 로그 하이라이트, 실패 원인 안내
- 리소스별 비용 카드와 예산 초과 경고
- Well-Architected 리뷰 v0
- AWS Provider Adapter 기반 Reverse Engineering PoC
- Provider Adapter 경계와 Azure/GCP 확장 placeholder 정리
- 발표 스크립트, 아키텍처 설명, 리스크 대응표 정리
- `pnpm lint`, `pnpm typecheck`, `pnpm build` green 상태 유지

## 비지원 범위

MVP에서 하지 않는다.

- 실시간 공동 편집
- CloudFormation 동시 지원
- 멀티 클라우드 실제 배포
- Azure/GCP 실제 Reverse Engineering
- 미래 용량을 예측하거나 임의 URL에 무제한 부하를 보내는 고도화된 트래픽 시뮬레이터
- 정교한 병목 예측 엔진
- 템플릿 마켓플레이스
- 무제한 자동 배포
- AI가 생성한 Terraform의 무승인 Apply
- 음성 입력의 무확인 보드 반영 또는 배포 실행
- Redis를 사용자 infrastructure resource로 제공

## 주요 리스크

| 리스크                     | 영향                                            | 대응                                                                |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| AI 설계 부정확             | 잘못된 Resource 조합 생성                       | 제한된 Golden Path, deterministic fallback, 사용자 승인             |
| 음성 입력 오인식           | 의도와 다른 Requirement Prompt 생성             | Transcribe 결과 확인, 사용자 수정 후 확정                           |
| Terraform 생성 오류        | Plan/Apply 실패                                 | 정적 diagnostics, `terraform validate`, Golden Path 테스트          |
| AWS 비용 사고              | 원치 않는 비용 발생                             | 리소스 whitelist, 비용 경고, Destroy/Cleanup 필수                   |
| 보안 위험 설정             | 공개 SSH, Public DB 등                          | deployment check, High 위험 강조 표시, 사용자 Plan 승인 기록    |
| CI/CD 권한 오남용      | 운영 배포 경로 사고                             | PR 기반 handoff, pipeline status tracking, 승인 gate                |
| Reverse Engineering 오해석 | 기존 cloud state와 인프라 설계 불일치 | Provider Adapter 범위 명시, 원본 보존과 보드 저장·Terraform 작업·AWS 변경 경계를 명확히 표시 |
| 로그/응답 secret 노출      | credential 유출                                 | 로그 마스킹, shared type secret 배제                                |
| 팀 계약 불일치             | API 연결 단계에서 깨짐                          | `docs/data-models.md`와 `packages/types` 선반영                     |

## 제품 언어

`CONTEXT.md`의 용어를 우선한다.

- 사용자가 만드는 설계는 **인프라 설계**
- 사용자가 입력하는 요구사항은 **Requirement Input**, 확정된 자연어 요구사항은 **Requirement Prompt**
- 음성 요구사항 입력은 **Voice Requirement Input**
- 시각 편집 화면은 **Architecture Board**
- AI가 제안한 미확정 설계는 **Architecture Draft**
- AI 기반 추천 기능은 **AI Architecture Recommendation**
- Terraform 미리보기는 **IaC Preview**
- 배포 전 검증은 **deployment check**
- 실제 클라우드 실행 단위는 **Deployment**
- 실행 기록은 **Deployment History**
- 빠른 검증/샌드박스 실행 경로는 **managed deployment**
- 팀 운영 배포 경로는 **CI/CD delivery**
- 재사용 가능한 application build identity는 **Application Artifact**, 해당 artifact를 runtime에 반영한 이력은 **Application Release**
- application byte identity는 **artifactFingerprint**, orchestrator·compute·capacity·rollout을 포함한 실행 목표 identity는 **deploymentTargetFingerprint**
- provider의 current state 조회, desired target 비교, rollout, health 확인, rollback evidence, already-active 판정을 캡슐화하는 경계는 **Runtime Convergence Adapter**
- 기존 클라우드 상태 복원은 **Reverse Engineering**
- 내부 Redis 기반 상태/cache 계층은 **Runtime Cache**
- 성공한 Deployment의 제한된 실시간 관측 세션은 **Live Observation**
- 발표에서 보여주는 대표 서비스 흐름은 **Representative Use Journey**

## Service Specification

기획자와 개발자가 함께 읽는 서비스 흐름, 현재 구현 상태, 기능 요구사항은 [Service Specification](./service-specification.md)을 참고한다. 이 문서는 canonical 계약을 읽기 쉽게 풀어쓴 안내서이며, 범위나 필드명이 충돌하면 이 문서와 `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다.
