# 제품 방향

SketchCatch는 자연어로 클라우드 인프라를 설계하고, 다이어그램으로 이해하고, Terraform으로 생성하고, AI로 검증한 뒤, 안전하게 배포하는 **AI 기반 멀티 클라우드 IaC 플랫폼**이다.

MVP는 AWS와 Terraform을 기준으로 구현한다. 장기적으로는 Azure, GCP 등 다른 클라우드와 Terraform Provider 확장을 전제로 한다.

## 1차 MVP 목표

1차 MVP의 최우선 목표는 아래 한 문장으로 고정한다.

> AI가 추천한 인프라를 실제 AWS에 배포하고 동작시키는 End-to-End 데모 완성

기능 개수를 늘리는 것보다, 아래 흐름이 실제로 이어지는 것이 우선이다.

```text
Requirement Prompt
→ Architecture Draft
→ Architecture Board
→ IaC Preview
→ Pre-Deployment Check
→ Terraform Plan
→ 사용자 승인
→ Terraform Apply
→ 실제 AWS 리소스 동작 확인
→ Deployment History 확인
→ Destroy/Cleanup
```

## 핵심 포지셔닝

SketchCatch는 단순 다이어그램 도구가 아니다.

- 자연어 요구사항을 인프라 그래프로 구조화한다.
- 다이어그램과 Terraform이 같은 설계 데이터를 바라보게 한다.
- 배포 전 비용, 보안, 설정 위험을 보여준다.
- 사용자가 승인한 Terraform Plan만 실제 클라우드에 반영한다.
- 실제 배포 기록, 로그, output, cleanup 상태를 남긴다.

## 대상 사용자

| 사용자 | 상황 | 핵심 니즈 |
| --- | --- | --- |
| 주니어 개발자 | 클라우드와 Terraform을 배우는 단계 | 쉬운 설계, 구조 이해, 안전한 배포 |
| 백엔드 개발자 | 서비스 개발은 가능하지만 인프라 경험이 부족함 | 빠른 인프라 초안, 코드 생성, 배포 보조 |
| 사이드프로젝트 팀 | 인프라 전담자가 없음 | 저비용 구조, 빠른 배포, 위험 검증 |
| 초기 스타트업 | MVP를 빠르게 출시해야 함 | 실용적인 기본 아키텍처와 비용 관리 |
| DevOps 입문자 | 기존 클라우드 환경을 이해해야 함 | 리소스 구조 시각화와 IaC 전환 |
| 기술 리드 | 팀원의 설계를 검토해야 함 | 위험 요약, 품질 리뷰, 변경 영향 확인 |

## 유지할 핵심 기능

| 기능 | 기준 |
| --- | --- |
| 자연어 기반 인프라 설계 | Requirement Prompt를 Architecture Draft로 변환한다. |
| 다이어그램 편집 | Architecture Board에서 Resource와 관계를 직접 수정한다. |
| Terraform 생성 | 다이어그램 기반 설계를 IaC Preview로 변환한다. |
| AI 검증 및 수정 제안 | 비용, 보안, 설정 위험을 설명하고 수정 방향을 제안한다. |

## 축소할 기능

| 기능 | 기준 |
| --- | --- |
| 고도화된 트래픽 시뮬레이터 | 실제 부하 테스트가 아니라 구조 기반 위험 안내로 제한한다. |
| 병목 예측 엔진 | 정밀 예측이 아니라 잠재 병목 가능성 경고로 제한한다. |

## 강화할 기능

| 기능 | 기준 |
| --- | --- |
| 실제 AWS Deployment | Plan, 승인, Apply, 로그, Outputs, Destroy/Cleanup까지 연결한다. |
| 리버스 엔지니어링 | 기존 클라우드 리소스를 가져와 Architecture Board로 복원한다. MVP 이후 AWS부터 시작한다. |
| 비용 분석 | 리소스별 예상 비용, 고비용 리소스, 예산 초과 가능성을 보여준다. |
| Well-Architected 기반 리뷰 | 보안, 비용, 신뢰성, 성능, 운영 관점으로 아키텍처를 리뷰한다. |

## 4일 E2E 데모 범위

데모 안정성을 위해 실제 live apply 기본 경로는 아래 리소스로 제한한다.

- VPC
- Public Subnet
- Internet Gateway
- Route Table
- Security Group
- EC2
- S3 Bucket

RDS는 생성/삭제 시간과 비용 리스크가 크므로 4일 데모의 기본 live apply 경로에서는 제외한다. 화면과 Terraform 생성 지원 대상에는 둘 수 있지만, 발표용 실제 실행은 EC2 + S3 + VPC 계열로 고정한다.

## 3주 로드맵

### 1주차: E2E 데모 완성

- 자연어 입력에서 Golden Path Architecture Draft 생성
- Architecture Board에서 VPC/EC2/S3 중심 설계 확인
- Terraform 생성과 정적 diagnostics 연결
- Pre-Deployment Check와 비용/위험 요약 표시
- AWS 연결, Terraform Plan, 승인, Apply, 로그, Outputs 연결
- Destroy/Cleanup 확인
- 데모 리허설과 실패 대비 녹화본 준비

### 2주차: 반복 가능한 MVP 흐름

- 필수 파라미터 validation 강화
- Terraform 파일 분리, variables, outputs 정리
- 배포 실패 상태, 재시도, 로그 조회 안정화
- 비용 분석과 보안 위험 규칙 추가
- 프로젝트 상세, 내 프로젝트 목록, 기본 알림 연결
- 실제 AWS 반복 배포/cleanup QA

### 3주차: 폴리싱과 확장 기반

- Workspace UX, 상태 표시, 에러 문구 정리
- Deployment 진행률, 로그 하이라이트, 실패 원인 안내
- 리소스별 비용 카드와 예산 초과 경고
- Well-Architected 리뷰 v0
- AWS 리소스 목록 조회 기반 리버스 엔지니어링 PoC
- 발표 스크립트, 아키텍처 설명, 리스크 대응표 정리
- `pnpm lint`, `pnpm typecheck`, `pnpm build` green 상태 유지

## 비지원 범위

MVP에서 하지 않는다.

- 실시간 공동 편집
- CloudFormation 동시 지원
- 멀티 클라우드 실제 배포
- 고도화된 트래픽 시뮬레이터
- 정교한 병목 예측 엔진
- 템플릿 마켓플레이스
- 무제한 자동 배포
- AI가 생성한 Terraform의 무승인 Apply

## 주요 리스크

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| AI 설계 부정확 | 잘못된 Resource 조합 생성 | 제한된 Golden Path, deterministic fallback, 사용자 승인 |
| Terraform 생성 오류 | Plan/Apply 실패 | 정적 diagnostics, `terraform validate`, Golden Path 테스트 |
| AWS 비용 사고 | 원치 않는 비용 발생 | 리소스 whitelist, 비용 경고, Destroy/Cleanup 필수 |
| 보안 위험 설정 | 공개 SSH, Public DB 등 | Pre-Deployment Check, High 위험 차단 또는 별도 승인 |
| 로그/응답 secret 노출 | credential 유출 | 로그 마스킹, shared type secret 배제 |
| 팀 계약 불일치 | API 연결 단계에서 깨짐 | `docs/data-models.md`와 `packages/types` 선반영 |

## 제품 언어

`CONTEXT.md`의 용어를 우선한다.

- 사용자가 만드는 설계는 **Practice Architecture**
- 시각 편집 화면은 **Architecture Board**
- AI가 제안한 미확정 설계는 **Architecture Draft**
- Terraform 미리보기는 **IaC Preview**
- 배포 전 검증은 **Pre-Deployment Check**
- 실제 클라우드 실행 단위는 **Deployment**
- 실행 기록은 **Deployment History**
