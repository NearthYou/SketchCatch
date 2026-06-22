# 경근 AI 파트 MVP 범위

## 결론

경근 파트는 AI 분석 역할표의 비용 추정, 리소스별 비용 분석, 위험도 분석, 보안 설정 검증, Terraform 오류 설명, Terraform 코드 작성 보조, GitHub 링크 기반 초안 생성을 맡는다. MVP의 기준은 "AI가 분석하고 설명하고 보조한다"이지, "AI가 검증되지 않은 AWS 배포 코드를 마음대로 만든다"가 아니다.

핵심 흐름은 다음과 같다.

```text
Diagram JSON 또는 Source Repository 또는 Terraform output
→ backend AI service
→ Architecture Draft / Cost Analysis / Risk Finding / Error Explanation
→ Architecture Board / IaC Preview / Plan-Apply 화면에 표시
```

## LLM 적용 범위

MVP에서 LLM은 설명 생성, Source Repository 단서 분류, Architecture Draft 직접 생성, Terraform 오류 설명을 맡는다. 다만 LLM 응답은 항상 검증 대상이며, 검증을 통과한 구조화 결과만 제품 흐름에 반영한다.

우선순위:

1. LLM 설명 생성
   - Resource 설명
   - Source Repository 추론 근거 설명
   - Check Finding 설명
   - Plan/Apply 오류 설명
   - 배포 전 체크리스트 문장화
2. LLM Source Repository 단서 분류
   - GitHub 링크에서 얻은 README, package metadata, Dockerfile, compose file 단서를 정적 웹사이트, 단일 EC2 웹 서버, API 서버 + DB 중 하나로 분류
   - 3개 대표 유형에 속하지 않으면 Template 선택 또는 수동 편집으로 유도
3. LLM Architecture Draft 직접 생성
   - 결과는 정현 파트의 ArchitectureJson 구조와 호환되어야 한다.
   - JSON schema 검증, 지원 Resource 검증, 위험 기본값 보정을 통과해야 한다.
   - 검증 실패 시 LLM 결과를 버리고 Template 기반 Architecture Draft로 fallback한다.

LLM이 직접 하지 않는 것:

- IaC Preview 최종본 생성
- Terraform Apply 여부 판단
- AWS 권한 생성 또는 확장
- Pre-Deployment Check의 deploy-blocking 판정

LLM provider와 fallback:

- MVP 기본 provider는 OpenAI API로 한다.
- 프론트엔드는 LLM provider를 직접 호출하지 않는다. 모든 AI 요청은 backend API를 경유한다.
- OpenAI API key는 서버 환경변수로만 관리하고, 프론트 번들에 포함하지 않는다.
- provider timeout, API key 누락, rate limit, 비용 제한 초과, JSON 검증 실패가 발생하면 deterministic mock response 또는 Template 기반 결과로 fallback한다.
- 발표 데모는 외부 LLM provider가 실패해도 GitHub 링크 기반 초안 생성, 비용/위험 분석, 오류 설명 표시가 최소 동작해야 한다.

호출 흐름:

```text
frontend
→ backend AI service
→ OpenAI API
→ schema validation
→ fallback if needed
→ frontend
```

## 1. Architecture Draft 출력 범위

GitHub 링크 기반 초안 생성이나 fallback Template에서 Architecture Board가 열 수 있는 Practice Architecture 초안을 만든다.

MVP 깊이:

- 대표 의도는 정적 웹사이트, 단일 EC2 웹 서버, API 서버 + DB 3개로 제한한다.
- 생성 결과는 자유 텍스트가 아니라 정현 파트의 Diagram JSON 데이터 구조와 호환되는 Architecture Draft JSON이다.
- LLM이 Architecture Draft를 직접 생성할 수 있지만, 검증 실패 시 Template 기반 결과로 대체한다.
- VPC, Subnet, EC2, RDS, S3, Security Group 정도의 제한된 Resource만 생성한다.
- 알 수 없는 Source Repository나 유형은 무리해서 생성하지 않고 Template 선택을 유도한다.

완료 기준:

- 같은 입력에 대해 재현 가능한 초안을 만든다.
- Architecture Board에서 바로 열 수 있다.
- 생성된 Resource마다 초보자용 설명을 붙인다.

AI Architecture Draft 응답 DTO:

```ts
type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  source: "github" | "template_fallback" | "llm_fallback";
  confidence: "low" | "medium" | "high";
  assumptions: string[];
  explanations: string[];
};
```

- `architectureJson`은 기존 공통 타입을 그대로 사용한다.
- 정현의 Architecture Board는 `architectureJson`만 받아도 열릴 수 있어야 한다.
- AI 전용 근거와 설명은 `assumptions`, `explanations`, `confidence`, `source`에만 담는다.
- AI 전용 `resources`, `relationships` 같은 별도 그래프 구조를 만들지 않는다.

MVP에서 하지 않는 것:

- 모든 AWS 서비스를 지원하지 않는다.
- AI가 임의로 IAM 권한이나 공개 네트워크를 강하게 열지 않는다.
- 생성 직후 바로 Apply하지 않는다.

지원할 대표 유형:

| 대표 유형 | 입력 단서 예시 | 주요 Resource | 주요 Check Finding |
| --- | --- | --- | --- |
| 정적 웹사이트 | static build, frontend-only, 정적 export | S3, CloudFront | S3 public access, CloudFront 비용 |
| 단일 EC2 웹 서버 | Node server, Dockerfile, 단일 runtime port | VPC, Subnet, EC2, Security Group | SSH `0.0.0.0/0`, instance type 비용 |
| API 서버 + DB | API server, database service, compose DB | VPC, Subnet, EC2, RDS, Security Group | RDS 비용, DB public access, 삭제 계획 누락 |

"간단한 쇼핑몰 서버" 같은 자연어 표현은 별도 대표 유형으로 두지 않고 API 서버 + DB의 별칭으로 처리할 수 있다.

## 2. Source Repository → Architecture Draft

사용자가 GitHub 링크를 넣으면 기존 애플리케이션의 단서를 읽고 Practice Architecture 초안을 만든다.

MVP 깊이:

- public GitHub repository URL 입력을 기본 경로로 한다.
- MVP 구현은 GitHub OAuth나 private repository API 연동이 아니라 public URL에서 후보 파일을 서버가 가져오는 방식으로 시작한다.
- GitHub URL 분석이 실패하면 README, package metadata, Dockerfile, compose file 텍스트를 직접 붙여넣는 fallback을 제공한다.
- 서버는 README, package metadata, Dockerfile, compose file, framework 흔적 정도만 본다.
- private repository, 대형 monorepo, 복잡한 마이크로서비스 추론은 제외한다.
- 실패하면 "링크 기반 추론 불가"를 명확히 보여주고 파일 붙여넣기 또는 Template 선택으로 대체한다.

분석 대상 파일:

| 파일 | 보는 이유 |
| --- | --- |
| README | 앱 목적, 실행 방식, 배포 힌트 |
| package metadata | Next.js, Node API, build script, dependency 단서 |
| Dockerfile | 런타임, 포트, 단일 서비스 여부 |
| docker-compose.yml | DB 필요 여부, 서비스 관계 |
| framework config | 정적 사이트인지 서버 앱인지 구분 |

완료 기준:

- Next.js 단일 앱, Node API, DB가 필요한 앱 정도를 구분한다.
- 앱 유형에 맞는 최소 Architecture Draft를 만든다.
- 추론 근거를 사용자에게 설명한다.
- GitHub URL fetch 실패, rate limit, 지원하지 않는 repository 구조를 사용자가 이해할 수 있는 실패 상태로 보여준다.

MVP에서 하지 않는 것:

- 전체 코드를 정밀 분석하지 않는다.
- Terraform을 repository 구조에서 자동 완성하지 않는다.
- secret, environment value, 실제 AWS 계정 정보를 읽지 않는다.
- private repository OAuth 연동은 하지 않는다.

## 3. IaC Preview / Terraform 코드 생성 보조

Terraform 생성 자체는 Practice Architecture에서 결정론적으로 만든다. AI는 그 결과를 설명하고, 누락된 설정이나 위험한 설정을 지적하는 보조 역할을 한다.

MVP 깊이:

- IaC Preview는 생성기 또는 템플릿이 만든다.
- AI는 "이 코드가 어떤 Resource를 만들며 왜 필요한지"를 설명한다.
- AI는 위험한 변경 제안, 누락된 변수, 초보자가 이해하기 어려운 부분을 설명한다.

완료 기준:

- IaC Preview와 Architecture Board의 Resource가 서로 대응된다.
- AI 설명은 Resource 단위로 볼 수 있다.
- AI가 만든 설명이 틀려도 실제 생성 코드는 흔들리지 않는다.

MVP에서 하지 않는 것:

- AI가 자유롭게 Terraform 최종본을 작성하지 않는다.
- AI가 생성한 코드를 바로 Apply하지 않는다.
- 코드 ↔ 다이어그램 동기화의 원천 진실을 AI 응답으로 두지 않는다.

## 4. 비용 / 보안 / 배포 전 위험 분석과 설명

Pre-Deployment Check에서 Check Finding을 만들고, AI가 초보자에게 이해 가능한 말로 설명한다.

비용 책임 경계:

- 경근 파트는 비용 추정, 리소스별 비용 분석, 월 예상 비용 설명을 책임진다.
- MVP 비용 추정은 실제 청구액 보장이 아니라 Resource type, instance class, 사용 시간 가정, static price table에 기반한 학습용 추정값이다.
- 비용 추정기는 static price table을 우선 사용하되, 나중에 AWS Pricing API로 교체할 수 있도록 cost estimator 경계를 둔다.
- 가격표에 없는 Resource나 설정은 금액을 억지로 만들지 않고 `low`, `medium`, `high` Cost Risk 등급으로 fallback한다.
- 공통 DB 스키마와 API 응답 형식은 팀장 기준을 따른다. 경근 파트는 비용 분석 결과를 그 공통 형식에 맞춰 제공한다.

MVP 깊이:

- Cost Risk, Security Risk, missing configuration, permission concern을 구분한다.
- 위험도는 `low`, `medium`, `high`로 제한한다.
- 룰 엔진이 먼저 비용/위험 finding을 만들고, AI는 finding과 비용 추정 근거를 설명한다.
- 비용은 total estimate와 resource-level estimate를 모두 제공한다.
- 기본 계산 가정은 `ap-northeast-2`, 월 `730`시간, MVP 기본 instance/storage 값을 사용한다.

예시 finding:

- Security Group이 `0.0.0.0/0` SSH를 허용하면 high Security Risk
- RDS, NAT Gateway, ALB는 Cost Risk
- Practice Session 종료 후 삭제 계획이 없으면 Cost Risk
- 필수 region, instance type, subnet 연결이 없으면 missing configuration

완료 기준:

- 각 finding에 이유, 영향, 수정 가이드가 있다.
- Apply 전 화면에서 사용자가 위험을 보고 멈출 수 있다.
- 비용 금액이 표시되는 경우에는 어떤 Resource와 가정 때문에 그 금액이 나왔는지 설명한다.
- 비용 추정값이 실제 AWS 청구액과 다를 수 있음을 사용자에게 표시한다.

AI Pre-Deployment Analysis 응답 DTO:

```ts
type MoneyEstimate = {
  amount: number;
  currency: "USD" | "KRW";
};

type ResourceCostEstimate = {
  resourceId: string;
  resourceType: ResourceType;
  name: string;
  monthlyEstimate: MoneyEstimate;
  costDrivers: string[];
  explanation: string;
};

type CheckFinding = {
  id: string;
  category: "cost" | "security" | "configuration" | "permission";
  severity: "low" | "medium" | "high";
  resourceId?: string;
  title: string;
  description: string;
  recommendation: string;
};

type ChecklistItem = {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  relatedFindingIds: string[];
};

type AiPreDeploymentAnalysisResult = {
  summary: string;
  totalMonthlyEstimate: MoneyEstimate & {
    pricingAssumption: string;
  };
  resourceCostEstimates: ResourceCostEstimate[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
};
```

- 응답은 하나로 합치되, 내부 필드는 비용, 위험, 체크리스트 배열로 분리한다.
- `resourceId`는 `ArchitectureJson.nodes[].id`와 연결되어야 한다.
- 채강의 Plan 전 화면은 이 DTO 하나로 비용/위험/체크리스트를 구성한다.
- 정현의 Architecture Board는 `findings[].resourceId`로 노드별 경고 표시를 할 수 있다.
- 이 DTO는 Apply 가능 여부의 최종 판정자가 아니라 배포 전 판단 근거를 제공하는 결과다.

## 5. 오류 설명 / 체크리스트 생성

Plan 또는 Apply에서 나온 오류와 배포 전 확인 항목을 초보자 언어로 바꾼다.

MVP 깊이:

- Plan 전 체크리스트를 생성한다.
- Terraform/AWS 오류 메시지를 카테고리화한다.
- 사용자가 다음에 해야 할 행동을 1-3개로 줄여 보여준다.

완료 기준:

- 권한 부족, region 문제, quota 문제, 잘못된 Resource 연결을 구분한다.
- 오류 원문을 숨기지 않고, 쉬운 설명을 함께 보여준다.
- 실패한 Apply 결과가 Deployment History에 남는다.

## 팀 의존성

| 대상 | 경근 파트가 필요한 것 | 경근 파트가 제공하는 것 |
| --- | --- | --- |
| 정현 | Diagram JSON 데이터 구조, Architecture Board 상태 | GitHub 링크 기반 Architecture Draft, Resource 설명 |
| 시원 | Terraform 코드, 코드 검증 결과, 코드 ↔ 다이어그램 동기화 기준, Terraform State 저장 기준 | Terraform 코드 작성 보조, 코드 위험 지점 설명 |
| 채강 | AWS 연결 상태, Plan/Apply 결과, 실시간 배포 로그, Terraform/AWS 오류 원문 | 배포 전 비용/위험 분석, Terraform 오류 설명, 체크리스트 |
| 윤서 | 로그인 사용자, 프로젝트 목록, 템플릿/활동/알림 화면 진입점 | 프로젝트/알림 화면에 표시할 AI 분석 요약 |
| 팀장 | 공통 DB 스키마, 공통 API 응답 형식 | AI 분석 결과 DTO 요구사항과 샘플 응답 |

## 5주 구현 순서

1. Week 1: 정현의 Diagram JSON과 호환되는 Architecture Draft 계약, AI 분석 DTO 계약 확정
2. Week 2: GitHub 링크 기반 초안 생성과 Template fallback 구현
3. Week 3: 비용 추정, 리소스별 비용 분석, 위험도/보안 검증 rule engine 구현
4. Week 4: Terraform 코드 작성 보조, Terraform 오류 설명, Plan/Apply 입력 연동
5. Week 5: 발표용 fallback, 체크리스트, 비용/위험/오류 설명 시나리오 고정

## 발표 시나리오

1. 사용자가 GitHub 링크를 입력한다.
2. AI가 Source Repository 단서를 분석해 Architecture Draft를 만든다.
3. 정현의 Architecture Board에서 Resource를 확인하고 수정한다.
4. 시원의 Terraform 변환 결과를 확인하고 AI가 코드 작성 보조와 위험 지점 설명을 제공한다.
5. 채강의 Plan 실행 전 AI가 비용 추정, 리소스별 비용 분석, 보안 위험, 체크리스트를 보여준다.
6. Apply 실패 또는 Terraform 오류가 발생하면 AI가 원인과 다음 행동을 초보자 언어로 설명한다.
