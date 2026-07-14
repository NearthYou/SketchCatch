# 제품 방향

SketchCatch는 자연어/음성 요구사항, Source Repository, 기존 클라우드 상태를 입력으로 받아 provider-neutral Practice Architecture를 만들고, AI/Bedrock/Amazon Q로 설계와 위험을 보강하며, Terraform IaC Preview, Git/CI/CD Integration, Direct Deployment, Reverse Engineering까지 연결하는 **multi-cloud-ready IaC 운영 서비스**다.

MVP는 AWS와 Terraform을 기준으로 구현한다. 다만 제품 모델은 AWS 전용이 아니라 Provider Adapter를 통한 Azure, GCP 등 다른 클라우드 확장을 전제로 한다.

## 1차 MVP 목표

1차 MVP의 최우선 목표는 아래 한 문장으로 고정한다.

> 사용자가 요구사항, Source Repository, 기존 클라우드 상태 중 하나에서 시작해 Practice Architecture를 만들고, IaC Preview와 안전 검사를 거쳐 Direct Deployment Path 또는 Git/CI/CD Deployment Path로 운영 가능한 IaC 흐름을 완성한다.

기능 개수를 늘리는 것보다, 아래 핵심 서비스 여정이 실제로 이어지는 것이 우선이다.

```text
Requirement Input
→ Requirement Prompt
→ AI Architecture Recommendation
→ Architecture Draft
→ Architecture Board
→ IaC Preview
→ Pre-Deployment Check
→ User-Accepted Change
→ Direct Deployment Path 또는 Git/CI/CD Deployment Path
→ Deployment History
→ Auto Cleanup
```

## 핵심 포지셔닝

SketchCatch는 단순 다이어그램 도구가 아니다.

- 자연어 요구사항을 인프라 그래프로 구조화한다.
- 음성 요구사항은 Amazon Transcribe 기반 Voice Requirement Input으로 받고, 사용자가 확인한 뒤 Requirement Prompt로 확정한다.
- 다이어그램과 Terraform이 같은 설계 데이터를 바라보게 한다.
- AI, Bedrock, Amazon Q Assistance는 Architecture Draft, 설명, 리뷰, 수정 제안을 보강한다.
- 배포 전 비용, 보안, 설정 위험을 보여주되 High Security Risk도 사용자 검토 정보로 유지하며 Terraform Plan 승인은 허용한다.
- 사용자가 승인한 Terraform Plan만 Direct Deployment Path로 실제 클라우드에 반영한다.
- 팀 운영 배포는 Source Repository와 Git/CI/CD Integration으로 넘긴다.
- Reverse Engineering은 기존 클라우드 Resource를 Provider Adapter로 스캔해 Practice Architecture와 IaC Preview/import 제안으로 전환한다.
- 실제 배포 기록, 로그, output, cleanup 상태를 Deployment History에 남긴다.

## 대상 사용자

| 사용자 | 상황 | 핵심 니즈 |
| --- | --- | --- |
| 애플리케이션 개발자 | 서비스 요구사항을 인프라 설계와 IaC로 빠르게 옮겨야 함 | 쉬운 설계, 구조 이해, 안전한 배포 |
| 백엔드 개발자 | 서비스 개발은 가능하지만 인프라 경험이 부족함 | 빠른 인프라 초안, 코드 생성, 배포 보조 |
| 사이드프로젝트 팀 | 인프라 전담자가 없음 | 저비용 구조, 빠른 배포, 위험 검증 |
| 초기 스타트업 | MVP를 빠르게 출시해야 함 | 실용적인 기본 아키텍처와 비용 관리 |
| 플랫폼/DevOps 엔지니어 | 기존 cloud state 분석, IaC 전환, 운영 배포 흐름 정리가 필요함 | Reverse Engineering, Git/CI/CD handoff, 위험 요약 |
| 기술 리드/SRE | 팀원의 설계와 운영 변경을 검토해야 함 | 품질 리뷰, 변경 영향 확인, 안전한 승인 흐름 |

## 유지할 핵심 기능

| 기능 | 기준 |
| --- | --- |
| Requirement Input | 텍스트와 Voice Requirement Input을 Requirement Prompt로 정규화한다. |
| AI Architecture Recommendation | Requirement Prompt를 Architecture Draft로 변환하고 수락 전 설명을 제공한다. |
| 다이어그램 편집 | Architecture Board에서 Resource와 관계를 직접 수정한다. |
| Terraform 생성 | 다이어그램 기반 설계를 IaC Preview로 변환한다. |
| Pre-Deployment Check | 비용, 보안, 설정 위험을 설명하고 수정 방향을 제안한다. |
| Direct Deployment Path | sandbox/practice 실행에서 Plan, 승인, Apply, 로그, Outputs, Auto Cleanup까지 연결한다. |
| Live Observation | 성공한 Demo Web Service Deployment의 실제 요청, CloudWatch 측정값, ASG/EC2 상태를 15분 세션으로 구분해 관측한다. |
| Git/CI/CD Integration | IaC Preview를 Source Repository PR과 외부 pipeline 상태로 연결한다. |
| Reverse Engineering | 기존 클라우드 상태를 Practice Architecture와 IaC Preview/import 제안으로 전환한다. |

## 축소할 기능

| 기능 | 기준 |
| --- | --- |
| 고도화된 트래픽 시뮬레이터 | 미래 용량 예측·임의 target·무제한 부하 생성은 지원하지 않는다. 성공 Deployment의 제한된 Live Observation은 실제 서비스 흐름 검증 용도로만 제공한다. |
| 병목 예측 엔진 | 정밀 예측이 아니라 잠재 병목 가능성 경고로 제한한다. |

## 강화할 기능

| 기능 | 기준 |
| --- | --- |
| 실제 AWS Direct Deployment | Plan, 승인, Apply, 로그, Outputs, Destroy/Cleanup까지 연결한다. |
| Git/CI/CD 운영 경로 | Terraform commit/PR, pipeline template, Plan 결과, 실행 상태를 연결한다. |
| 리버스 엔지니어링 | Provider Adapter로 기존 cloud Resource를 가져와 Architecture Board와 IaC Preview/import 제안으로 복원한다. MVP는 AWS-first로 시작한다. |
| 비용 분석 | Practice Architecture, IaC Preview, Deployment Plan, Deployment History 단위의 Cost Risk를 보여준다. |
| Well-Architected 기반 리뷰 | 보안, 비용, 신뢰성, 성능, 운영 관점으로 아키텍처를 리뷰한다. |
| Runtime Cache | Redis를 내부 Runtime Cache로 사용해 Deployment, Reverse Engineering, Git/CI/CD 상태 추적과 로그 스트리밍을 보조한다. |

Repository Analysis에서 Git/CI/CD 연결을 시작하면 GitHub App callback은 이미 분석한 Repository만 자동으로 연결한다. 사용자는 Repository를 다시 고르거나 다시 분석하지 않으며, `프로젝트 배포 타깃`과 `GitOps 감시 설정`을 모두 저장한 뒤 기존 추천·질문 상태로 돌아가 Board 생성을 계속한다. ECS Fargate 추천은 분석 commit SHA와 Dockerfile 근거, 프로젝트 이름을 사용해 안전한 기본값을 채우지만 실제 cloud 배포나 Git 변경은 실행하지 않는다.
| Deployment 관측 | Live event, CloudWatch measured, Auto Scaling actual을 서로 다른 근거로 표시하고 AWS 조회 실패 시 sample 값을 만들지 않는다. |

## AWS-first 실행 범위와 Representative Use Journey

Direct Deployment Path의 안정성을 위해 실제 live apply 기본 경로는 아래 리소스로 제한한다.

- VPC
- Public Subnet
- Internet Gateway
- Route Table
- Security Group
- EC2
- S3 Bucket

RDS처럼 생성/삭제 시간과 비용 리스크가 큰 Resource는 기본 live apply 경로에서 제외할 수 있다. 화면, IaC Preview, Cost Analysis, Pre-Deployment Check 대상에는 둘 수 있지만 실제 Direct Deployment 실행은 별도 승인과 cleanup 계획이 있어야 한다.

`demo_web_service` Representative Use Journey는 ALB, Target Group, Launch Template, ASG, CloudWatch Alarm, Step Scaling Policy를 제한된 안전 프로필로 추가한다. 이 프로필은 ASG `min/desired/max=1/1/2`, `RequestCountPerTarget` 60건/분, scale-out `+1`, cooldown 180초만 허용하며 v1에는 scale-in이 없다. Live Observation의 `중지`와 `세션 종료`는 관측만 끝내고, 비용 리소스 정리는 기존 Deployment Destroy/Cleanup에서만 수행한다.

발표나 리허설에서는 별도 데모 전용 기능을 만들지 않는다. `Representative Use Journey`는 실제 서비스 흐름을 증명하는 대표 사용 여정이어야 한다.

## 3주 로드맵

### 1주차: 핵심 서비스 여정 연결

- 텍스트/음성 Requirement Input에서 Architecture Draft 생성
- Architecture Board에서 VPC/EC2/S3 중심 설계 확인
- Terraform 생성과 정적 diagnostics 연결
- Pre-Deployment Check와 비용/위험 요약 표시
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
- Redis를 사용자 Practice Architecture Resource로 제공

## 주요 리스크

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| AI 설계 부정확 | 잘못된 Resource 조합 생성 | 제한된 Golden Path, deterministic fallback, 사용자 승인 |
| 음성 입력 오인식 | 의도와 다른 Requirement Prompt 생성 | Transcribe 결과 확인, 사용자 수정 후 확정 |
| Terraform 생성 오류 | Plan/Apply 실패 | 정적 diagnostics, `terraform validate`, Golden Path 테스트 |
| AWS 비용 사고 | 원치 않는 비용 발생 | 리소스 whitelist, 비용 경고, Destroy/Cleanup 필수 |
| 보안 위험 설정 | 공개 SSH, Public DB 등 | Pre-Deployment Check, High 위험 강조 표시, 사용자 Plan 승인 기록 |
| Git/CI/CD 권한 오남용 | 운영 배포 경로 사고 | PR 기반 handoff, pipeline status tracking, 승인 gate |
| Reverse Engineering 오해석 | 기존 cloud state와 Practice Architecture 불일치 | Provider Adapter 범위 명시, import suggestion은 사용자 확인 후 적용 |
| 로그/응답 secret 노출 | credential 유출 | 로그 마스킹, shared type secret 배제 |
| 팀 계약 불일치 | API 연결 단계에서 깨짐 | `docs/data-models.md`와 `packages/types` 선반영 |

## 제품 언어

`CONTEXT.md`의 용어를 우선한다.

- 사용자가 만드는 설계는 **Practice Architecture**
- 사용자가 입력하는 요구사항은 **Requirement Input**, 확정된 자연어 요구사항은 **Requirement Prompt**
- 음성 요구사항 입력은 **Voice Requirement Input**
- 시각 편집 화면은 **Architecture Board**
- AI가 제안한 미확정 설계는 **Architecture Draft**
- AI 기반 추천 기능은 **AI Architecture Recommendation**
- Terraform 미리보기는 **IaC Preview**
- 배포 전 검증은 **Pre-Deployment Check**
- 실제 클라우드 실행 단위는 **Deployment**
- 실행 기록은 **Deployment History**
- 빠른 검증/샌드박스 실행 경로는 **Direct Deployment Path**
- 팀 운영 배포 경로는 **Git/CI/CD Deployment Path**
- 기존 클라우드 상태 복원은 **Reverse Engineering**
- 내부 Redis 기반 상태/cache 계층은 **Runtime Cache**
- 성공한 Deployment의 제한된 실시간 관측 세션은 **Live Observation**
- 발표에서 보여주는 대표 서비스 흐름은 **Representative Use Journey**

## 상세 기획서

기획자와 개발자가 함께 읽는 상세 서비스 흐름, 현재 구현 상태, 기능 요구사항, 4인 책임 분배는 [SketchCatch 상세 기획서](./000_상세기획서.md)를 참고한다. 이 상세 기획서는 canonical 계약을 읽기 쉽게 풀어쓴 문서이며, 범위나 필드명이 충돌하면 이 문서와 `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다.
