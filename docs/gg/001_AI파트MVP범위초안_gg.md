# gg AI 파트 MVP 범위 초안

> 상태: 팀장과 각 담당자의 선택 결과를 반영한 PR 검토용 초안이다. 실제 구현 전 shared type과 API schema에 한 번 더 맞춘다.

## 결론

gg 파트는 AI 분석 역할표의 비용 추정, 리소스별 비용 분석, 위험도 분석, 보안 설정 검증, Terraform 오류 설명, Terraform 코드 작성 보조, Source Repository 기반 초안 생성을 맡는 방향으로 제안한다. MVP의 기준은 "AI가 분석하고 설명하고 보조한다"이지, "AI가 검증되지 않은 AWS 배포 코드를 마음대로 만든다"가 아니다.

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
   - 결과는 jh 파트의 ArchitectureJson 구조와 호환되어야 한다.
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
- 발표나 QA에서 외부 LLM provider가 실패해도 GitHub 링크 기반 초안 생성, 비용/위험 분석, 오류 설명이 deterministic fallback으로 최소 동작해야 한다.
- 팀 전체 발표 메인 흐름은 팀 공통 결정이며, 이 문서는 gg AI 파트가 제공할 fallback과 검증 범위만 정의한다.

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
- 생성 결과는 자유 텍스트가 아니라 jh 파트의 Diagram JSON 데이터 구조와 호환되는 Architecture Draft JSON이다.
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
  metadata: {
    source: "github" | "template_fallback" | "llm_fallback";
    confidence: "low" | "medium" | "high";
    assumptions: string[];
    explanations: string[];
  };
};
```

- `architectureJson`은 기존 공통 타입을 그대로 사용한다.
- jh의 Architecture Board는 `architectureJson`만 받아도 열릴 수 있어야 한다.
- AI 전용 근거와 설명은 `metadata.source`, `metadata.assumptions`, `metadata.explanations`, `metadata.confidence`에만 담는다.
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

- gg 파트는 비용 추정, 리소스별 비용 분석, 월 예상 비용 설명을 책임진다.
- MVP 비용 추정은 실제 청구액 보장이 아니라 Resource type, instance class, 사용 시간 가정, static price table에 기반한 학습용 추정값이다.
- 비용 추정기는 static price table을 우선 사용하되, 나중에 AWS Pricing API로 교체할 수 있도록 cost estimator 경계를 둔다.
- 가격표에 없는 Resource나 설정은 금액을 억지로 만들지 않고 `low`, `medium`, `high` Cost Risk 등급으로 fallback한다.
- 공통 DB 스키마와 API 응답 형식은 팀장 기준을 따른다. gg 파트는 비용 분석 결과를 그 공통 형식에 맞춰 제공한다.

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
- ck의 Plan 전 화면은 이 DTO 하나로 비용/위험/체크리스트를 구성한다.
- jh의 Architecture Board는 `findings[].resourceId`로 노드별 경고 표시를 할 수 있다.
- 이 DTO는 Apply 가능 여부의 최종 판정자가 아니라 배포 전 판단 근거를 제공하는 결과다.

## 5. 오류 설명 / 체크리스트 생성

Plan 또는 Apply에서 나온 오류와 배포 전 확인 항목을 초보자 언어로 바꾼다.

MVP 결정:

- 오류 판정은 룰 기반 분류기가 먼저 수행한다.
- LLM은 분류된 오류와 원문, 실행 단계, 관련 Resource 맥락을 받아 초보자용 설명과 다음 행동을 만든다.
- LLM 응답은 원인 확정이 아니라 "가능성이 높은 원인"과 "확인할 것"으로 표현한다.
- 분류되지 않은 오류는 `unknown`으로 처리하고, 원문을 유지한 채 팀원 확인이나 로그 공유를 안내한다.

MVP 깊이:

- Plan 전 체크리스트를 생성한다.
- Terraform/AWS 오류 메시지를 룰 기반으로 카테고리화한다.
- 사용자가 다음에 해야 할 행동을 1-3개로 줄여 보여준다.
- 오류 설명은 자동 재시도, 자동 Apply, AWS 권한 변경, Terraform 코드 자동 수정까지 수행하지 않는다.

MVP 오류 카테고리:

| 카테고리 | 대표 단서 | 사용자에게 설명할 핵심 |
| --- | --- | --- |
| `permission` | `AccessDenied`, `UnauthorizedOperation`, `not authorized` | 현재 AWS 권한으로 해당 작업을 할 수 없음 |
| `credential` | `NoCredentialProviders`, `InvalidClientTokenId`, `ExpiredToken` | AWS 인증 정보가 없거나 만료됨 |
| `region_or_resource` | `InvalidAMIID.NotFound`, `InvalidSubnetID.NotFound`, `not found` | region 또는 참조 Resource가 맞지 않음 |
| `quota` | `VcpuLimitExceeded`, `LimitExceeded`, `quota` | 계정 한도 때문에 Resource를 만들 수 없음 |
| `syntax` | `terraform validate` 실패, `Unsupported argument`, `Missing required argument` | IaC Preview에 문법 또는 필수 값 문제가 있음 |
| `dependency` | dependency cycle, subnet/VPC/security group 연결 오류 | Resource 간 연결 관계가 잘못되었을 가능성이 있음 |
| `unknown` | 위 규칙에 매칭되지 않음 | 자동 판단하지 않고 원문과 확인 지점을 보여줌 |

AI Terraform 오류 설명 응답 DTO:

```ts
type AiTerraformErrorExplanationResult = {
  stage: "validate" | "plan" | "apply";
  category:
    | "permission"
    | "credential"
    | "region_or_resource"
    | "quota"
    | "syntax"
    | "dependency"
    | "unknown";
  severity: "low" | "medium" | "high";
  rawMessage: string;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  relatedResourceId?: string;
};
```

- `rawMessage`는 숨기지 않는다.
- `nextActions`는 1-3개로 제한한다.
- `relatedResourceId`는 오류가 특정 Resource와 연결될 때만 사용한다.
- ck의 Deployment History에는 원문, 실행 단계, 성공/실패 상태가 남고, gg 파트는 그 내용을 사용자 설명으로 바꾼다.

완료 기준:

- 권한 부족, 인증 문제, region 문제, quota 문제, 문법 문제, 잘못된 Resource 연결을 구분한다.
- 오류 원문을 숨기지 않고, 쉬운 설명을 함께 보여준다.
- 실패한 Apply 결과가 Deployment History에 남는다.

## 팀 의존성

| 대상 | gg 파트가 필요한 것 | gg 파트가 제공하는 것 |
| --- | --- | --- |
| jh | Diagram JSON 데이터 구조, Architecture Board 상태 | GitHub 링크 기반 Architecture Draft, Resource 설명 |
| sw | Terraform 코드, 코드 검증 결과, 코드 ↔ 다이어그램 동기화 기준, Terraform State 저장 기준 | Terraform 코드 작성 보조, 코드 위험 지점 설명 |
| ck | AWS 연결 상태, Plan/Apply 결과, 실시간 배포 로그, Terraform/AWS 오류 원문 | 배포 전 비용/위험 분석, Terraform 오류 설명, 체크리스트 |
| ys | 로그인 사용자, 프로젝트 목록, 템플릿/활동/알림 화면 진입점 | 프로젝트/알림 화면에 표시할 AI 분석 요약 |
| 팀장 | 공통 DB 스키마, 공통 API 응답 형식 | AI 분석 결과 DTO 요구사항과 샘플 응답 |

## 구현 전 팀 호환성 체크

이 섹션은 팀원별 Codex가 서로 다른 타입, 필드명, 책임 범위를 만들어 충돌하지 않도록 구현 전에 맞출 계약이다. 공통 타입의 최종 기준은 [데이터 모델](../data-models.md)이다.

팀원별 Codex에게는 [팀원 Codex 호환성 선택 문서](../team-codex/000_팀원Codex호환성선택문서.md)를 읽히고, 담당 문서의 선택 결과를 받아온다.

현재 제안 기준:

- 보드, AI, Terraform 생성기는 모두 `ArchitectureJson.nodes`와 `ArchitectureJson.edges`를 공유한다.
- AI Architecture Draft는 별도 `resources`, `relationships` 그래프를 만들지 않고 `architectureJson`만 보드 입력으로 제공한다.
- 비용/위험 분석은 `AiPreDeploymentAnalysisResult` 하나로 반환하되 내부 배열은 `resourceCostEstimates`, `findings`, `checklist`로 나눈다.
- 노드별 경고는 `CheckFinding.resourceId`와 `ArchitectureJson.nodes[].id`를 연결해서 표시한다.
- Terraform 오류 설명은 raw output을 숨기지 않고 `AiTerraformErrorExplanationResult.rawMessage`에 보존한다.
- 실제 Apply, AWS 권한 변경, Terraform 최종본 생성은 AI 파트 책임이 아니다.

팀원 선택 결과 반영:

- jh는 모든 항목 A를 선택했다. gg는 `architectureJson` 단독 입력, 공통 `ResourceType`, `CheckFinding.resourceId` 노드 연결을 기준으로 Architecture Draft와 Finding을 만든다.
- ck는 모든 항목 A를 선택했다. gg 오류 설명 입력은 `{ stage, rawMessage, relatedResourceId? }`로 제한하고, `stage`는 `validate`, `plan`, `apply`만 우선 지원한다.
- ys는 A / B / A / C를 선택했다. gg는 프로젝트 목록에 AI 요약을 필수 요구하지 않고, 중요한 AI 이벤트만 Activity 후보로 제공하며, 익명 workspace와 로그인 user 흐름을 모두 고려한다.
- sw는 모든 항목 A를 선택했다. gg는 `ArchitectureJson`을 Terraform 생성 원천 입력으로 유지하고, sw가 정의할 required config matrix를 따른다. IaC Preview 설명은 `resourceId` 또는 node id mapping 기준으로 연결하며, 코드 ↔ 다이어그램 동기화는 sw 소유로 둔다.
- 팀장은 C / A / B / C / A를 선택했다. gg는 공통 wrapper가 전체 route에 먼저 정리되는 흐름을 따르고, AI DTO는 `packages/types`에 둔다. Pre-Deployment Analysis는 저장 가능 대상으로 보고, AI source는 별도 최상위 `source` 필드보다 metadata 안에서 다룬다. `SUBNET`, `SECURITY_GROUP`, `CLOUDFRONT` 확장은 승인된 기준으로 본다.

구현 전에 반드시 확인해야 하는 호환 지점:

| 지점 | 왜 위험한가 | gg Codex가 할 일 | 팀원에게 확인할 것 |
| --- | --- | --- | --- |
| `ResourceType` 값 | AI가 만든 node를 보드/API/Terraform이 거부할 수 있음 | docs 브랜치에서 shared type과 API Zod schema는 `SUBNET`, `SECURITY_GROUP`, `CLOUDFRONT`까지 맞춘다 | jh/sw가 같은 문자열을 사용할 수 있는지 확인 |
| `ResourceNode.config` key | 같은 리소스를 팀원별로 다른 설정 이름으로 읽을 수 있음 | AI template에서 쓰는 key를 문서와 테스트 fixture에 고정한다 | sw가 Terraform 생성기에 필요한 필수 key 목록을 알려달라고 요청 |
| 공통 API 응답 wrapper | AI route만 다른 응답 모양이면 프론트 연결이 깨짐 | 팀장 선택 C에 따라 AI route만 별도 wrapper를 만들지 않고, 전체 route wrapper 정리 이후 같은 형식을 따른다 | 팀장에게 wrapper 적용 시점과 공통 helper 위치를 확인 |
| Plan/Apply raw output | 오류 설명 입력 모양이 ck 파트와 다르면 연동이 깨짐 | `stage`, `rawMessage`, 선택 `relatedResourceId`를 최소 입력으로 받게 한다 | ck에게 Plan/Apply 결과와 로그 line shape를 확인 |
| `ArchitectureSnapshot.source` | 저장 시 `github`, `template_fallback` 같은 AI provenance가 뒤섞일 수 있음 | 팀장 선택 C에 따라 AI 출처는 최상위 `source`보다 metadata 안에서 관리하는 방향으로 맞춘다 | jh/팀장에게 `ArchitectureSnapshot.source` 유지 범위와 metadata 구조 확인 |
| 분석 결과 저장 여부 | DB schema 없이 AI 결과를 저장하려 하면 충돌함 | 팀장 선택 B에 따라 Pre-Deployment Analysis 저장을 고려하고, Architecture Draft/Error Explanation은 별도 합의 전까지 응답 중심으로 둔다 | 팀장에게 Pre-Deployment Analysis 저장 테이블/컬럼 확인 |

gg는 반영된 선택 결과를 기준으로 `ResourceNode.config` key, 공통 API 응답 wrapper, Plan/Apply output shape, AI 결과 저장 여부를 구현 계획에 반영한다.

ck가 제안한 Plan/Apply output 최소 연결 기준:

```ts
type DeploymentStage = "validate" | "plan" | "apply";

type AiTerraformErrorExplanationInput = {
  stage: DeploymentStage;
  rawMessage: string;
  relatedResourceId?: string;
};
```

ys가 제안한 중요 AI activity event:

- `ai.architecture_draft_created`
- `ai.pre_deployment_check_completed`
- `ai.pre_deployment_check_failed`

## 5주 구현 순서

1. Week 1: jh의 Diagram JSON과 호환되는 Architecture Draft 계약, AI 분석 DTO 계약 확정
2. Week 2: GitHub 링크 기반 초안 생성과 Template fallback 구현
3. Week 3: 비용 추정, 리소스별 비용 분석, 위험도/보안 검증 rule engine 구현
4. Week 4: Terraform 코드 작성 보조, Terraform 오류 설명, Plan/Apply 입력 연동
5. Week 5: 발표/QA용 fallback fixture, 체크리스트, 비용/위험/오류 설명 샘플 고정

## 발표/QA 지원 범위

팀 전체 발표 시나리오는 팀 공통 결정이다. gg 파트 문서는 전체 발표 순서나 실제 Plan/Apply 노출 여부를 확정하지 않고, AI 파트가 제공할 수 있는 관찰 가능한 데모 단위와 fallback fixture만 정의한다.

AI 파트가 제공할 수 있는 데모 단위:

1. Source Repository 단서를 분석해 Architecture Draft를 제안한다.
2. 생성된 Resource와 추론 근거를 초보자 언어로 설명한다.
3. Pre-Deployment Check 결과로 비용 추정, 리소스별 비용 분석, 보안 위험, 체크리스트를 보여준다.
4. IaC Preview나 Terraform 코드에서 위험 지점과 누락된 설정을 설명한다.
5. Terraform validate, Plan, Apply 오류가 발생했을 때 원인 후보와 다음 행동을 설명한다.

팀 협의가 필요한 것:

- 위 데모 단위 중 무엇을 메인 발표 흐름에 넣을지
- 실제 Plan/Apply를 보여줄지, mock 실행이나 기록 화면으로 보여줄지
- 실패 상황을 메인 발표에 넣을지, QA나 예비 데모로 둘지
