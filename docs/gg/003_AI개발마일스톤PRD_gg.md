# AI 개발 마일스톤 PRD

> 대상: gg AI 파트 구현 브랜치 `feat/gg/12-ai-analyze`
> 연결 이슈: #12 `Feat: gg AI 분석 MVP 구현`

## 문제 정의

AWS 입문자는 Practice Architecture를 만들 때 어떤 Resource가 필요한지, 그 Resource가 왜 필요한지, 비용이나 Security Risk가 어디서 생기는지 한 번에 이해하기 어렵다.

팀 관점에서도 gg AI 파트가 먼저 안정적인 응답 계약을 제공하지 않으면, Architecture Board, Terraform 변환, Deployment 실행, 플랫폼 화면이 서로 다른 JSON 모양을 기대하게 될 수 있다. 그러면 연결 단계에서 `ResourceType`, `resourceId`, `ArchitectureJson`, 오류 설명 payload가 어긋난다.

또한 외부 LLM provider에 바로 의존하면 발표나 QA에서 API key 누락, timeout, rate limit, JSON 검증 실패 때문에 핵심 흐름이 흔들릴 수 있다. 따라서 MVP에서는 LLM이 모든 것을 자유롭게 생성하는 구조보다, deterministic fallback과 rule engine을 먼저 만들고 LLM은 설명과 보조 역할로 붙일 수 있는 구조가 필요하다.

## 해결 방향

gg AI 파트는 실제 AWS Apply를 수행하지 않는다. 대신 Practice Architecture를 기준으로 다음 세 가지를 안전하고 반복 가능한 API 응답으로 제공한다.

1. Architecture Draft
2. Pre-Deployment Check
3. Terraform 오류 설명

구현 순서는 shared type, API DTO/Zod validation, deterministic fallback, rule engine, 오류 설명, optional LLM adapter 순서로 둔다. 이렇게 해야 외부 LLM이 없어도 발표와 QA에서 최소 흐름이 동작한다.

## 마일스톤

### Milestone 1: AI 계약과 API 뼈대

목표:

- AI 응답 shared type을 정의한다.
- API 요청/응답 DTO와 Zod validation을 만든다.
- Fastify 앱에 AI route를 등록한다.
- 외부 LLM 없이도 고정 응답을 반환하는 최소 API를 만든다.

완료 기준:

- AI route가 앱에 등록되어 호출 가능하다.
- 잘못된 요청 JSON은 Zod validation에서 거절된다.
- 응답 타입은 `packages/types`의 shared type과 맞는다.
- route handler는 얇게 두고, 분석 로직은 별도 함수나 모듈로 분리할 수 있는 구조다.

우선 API 후보:

- `POST /api/ai/architecture-draft`
- `POST /api/ai/pre-deployment-check`
- `POST /api/ai/terraform-error-explanation`

### Milestone 2: Architecture Draft fallback

목표:

- 자연어 또는 Source Repository 단서를 입력받아 제한된 Architecture Draft를 반환한다.
- 결과는 Architecture Board가 열 수 있는 `ArchitectureJson`을 포함한다.
- 알 수 없는 입력은 억지로 생성하지 않고 template fallback 또는 수동 편집 안내로 처리한다.

MVP 대표 유형:

| 유형 | 입력 단서 | 반환할 주요 Resource |
| --- | --- | --- |
| 정적 웹사이트 | static build, frontend-only, 정적 export | S3, CloudFront |
| 단일 EC2 웹 서버 | Node server, Dockerfile, 단일 runtime port | VPC, Subnet, EC2, Security Group |
| API 서버 + DB | API server, database service, compose DB | VPC, Subnet, EC2, RDS, Security Group |

완료 기준:

- 같은 입력은 같은 Architecture Draft를 반환한다.
- `architectureJson.nodes`와 `architectureJson.edges`가 보드에서 열릴 수 있는 구조다.
- AI 전용 `resources`, `relationships` 같은 별도 그래프 구조를 만들지 않는다.
- `metadata`에는 source, confidence, assumptions, explanations를 담는다.

### Milestone 3: Pre-Deployment Check rule engine

목표:

- `ArchitectureJson`을 입력받아 비용, 보안, 설정 누락 Check Finding을 만든다.
- 결과는 summary, resource-level cost estimate, findings, checklist를 포함한다.
- AI는 Apply 가능 여부를 최종 결정하지 않고, 배포 전 판단 근거만 제공한다.

초기 규칙:

| 규칙 | category | severity | 설명 |
| --- | --- | --- | --- |
| SSH `0.0.0.0/0` 허용 | security | high | 누구나 SSH 접근을 시도할 수 있으므로 위험하다. |
| RDS 포함 | cost | medium | DB는 실습 중 비용이 커질 수 있다. |
| 필수 설정 누락 | configuration | medium | Resource 생성이나 설명에 필요한 값이 빠져 있다. |
| 삭제 계획 누락 | cost | medium | Practice Session 종료 후 비용이 남을 수 있다. |

완료 기준:

- Check Finding은 가능하면 `ArchitectureJson.nodes[].id`와 연결된다.
- checklist는 pass, warning, fail 중 하나의 상태를 가진다.
- 비용 추정은 실제 청구액 보장이 아니라 학습용 추정값임을 설명한다.
- rule engine 결과는 외부 LLM 없이 재현 가능하다.

### Milestone 4: Terraform 오류 설명

목표:

- Terraform validate, plan, apply 단계의 오류 원문을 받아 쉬운 설명을 반환한다.
- 사용자가 다음에 확인할 행동을 1-3개로 제한해 반환한다.
- 원문 로그는 보존하되, secret을 다시 노출하지 않는 방향을 유지한다.

분류할 오류 카테고리:

| category | 대표 단서 | 사용자에게 설명할 핵심 |
| --- | --- | --- |
| permission | `AccessDenied`, `UnauthorizedOperation`, `not authorized` | 현재 AWS 권한으로 작업할 수 없다. |
| credential | `NoCredentialProviders`, `InvalidClientTokenId`, `ExpiredToken` | 인증 정보가 없거나 만료되었다. |
| region_or_resource | `InvalidAMIID.NotFound`, `InvalidSubnetID.NotFound`, `not found` | region 또는 참조 Resource가 맞지 않을 수 있다. |
| quota | `VcpuLimitExceeded`, `LimitExceeded`, `quota` | 계정 한도 때문에 Resource를 만들 수 없다. |
| syntax | `Unsupported argument`, `Missing required argument` | Terraform 코드나 필수 값이 잘못되었다. |
| dependency | dependency cycle, subnet/VPC/security group 연결 오류 | Resource 연결 관계가 잘못되었을 수 있다. |
| unknown | 위 규칙에 걸리지 않음 | 자동 판단하지 않고 원문과 확인 지점을 보여준다. |

완료 기준:

- 입력 payload는 `{ stage, rawMessage, relatedResourceId? }` 형태를 따른다.
- `stage`는 `validate`, `plan`, `apply`만 우선 지원한다.
- `nextActions`는 1-3개로 제한한다.
- 분류 확신이 낮으면 억지로 원인을 단정하지 않고 `unknown`으로 둔다.

### Milestone 5: LLM adapter와 fallback 강화

목표:

- deterministic fallback이 먼저 동작한 뒤, OpenAI API 같은 LLM provider를 선택적으로 붙일 수 있게 한다.
- provider 실패, timeout, API key 누락, rate limit, JSON validation 실패 시 fallback 응답으로 돌아간다.
- LLM 응답은 그대로 신뢰하지 않고 shared type과 Zod schema를 통과한 결과만 제품 흐름에 반영한다.

완료 기준:

- 프론트엔드는 LLM provider를 직접 호출하지 않는다.
- OpenAI API key는 서버 환경변수로만 관리한다.
- LLM 호출 실패가 API 전체 실패로 이어지지 않는다.
- 테스트는 실제 LLM provider를 호출하지 않는다.

### Milestone 6: 팀원 연동과 QA 고정

목표:

- jh Architecture Board는 `architectureJson`과 `findings.resourceId`를 사용할 수 있어야 한다.
- sw Terraform 변환은 `ArchitectureJson`과 `ResourceNode.config`를 원천 입력으로 유지한다.
- ck Deployment 실행은 `stage`, `rawMessage`, `relatedResourceId`만으로 오류 설명을 호출할 수 있어야 한다.
- ys 플랫폼은 `AiAnalysisSummary`를 프로젝트 상세나 dashboard에서 선택적으로 소비할 수 있어야 한다.
- 발표/QA에서는 외부 LLM 없이도 fallback fixture로 핵심 흐름을 재현할 수 있어야 한다.

완료 기준:

- 대표 Architecture Draft fixture가 있다.
- 대표 Pre-Deployment Check fixture가 있다.
- 대표 Terraform 오류 설명 fixture가 있다.
- 팀원 파트가 필요한 JSON 필드를 문서와 코드에서 같은 이름으로 볼 수 있다.

## 사용자 이야기

1. AWS 입문자로서, 짧은 요청만으로 Architecture Draft를 받고 싶다. 그래야 구체적인 Practice Architecture에서 학습을 시작할 수 있다.
2. AWS 입문자로서, Architecture Draft가 Architecture Board에서 바로 열리길 원한다. 그래야 Resource 관계를 눈으로 확인할 수 있다.
3. AWS 입문자로서, 애매한 요청은 안전한 Template으로 fallback되길 원한다. 그래야 위험하거나 혼란스러운 설계를 받지 않는다.
4. AWS 입문자로서, 각 Resource에 쉬운 설명이 붙길 원한다. 그래야 왜 필요한 Resource인지 이해할 수 있다.
5. AWS 입문자로서, 배포 전 Cost Risk를 보고 싶다. 그래야 예상하지 못한 AWS 비용을 피할 수 있다.
6. AWS 입문자로서, 배포 전 Security Risk를 보고 싶다. 그래야 open SSH, public database access, public storage 같은 위험을 알아챌 수 있다.
7. AWS 입문자로서, 설정 누락 경고를 보고 싶다. 그래야 진행 전에 빠진 Resource 설정을 고칠 수 있다.
8. AWS 입문자로서, 배포 전 checklist를 받고 싶다. 그래야 복잡한 인프라 내용을 전부 읽지 않아도 중요한 항목을 확인할 수 있다.
9. AWS 입문자로서, Terraform 오류를 쉬운 말로 설명받고 싶다. 그래야 무엇이 실패했고 다음에 무엇을 해야 하는지 알 수 있다.
10. Architecture Board 개발자로서, AI Architecture Draft가 `ArchitectureJson`을 사용하길 원한다. 그래야 별도 변환 없이 보드에 그릴 수 있다.
11. Terraform 변환 개발자로서, AI가 `ArchitectureJson`을 원천 진실로 다루길 원한다. 그래야 Terraform 생성이 deterministic하게 유지된다.
12. Deployment 실행 개발자로서, Terraform 오류 설명 입력이 최소 payload이길 원한다. 그래야 로그를 masking한 뒤 안전하게 AI layer로 보낼 수 있다.
13. 플랫폼 개발자로서, AI 요약이 optional이길 원한다. 그래야 프로젝트 목록 API가 AI 저장 정책에 묶이지 않고 가볍게 유지된다.
14. 백엔드 개발자로서, AI route에 Zod validation이 있길 원한다. 그래야 잘못된 JSON이 analyzer 로직에 들어오기 전에 거절된다.
15. 발표자로서, 외부 provider 실패 없이도 AI 흐름이 동작하길 원한다. 그래야 데모가 안정적으로 진행된다.

## 구현 결정

- Practice Architecture 데이터의 원천 진실은 `nodes`와 `edges`를 가진 `ArchitectureJson`이다.
- AI는 별도 `resources`, `relationships` 같은 자체 그래프 구조를 만들지 않는다.
- AI 결과 metadata는 별도 객체 안에 둔다.
- AI route는 현재 Fastify route 등록 방식과 error handler 방식을 따른다.
- 기존 API route가 요청 경계에서 Zod를 사용하므로, AI API 요청 검증도 Zod를 사용한다.
- shared AI 응답 계약은 API와 프론트가 소비하기 전에 `packages/types`에 먼저 추가한다.
- 첫 route group은 Architecture Draft, Pre-Deployment Check, Terraform Error Explanation을 포함한다.
- Architecture Draft fallback은 정적 웹사이트, 단일 EC2 웹 서버, API 서버 + DB 세 가지 MVP 시나리오를 지원한다.
- Pre-Deployment Check는 LLM 판단만으로 만들지 않고 rule-based finding부터 만든다.
- 비용 추정은 학습용 추정값이며 실제 청구액 보장이 아니다.
- Terraform 오류 설명은 알려진 오류 패턴을 먼저 분류하고, 확신이 낮으면 `unknown`으로 fallback한다.
- LLM 연동은 optional로 두고 timeout, schema validation, fallback behavior 뒤에 둔다.
- AI layer는 Apply 가능 여부를 결정하지 않는다. 설명, finding, checklist 근거만 제공한다.

## 테스트 결정

- 가장 중요한 테스트 seam은 AI API contract seam이다.
- Fastify app instance를 만들고 AI endpoint를 호출한 뒤 status code와 response shape을 검증한다.
- 기존 API test가 app injection 방식을 사용하므로, AI API test도 별도 서버를 띄우지 않고 같은 방식을 따른다.
- rule engine은 `ArchitectureJson`을 넣었을 때 기대한 Check Finding과 checklist가 나오는지 외부 결과 기준으로 테스트한다.
- Terraform 오류 설명은 permission, credential, region_or_resource, quota, syntax, dependency, unknown 대표 raw message로 테스트한다.
- 테스트는 private helper 이름이나 내부 분기보다 사용자에게 보이는 동작과 계약 모양을 검증한다.
- LLM 연동이 같은 마일스톤에 포함되더라도 테스트는 실제 provider를 호출하지 않는다.

## 범위 밖

- 실제 AWS Apply 실행.
- 인프라 변경 경로로서의 Terraform CLI 실행.
- 장기 AWS credential 저장.
- private Source Repository OAuth 연동.
- README, package metadata, Dockerfile, compose file, 가벼운 framework hint를 넘어서는 전체 코드 분석.
- 첫 마일스톤에서 모든 AWS Resource 지원.
- 실제 청구 수준의 AWS Pricing API 정확도.
- deterministic validation 없이 바로 apply 가능한 AI-generated Terraform final code.
- 모든 AI 설명의 Deployment History 저장.
- Rollback engine, Auto Cleanup worker, GitOps, CI/CD 배포 자동화, community template 기능, chatbot UI.

## 추가 참고

- 이 PRD는 SketchCatch 제품 방향인 "AI assists deterministic architecture flow"를 따른다.
- 가장 안전한 구현 순서는 shared type, API validation, deterministic fallback, rule engine, error explanation, optional LLM adapter다.
- 초기 테스트 대상은 넓은 AWS coverage보다 안정적인 대표 예시 몇 개로 잡는다.
- 마일스톤 작업은 작은 commit 단위로 나누어 팀 Codex agent가 리뷰하고 재사용하기 쉽게 만든다.
