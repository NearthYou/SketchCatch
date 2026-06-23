# AI 고도화 고려사항 초안

> 상태: 코치 피드백을 반영한 PR 검토용 초안이다. MVP에서 제외한 항목을 잊지 않기 위한 참고 문서이며, 팀 전체 로드맵 확정 문서가 아니다.

이 문서는 gg AI 파트 범위를 정리하면서 MVP 결정에서 끝내지 않고, 이후 고도화 경로와 재검토 조건을 함께 남기기 위한 문서다. MVP 문서에는 지금 구현할 범위를 적고, 이 문서에는 나중에 확장할 때 다시 볼 판단 근거를 적는다.

## 기록 원칙

- MVP 결정은 [AI MVP 범위](./001_AI파트MVP범위초안_gg.md)에 남긴다.
- 고도화 방향은 이 문서에 남긴다.
- 범위 논의 중 MVP에서 제외하거나 후순위로 미룬 선택지는 삭제하지 않고 이 문서에 남긴다.
- "포기"는 영구 폐기가 아니라 MVP 안전성과 일정 때문에 내린 보류 결정으로 기록한다.
- 실제 AWS 비용, 보안, 배포와 연결되는 항목은 안전장치와 실패 fallback을 같이 검토한다.
- 발표의 기술적 챌린지는 "우리가 처음 해봐서 어려운 기능"이 아니라 "객관적으로 설계 고민이 필요한 기능"을 중심으로 잡는다.

## 자연어 요구사항 기반 인프라 생성

MVP 결정:

- 자연어 요구사항 기반 Architecture Draft를 gg AI 파트의 핵심 경로로 올린다.
- 입력에서 예산, 예상 트래픽, 런타임, DB, 가용성 우선순위, 보안 우선순위를 추출한다.
- 결과는 `ArchitectureJson`으로 반환하고, Architecture Board와 Terraform Preview가 같은 그래프를 바라보게 한다.
- 알 수 없는 요구사항은 confidence를 낮추고 Template fallback 또는 수동 편집으로 유도한다.

고도화 방향:

- 자연어 요구사항을 더 세밀한 constraint model로 분리한다.
- 예산, region, traffic, availability, security preference, data store preference를 별도 필드로 저장한다.
- 요구사항과 생성된 Resource 사이의 reasoning trace를 남긴다.
- 사용자가 후속 요청으로 설계를 수정할 수 있게 한다.

재검토 조건:

- 대표 템플릿만으로 사용자의 요구사항을 충분히 표현하지 못할 때
- Architecture Draft validation과 fallback이 안정화되어 LLM 자유 입력을 받아도 보드가 깨지지 않을 때
- 비용·성능 시뮬레이션이 자연어 조건과 연결되어야 할 때

## AI 기반 인프라 수정

MVP 결정:

- MVP에서는 "초안 생성"과 "위험/비용 설명"을 먼저 구현한다.
- 기존 Architecture Graph를 AI가 직접 수정하는 기능은 고도화로 둔다.

고도화 방향:

- 사용자가 "비용을 줄여줘", "트래픽이 늘어났을 때 버틸 수 있게 바꿔줘", "보안을 강화해줘" 같은 요청을 입력하면 현재 `ArchitectureJson`을 분석한다.
- AI는 즉시 반영하지 않고 변경 proposal을 만든다.
- 변경 proposal은 추가/수정/삭제될 Resource와 Edge를 명시한다.
- proposal은 schema validation과 rule engine 검증을 통과해야 적용할 수 있다.
- 적용 전후 비용, 성능, 보안 차이를 보여준다.

재검토 조건:

- Architecture Board 편집과 버전 관리가 안정화될 때
- 사용자가 수동 편집보다 자연어 수정 요청을 더 자주 원할 때
- 변경 proposal을 되돌리거나 비교할 수 있는 UX가 준비될 때

## 비용 및 트래픽 시뮬레이션

MVP 결정:

- 비용 추정은 static price table과 Resource별 cost driver로 시작한다.
- 트래픽 시뮬레이션은 실제 부하 테스트가 아니라 그래프 기반 assumption 모델로 시작한다.
- 병목 후보, 비용 초과 가능성, capacity warning을 Check Finding이나 별도 결과로 보여준다.

고도화 방향:

- 요청 흐름을 `ArchitectureJson.edges` 기준으로 계산한다.
- Resource별 대략적인 처리량, instance class, storage, network cost assumption을 분리한다.
- 사용자가 RPS, 월 트래픽, 요청 크기, 예산을 바꾸면 비용과 병목 finding을 다시 계산한다.
- Architecture Board에서 병목 Resource를 시각적으로 강조한다.
- 시뮬레이션 결과를 버전 비교와 연결한다.

재검토 조건:

- 발표에서 기술적 챌린지를 더 강하게 보여줘야 할 때
- 비용 추정만으로는 차별화가 약할 때
- 사용자가 설계안 간 비용/성능 trade-off를 비교해야 할 때

## 인프라 버전 관리

MVP 결정:

- 프로젝트 저장과 Architecture Snapshot은 기본으로 둔다.
- Git처럼 풍부한 branch/merge 모델은 MVP 범위를 넘긴다.

고도화 방향:

- 설계 버전마다 `ArchitectureJson`, Terraform Preview, 비용/위험 분석 summary를 함께 저장한다.
- 버전 간 Resource 추가/수정/삭제와 Edge 변경점을 계산한다.
- "저비용 버전", "고가용성 버전", "실험 버전"처럼 설계안을 비교할 수 있게 한다.
- 롤백은 실제 AWS 되돌리기가 아니라 설계 그래프를 이전 버전으로 복원하는 단계부터 시작한다.

재검토 조건:

- 사용자가 AI 수정 proposal을 여러 개 비교해야 할 때
- Terraform 변경점과 보드 변경점을 함께 보여줘야 할 때
- Deployment History와 설계 버전을 연결해야 할 때

## GitHub 링크 기반 초안 생성

MVP 결정:

- GitHub 링크 기반 초안 생성은 핵심 기술적 챌린지에서 내린다.
- Source Repository는 자연어 요구사항을 보강하는 보조 evidence로만 사용한다.
- public repository의 README, package metadata, Dockerfile, compose file 정도만 선택적으로 본다.

후순위로 미루는 이유:

- 같은 백엔드 코드라도 EC2, ECS, Fargate, Kubernetes, Lambda 등 여러 배포 방식이 가능하다.
- 소스 코드만으로 인프라 구성의 "정답"을 판단하기 어렵다.
- 코드 분석 자체보다 요구사항 해석, 리소스 선택, 비용·성능 조건 반영이 더 설득력 있는 챌린지다.

고도화 방향:

- 자연어 요구사항과 Source Repository evidence를 함께 사용한다.
- repository tree를 더 넓게 분석해 frontend/backend/database 경계를 추론한다.
- private repository는 OAuth와 권한 범위를 설계한 뒤 지원한다.
- monorepo와 multi-service repository를 서비스 단위로 나누어 Architecture Draft를 만든다.

재검토 조건:

- 자연어 요구사항만으로 사용자의 실제 앱 구조를 충분히 파악하기 어려울 때
- 사용자가 실제 repository를 설계 evidence로 연결하려 할 때
- multi-service 구조를 지원해야 할 때

## LLM provider와 품질 관리

MVP 결정:

- OpenAI API를 기본 provider로 사용한다.
- 모든 호출은 backend API를 경유한다.
- provider 실패, timeout, 비용 제한, JSON 검증 실패 시 deterministic fallback 또는 Template 결과로 돌아간다.
- LLM은 구조화된 결과를 제안할 수 있지만, deployable artifact의 최종 권한을 갖지 않는다.

고도화 방향:

- provider interface를 만들어 OpenAI, Gemini, Claude 같은 provider 교체를 쉽게 한다.
- prompt versioning과 평가용 fixture를 둔다.
- Architecture Draft 생성 결과를 golden test로 비교한다.
- 설명 품질, 위험 누락, 과잉 경고를 평가하는 QA checklist를 만든다.
- LLM output과 deterministic rule output이 충돌할 때 어떤 값을 우선할지 정책화한다.

재검토 조건:

- LLM 비용이 팀 예산에 영향을 줄 때
- provider 장애가 반복될 때
- AI 결과 품질을 수치로 비교해야 할 때

## 대화형 AI 보조

MVP 결정:

- AI 챗봇 화면을 별도 제품 축으로 만들지 않는다.
- MVP의 AI는 자연어 요구사항 기반 초안 생성, 비용/위험 분석, Terraform 오류 설명처럼 구체적인 작업 흐름 안에서만 동작한다.

고도화 방향:

- 사용자가 Architecture Board, Terraform Preview, simulation result, Plan 결과를 보면서 질문할 수 있는 context-aware assistant를 제공한다.
- 대화형 응답이 실제 구조 변경을 제안할 때는 즉시 반영하지 않고 patch preview나 Draft 변경 제안으로 보여준다.
- 대화 기록을 프로젝트 활동 내역과 연결할지 여부를 검토한다.

재검토 조건:

- 사용자가 보드나 시뮬레이션 결과를 이해하지 못해 반복 질문이 생길 때
- 오류 설명과 비용/위험 설명을 한 화면에서 대화형으로 묶을 필요가 있을 때
- 구조 변경 제안에 대한 승인 UX가 마련될 때

## Terraform 코드 작성 보조

MVP 결정:

- AI는 Terraform 최종본을 직접 Apply하지 않는다.
- sw 파트의 Terraform 생성 결과를 설명하고 위험 지점을 보조한다.
- 코드 작성 보조는 사람 검토와 문법 검증을 전제로 한다.

고도화 방향:

- Terraform plan output을 구조화해서 변경 요약을 만든다.
- HCL parser나 `terraform validate` 결과와 AI 설명을 연결한다.
- 코드 수정 제안을 patch 형식으로 제공하되, 사용자가 명시적으로 적용하게 한다.
- Architecture Graph와 Terraform 코드의 차이를 설명한다.

재검토 조건:

- Terraform 코드 에디터가 실제 사용자 작업 흐름의 중심이 될 때
- 코드 수정 시 다이어그램 반영 기능이 안정화될 때
- Plan 결과를 사용자가 이해하지 못하는 문제가 반복될 때

## 위험도와 보안 검증

MVP 결정:

- Cost Risk, Security Risk, configuration, permission finding을 `low`, `medium`, `high`로 분류한다.
- 룰 엔진이 finding을 만들고 AI는 이유와 수정 가이드를 설명한다.

고도화 방향:

- AWS Well-Architected Framework, CIS Benchmark, IAM least privilege 기준을 일부 반영한다.
- finding에 자동 수정 후보를 붙인다.
- 위험을 ResourceNode와 Terraform line에 동시에 연결한다.
- false positive를 사용자가 무시하거나 해소 처리할 수 있게 한다.

재검토 조건:

- 실제 AWS 배포가 열릴 때
- Security Group, S3 public access, IAM policy 같은 보안 finding이 늘어날 때
- 팀이 보안 기준을 발표 평가 포인트로 삼을 때

## 지원 Resource 확장

MVP 결정:

- MVP Architecture Draft와 비용/위험 분석은 제한된 Resource set에서 시작한다.
- 기본 지원 Resource는 VPC, Subnet, EC2, RDS, S3, Security Group, CloudFront 수준으로 제한한다.
- 알 수 없는 Resource는 억지로 추정하지 않고 `UNKNOWN` 또는 Template 선택 fallback으로 처리한다.

고도화 방향:

- ALB, NAT Gateway, IAM, Lambda, DynamoDB, ECR, ECS 같은 Resource를 단계적으로 추가한다.
- Resource별 required config, cost driver, performance assumption, security rule, Terraform mapping을 한 세트로 관리한다.
- Resource support matrix를 만들어 "보드 표시 가능", "Terraform 생성 가능", "비용 추정 가능", "성능 시뮬레이션 가능", "위험 분석 가능"을 구분한다.

재검토 조건:

- 팀 발표 시나리오가 EC2/RDS/S3 범위를 넘어설 때
- 자연어 요구사항 기반 초안에서 자주 `UNKNOWN` Resource를 보게 될 때
- Terraform 생성기와 비용/위험 룰이 Resource별로 안정화될 때

## 오류 설명

MVP 결정:

- 룰 기반 분류기가 Terraform/AWS 오류를 먼저 분류한다.
- LLM은 분류 결과, 오류 원문, 실행 단계, 관련 Resource 맥락을 받아 설명과 다음 행동을 만든다.
- 권한 부족, 인증 문제, region 문제, quota 문제, syntax 문제, Resource 연결 문제부터 처리한다.

MVP에서 미룬 선택지:

- 카테고리만 붙이고 설명을 거의 만들지 않는 최소형은 사용자 가치가 약해서 선택하지 않았다.
- 발표 오류 2-3개만 하드코딩하는 데모형은 빠르지만 실제 기능처럼 보기 어려워 선택하지 않았다.
- 실패한 Apply나 Terraform 오류를 gg 파트 문서에서 메인 발표 흐름으로 확정하는 것은 팀 공통 결정 범위를 침범하므로 하지 않는다.
- Plan/Apply 로그 전체를 깊게 분석하고 Deployment History와 원인 추적을 완전히 연결하는 방식은 MVP 범위를 넘어서 고도화로 미룬다.

고도화 방향:

- 오류 원문을 fingerprint로 분류해 재발하는 오류 설명을 캐시한다.
- 배포 로그와 Deployment History를 연결해 실패 원인을 시간순으로 보여준다.
- 실패 원인별 해결 가이드 링크를 제공한다.
- `terraform plan` 결과와 `terraform validate` 결과를 구조화해 line/resource 단위 설명을 제공한다.
- 반복 오류에 대해 "이번 프로젝트에서 자주 실패한 원인"을 요약한다.

재검토 조건:

- 실제 Apply 실패 로그가 쌓일 때
- 같은 오류 설명을 여러 화면에서 재사용해야 할 때
- 오류 원인을 Resource, Terraform line, Deployment History에 함께 연결해야 할 때
