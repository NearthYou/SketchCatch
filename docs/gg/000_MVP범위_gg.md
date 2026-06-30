# gg AI 파트 1차 제공 범위

이 문서는 gg가 1차 구현에서 무엇을 만들고, 무엇을 만들지 않을지 정리한 문서다.

어렵게 말하면 안 된다. 핵심은 이거다.

> 사용자가 원하는 서버 구조를 말하면, AI가 AWS 설계 초안을 만들고, 그 설계의 비용/보안/위험을 쉽게 설명한다.

## 1. gg 파트가 하는 일

gg AI 파트는 크게 5가지를 한다.

1. 자연어 입력을 읽고 설계 초안 만들기
2. 설계 초안을 보드가 열 수 있는 JSON으로 반환하기
3. 설계의 비용, 보안, 설정 위험을 찾기
4. Terraform 코드나 오류를 쉬운 말로 설명하기
5. 사용자가 고치면 좋은 부분을 설명하기

여기서 말하는 JSON은 `ArchitectureJson`이다.

쉽게 말하면:

```text
ArchitectureJson
= 보드에 그릴 수 있는 설계도 데이터
= 리소스 목록 + 연결선 목록
```

## 2. gg 파트가 하지 않는 일

AI가 다 알아서 배포까지 하면 위험하다.

그래서 gg는 아래 일을 하지 않는다.

- 실제 AWS 배포
- Terraform apply 실행
- AWS Access Key 저장
- AWS 권한 변경
- Terraform 최종 코드를 마음대로 생성하고 바로 실행
- "이 구성이 정답입니다"라고 단정

gg는 **설명과 분석**을 맡는다.

실제 배포 실행은 ck 파트다.
Terraform 생성은 sw 파트다.
보드 화면은 jh 파트다.
프로젝트/사용자 관리는 ys 파트다.

## 3. 자연어 설계 초안

사용자는 이런 식으로 입력한다.

```text
DB가 포함된 백엔드 API 서버를 만들고 싶어요.
```

그리고 선택값도 같이 보낸다.

```ts
type CreateArchitectureDraftRequest = {
  prompt: string;
  scenarioHint: "auto" | "static_site" | "api_server" | "backend_with_db" | "server_storage";
  budgetLevel: "low" | "normal";
  trafficLevel: "small" | "normal";
  securityPriority: "basic" | "high";
};
```

화면에서는 이렇게 보이면 된다.

```text
무엇을 만들고 싶나요?
[ DB가 포함된 백엔드 API 서버를 만들고 싶어요 ]

용도 선택
[ 정적 웹사이트 ] [ API 서버 ] [ 서버+스토리지 ] [ DB 포함 백엔드 ] [ 잘 모르겠음 ]

예산
[ 낮게 ] [ 보통 ]

트래픽
[ 작음 ] [ 보통 ]

보안 우선순위
[ 기본 ] [ 높음 ]
```

## 4. 지원하는 설계 종류

1차 구현에서는 모든 AWS 구조를 만들지 않는다.

지원하는 것은 이 정도다.

| 사용자가 원하는 것 | 만드는 초안 |
| --- | --- |
| 정적 웹사이트 | S3 + CloudFront |
| API 서버 | VPC + Subnet + EC2 + Security Group |
| 서버+스토리지 | VPC + Subnet + Internet Gateway + Route Table + Security Group + EC2 + S3 |
| DB 포함 백엔드 | VPC + Subnet + EC2 + RDS + Security Group |

지원하지 않는 말이 들어오면 실패시키지 않는다.

대신 가까운 기본 초안을 만들고, 설명에 이렇게 남긴다.

```text
이 요구사항은 MVP 자동 초안 범위를 벗어납니다.
기본 설계 초안으로 시작하고, 자세한 부분은 보드에서 수정하세요.
```

## 5. auto 선택 방식

사용자가 "잘 모르겠음"을 고르면 `scenarioHint`는 `"auto"`다.

이때 AI는 자연어 안의 단서를 보고 점수를 매긴다.

예:

- `db`, `database`, `rds`, `데이터베이스`가 있으면 DB 포함 백엔드 점수 증가
- `s3`, `스토리지`, `bucket`, `버킷`, `파일`, `업로드`가 있으면 서버+스토리지 점수 증가
- `api`, `서버`, `ec2`, `express`, `spring`이 있으면 API 서버 점수 증가
- `정적`, `웹사이트`, `frontend`, `react`, `next`가 있으면 정적 웹사이트 점수 증가

점수가 가장 높은 것을 고른다.

API 서버 단서와 스토리지 단서가 같이 있으면 서버+스토리지 초안을 우선한다.

점수가 모두 0이면 정적 웹사이트 기본 초안으로 시작한다.

## 6. 사용자가 직접 고른 값이 우선

사용자가 버튼으로 "DB 포함 백엔드"를 골랐는데 문장에는 "정적 웹사이트"라고 쓸 수도 있다.

이 경우에는 버튼 선택을 우선한다.

```text
선택한 용도: DB 포함 백엔드
입력 문장: 정적 웹사이트 만들고 싶어요
결과: DB 포함 백엔드 초안 생성
```

대신 설명에는 충돌을 알려준다.

```text
입력 문장과 선택한 용도가 다릅니다.
선택한 용도를 우선해서 초안을 만들었습니다.
```

## 7. 리소스 id 규칙

각 리소스에는 id가 필요하다.

이 id는 경고나 비용 분석이 특정 리소스를 가리킬 때 쓴다.

예:

```text
ec2-api
rds-primary
vpc-main
sg-api
```

규칙은 이거다.

```text
리소스 종류 + 역할
```

예:

- API 서버 EC2 → `ec2-api`
- 기본 DB RDS → `rds-primary`
- 메인 VPC → `vpc-main`
- 서버+스토리지 EC2 → `ec2-instance`
- 서버+스토리지 S3 → `s3-bucket`
- 서버+스토리지 Route Table → `route-table`

랜덤 id는 쓰지 않는다.

## 8. 응답 형태

AI 초안 응답은 이렇게 생긴다.

```ts
type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
};
```

중요한 건 `architectureJson`이다.

보드는 이 값만 있어도 열릴 수 있어야 한다.

`metadata`는 설명용이다.

metadata에는 이런 내용을 넣는다.

- 어떤 용도를 골랐는지
- auto일 때 점수가 어땠는지
- 왜 이 리소스를 골랐는지
- 지원하지 않는 요구사항이 있었는지
- fallback이 있었는지

예:

```ts
type AiResultMetadata = {
  source: "prompt" | "github" | "template_fallback" | "llm_fallback";
  confidence: "low" | "medium" | "high";
  assumptions: string[];
  explanations: string[];
  selectedScenario?: "static_site" | "api_server" | "backend_with_db" | "server_storage";
  scenarioScores?: {
    scenario: "static_site" | "api_server" | "backend_with_db" | "server_storage";
    score: number;
    reasons: string[];
  }[];
  guardrailWarnings?: {
    code: string;
    message: string;
  }[];
};
```

## 9. 비용/보안 점검

AI는 설계 초안을 보고 위험한 부분을 찾는다.

예:

- EC2 SSH가 전체 공개되어 있음
- RDS 비용이 커질 수 있음
- DB가 공개 접근될 수 있음
- 필수 설정이 빠져 있음
- 정리 계획이 없어서 비용이 남을 수 있음

결과는 `findings`와 `checklist`로 준다.

쉽게 말하면:

```text
finding = 발견한 문제
checklist = 배포 전 확인할 항목
```

AI는 "배포 가능/불가능"을 최종 판정하지 않는다.

AI는 판단 근거만 준다.

## 10. Terraform 설명

Terraform 코드를 실제로 실행하는 것은 gg 일이 아니다.

gg는 Terraform 코드나 오류 메시지를 읽고 쉽게 설명한다.

예:

```text
원문 오류:
AccessDenied

쉬운 설명:
현재 AWS 권한으로 이 작업을 할 수 없습니다.
```

`terraform validate` 실행은 sw 또는 ck 쪽에 가깝다.

gg는 validate 결과로 나온 오류를 설명할 수 있다.

## 11. GitHub 링크는 핵심이 아님

GitHub 링크만 보고 "정답 인프라"를 맞히는 것은 위험하다.

같은 코드도 EC2, ECS, Lambda, Kubernetes 등 여러 방식으로 배포할 수 있다.

그래서 GitHub 링크는 1차 핵심이 아니다.

1차에서는 README, package metadata, Dockerfile 정도를 참고 자료로만 볼 수 있다.

## 12. 팀원과 연결되는 부분

| 파트 | gg가 맞춰야 하는 것 |
| --- | --- |
| jh | `ArchitectureJson`을 보드에서 열 수 있게 만들기 |
| sw | Terraform 생성 원천을 `ArchitectureJson`으로 유지하기 |
| ck | 오류 설명 입력을 `{ stage, rawMessage, relatedResourceId? }`로 받기 |
| ys | 프로젝트 목록에 AI 상세 결과를 강제로 넣지 않기 |
| 팀장 | shared type과 공통 API 규칙을 따르기 |

## 13. 테스트 기준

테스트는 실제 LLM을 부르지 않는다.

테스트는 이런 걸 확인한다.

- API가 새 입력값을 받는지
- auto 선택이 점수로 동작하는지
- 지원하지 않는 요구사항이 warning으로 남는지
- 결과가 `ArchitectureJson`인지
- metadata에 이유와 warning이 들어가는지
- 외부 provider 없이 fallback으로 동작하는지

## 14. 한 줄 요약

gg AI 파트는 사용자의 요구사항을 안전한 설계 초안으로 바꾸고, 그 설계가 왜 나왔는지와 어떤 위험이 있는지 쉽게 설명한다.
