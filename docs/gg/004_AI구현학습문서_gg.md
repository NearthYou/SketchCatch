# AI 구현 학습 문서

이 문서는 지금까지 gg 파트에서 구현한 AI 기능을 공부하려고 만든 문서다.

최대한 쉽게 말하면, 지금 구현한 것은 **진짜 AI가 마음대로 설계하는 기능**이 아니다.

현재 구현은 이런 구조다.

1. 사용자가 요청을 보낸다.
2. 서버가 요청 모양을 확인한다.
3. 서버가 미리 정해둔 규칙으로 결과를 만든다.
4. 화면은 그 결과를 보여준다.

즉, 지금은 **안전한 연습용 AI fallback**이다.

외부 LLM이 연결되어 있지 않아도 팀 발표와 연결 테스트가 가능하게 만든 상태다.

## 먼저 알아야 하는 말

### JSON

JSON은 데이터를 주고받는 모양이다.

예를 들면 이런 식이다.

```json
{
  "name": "Backend Server",
  "type": "EC2"
}
```

### ArchitectureJson

`ArchitectureJson`은 그냥 아무 JSON이 아니다.

**아키텍처 보드가 열 수 있도록 약속한 설계도 JSON**이다.

크게 두 부분이 있다.

```json
{
  "nodes": [],
  "edges": []
}
```

`nodes`는 화면에 놓이는 리소스다.

예를 들면 `VPC`, `EC2`, `RDS`, `S3` 같은 것들이다.

`edges`는 리소스끼리 이어지는 선이다.

예를 들면 “EC2가 RDS에 연결된다” 같은 관계를 뜻한다.

### Finding

`finding`은 점검 결과에서 발견된 문제다.

예를 들면 이런 것들이다.

- SSH가 전체 인터넷에 열려 있음
- RDS라서 비용이 생길 수 있음
- EC2에 필요한 설정값이 빠짐

### Checklist

`checklist`는 배포 전에 확인해야 할 목록이다.

`finding`이 문제 하나하나라면, `checklist`는 사용자가 실제로 확인할 항목이다.

예를 들면 “SSH 전체 공개 여부 확인” 같은 문장이다.

### Fallback

`fallback`은 진짜 AI나 외부 API가 없어도 동작하게 만든 기본 응답이다.

지금 gg 파트는 이 fallback 방식으로 돌아간다.

그래서 인터넷이 안 되거나 OpenAI API Key가 없어도 기본 기능을 볼 수 있다.

### Guardrail

`guardrail`은 AI가 너무 마음대로 움직이지 못하게 막아주는 울타리다.

이번에 구현한 guardrail은 어려운 기능이 아니다.

사용자가 자연어만 쓰는 게 아니라, 버튼으로 몇 가지 조건을 같이 고르게 만든 것이다.

예를 들면 이런 조건이다.

- 어떤 종류를 만들지
- 예산은 낮게 볼지, 보통으로 볼지
- 트래픽은 작게 볼지, 보통으로 볼지
- 보안을 기본으로 볼지, 높게 볼지

이렇게 하면 AI가 문장을 이상하게 추측하는 일을 줄일 수 있다.

쉽게 말하면 이거다.

```text
자연어만 받기
=> AI가 추측을 많이 해야 함

자연어 + 선택지 같이 받기
=> AI가 정해진 선택지 안에서만 움직임
```

## 전체 구조

현재 AI 코드는 크게 세 군데에 있다.

```text
packages/types/src/index.ts
apps/api/src/routes/ai.ts
apps/api/src/services/ai*.ts
apps/web/app/workspace/AiWorkspaceClient.tsx
```

각각 역할이 다르다.

`packages/types/src/index.ts`는 팀끼리 같이 쓰는 데이터 이름표다.

예를 들면 `AiArchitectureDraftResult`, `CheckFinding`, `ChecklistItem` 같은 타입이 여기 있다.

`apps/api/src/routes/ai.ts`는 API 입구다.

프론트에서 요청이 오면 먼저 여기로 들어온다.

`apps/api/src/services/ai*.ts`는 실제 판단을 하는 곳이다.

자연어를 보고 초안을 고르거나, 비용/보안 규칙을 확인하거나, Terraform 오류를 쉬운 말로 바꾼다.

`apps/web/app/workspace/AiWorkspaceClient.tsx`는 팀에게 보여주기 위한 임시 화면이다.

최종 보드가 붙으면 이 화면은 없어지거나 바뀔 수 있다.

## 구현된 API

### 1. 자연어로 설계도 초안 만들기

API는 이것이다.

```text
POST /api/ai/architecture-draft
```

보내는 값은 이런 모양이다.

```json
{
  "prompt": "DB가 포함된 백엔드 API 서버를 만들고 싶어",
  "scenarioHint": "backend_with_db",
  "budgetLevel": "low",
  "trafficLevel": "small",
  "securityPriority": "basic"
}
```

예전에는 `prompt`만 보냈다.

이제는 `prompt`와 선택지를 같이 보낸다.

각 값은 이런 뜻이다.

```text
scenarioHint
=> 어떤 종류의 설계를 원하는지

budgetLevel
=> 비용을 얼마나 낮게 봐야 하는지

trafficLevel
=> 트래픽을 얼마나 크게 봐야 하는지

securityPriority
=> 보안을 얼마나 중요하게 봐야 하는지
```

`scenarioHint`는 네 가지 중 하나다.

```text
auto
=> 잘 모르겠음. 서버가 prompt를 보고 고름.

static_site
=> 정적 웹사이트

api_server
=> API 서버

backend_with_db
=> DB 포함 백엔드
```

중요한 규칙은 이것이다.

**사용자가 직접 고른 선택지는 자연어보다 우선한다.**

예를 들어 사용자가 문장에는 “DB 포함 백엔드”라고 썼는데, 선택지는 “정적 웹사이트”를 골랐다고 하자.

그러면 서버는 정적 웹사이트 초안을 만든다.

왜냐하면 버튼 선택이 더 명확한 의도라고 보기 때문이다.

`scenarioHint`가 `auto`일 때만 서버가 문장을 보고 셋 중 하나를 고른다.

```text
db / database / 데이터베이스 / rds / 백엔드
=> DB 포함 백엔드

api / 서버 / ec2
=> API 서버

그 외
=> 정적 웹사이트
```

잘못된 선택지 값이 오면 서버는 400으로 막는다.

예를 들어 `scenarioHint: "serverless_app"` 같은 값은 아직 지원하지 않으므로 받지 않는다.

코드는 여기서 볼 수 있다.

```text
packages/types/src/index.ts
apps/api/src/routes/ai.ts
apps/api/src/services/aiArchitectureDrafts.ts
```

중요한 함수는 `createArchitectureDraft`다.

이 함수는 자연어 문장을 받아서 `ArchitectureJson`을 돌려준다.

지금은 정확히 말하면 자연어 문장만 받는 게 아니라, 이런 요청 전체를 받는다.

```text
CreateArchitectureDraftRequest
```

이 타입은 `packages/types/src/index.ts`에 있다.

API에서 요청값을 확인하는 부분은 `apps/api/src/routes/ai.ts`에 있다.

실제로 어떤 초안을 고를지 정하는 부분은 `apps/api/src/services/aiArchitectureDrafts.ts`에 있다.

### 2. GitHub 링크로 설계도 초안 만들기

API는 이것이다.

```text
POST /api/ai/github-architecture-draft
```

보내는 값은 이런 모양이다.

```json
{
  "repositoryUrl": "https://github.com/owner/repo"
}
```

현재는 GitHub 전체 코드를 분석하지 않는다.

가볍게 아래 파일만 보려고 한다.

```text
README.md
package.json
Dockerfile
docker-compose.yml
```

그 파일들에서 읽은 글자를 다시 자연어 초안 만들기 함수에 넣는다.

그래서 GitHub 기능도 결국 `createArchitectureDraft` 흐름을 재사용한다.

코드는 여기서 볼 수 있다.

```text
apps/api/src/routes/ai.ts
apps/api/src/services/aiArchitectureDrafts.ts
```

중요한 점은 public GitHub URL만 받는다는 것이다.

`github.com/owner/repo` 모양이 아니면 막는다.

### 3. 배포 전 점검

API는 이것이다.

```text
POST /api/ai/pre-deployment-check
```

보내는 값은 이런 모양이다.

```json
{
  "architectureJson": {
    "nodes": [],
    "edges": []
  }
}
```

이 기능은 설계도 안의 리소스를 하나씩 보면서 문제를 찾는다.

현재 보는 것은 세 가지다.

```text
보안
비용
필수 설정값
```

전체 입구는 여기다.

```text
apps/api/src/services/aiPreDeploymentAnalysis.ts
```

보안 규칙은 여기다.

```text
apps/api/src/services/aiPreDeploymentSecurity.ts
```

현재 보안 규칙은 단순하다.

`SECURITY_GROUP` 안에 `ingress`가 있고, 그 안에 `port: 22`, `cidr: "0.0.0.0/0"`이 있으면 위험하다고 본다.

쉽게 말하면 SSH가 전 세계에 열린 상태를 잡는 것이다.

비용 규칙은 여기다.

```text
apps/api/src/services/aiPreDeploymentCost.ts
```

현재 비용 규칙은 `RDS`를 보면 비용 주의 finding을 만든다.

필수 설정값 규칙은 여기다.

```text
apps/api/src/services/aiPreDeploymentConfiguration.ts
```

예를 들면 `EC2`는 최소한 이런 값이 있어야 한다고 본다.

```text
instanceType
subnetId
securityGroupIds
```

값이 없으면 설정이 빠졌다는 finding을 만든다.

### 4. Terraform 오류 쉽게 설명하기

API는 이것이다.

```text
POST /api/ai/terraform-error-explanation
```

보내는 값은 이런 모양이다.

```json
{
  "stage": "plan",
  "rawMessage": "Error: AccessDenied: User is not authorized",
  "relatedResourceId": "ec2-web"
}
```

`stage`는 오류가 난 단계를 뜻한다.

현재 받는 값은 이것이다.

```text
validate
export
plan
apply
```

`rawMessage`는 Terraform 원본 오류 메시지다.

서버는 원본 오류 안에 특정 단어가 있는지 본다.

예를 들면 `AccessDenied`가 있으면 권한 문제로 본다.

현재 분류하는 오류는 이렇다.

```text
permission
credential
region_or_resource
quota
syntax
dependency
unknown
```

코드는 여기서 볼 수 있다.

```text
apps/api/src/services/aiTerraformErrorExplanation.ts
```

### 5. Terraform Preview 설명하기

API는 이것이다.

```text
POST /api/ai/terraform-preview-explanation
```

보내는 값은 이런 모양이다.

```json
{
  "terraformCode": "resource \"aws_instance\" \"web\" { ... }"
}
```

이 기능은 Terraform 코드를 완벽하게 해석하지 않는다.

현재는 문자열에 특정 Terraform resource 블록이 있는지 본다.

예를 들면 이런 문자열을 찾는다.

```text
resource "aws_instance"
resource "aws_db_instance"
resource "aws_s3_bucket"
resource "aws_security_group_rule"
```

찾으면 “이 코드는 EC2를 만든다”, “이 코드는 RDS를 만든다”처럼 설명한다.

그리고 Terraform 코드 안에 `0.0.0.0/0`, `from_port = 22`, `to_port = 22`가 같이 있으면 SSH 전체 공개 finding을 만든다.

코드는 여기서 볼 수 있다.

```text
apps/api/src/services/aiTerraformPreviewExplanation.ts
```

## 화면에서 버튼을 눌렀을 때 흐름

임시 화면 파일은 여기다.

```text
apps/web/app/workspace/AiWorkspaceClient.tsx
```

### 자연어 초안 생성 버튼

흐름은 이렇다.

```text
사용자 자연어 입력
=> 용도/예산/트래픽/보안 선택
=> /api/ai/architecture-draft 요청
=> ArchitectureJson 응답
=> 화면에 리소스 목록과 연결선 개수 표시
```

화면에서는 지금 이런 입력을 받는다.

```text
무엇을 만들고 싶나요?
[ DB가 포함된 백엔드 API 서버를 AWS에 배포하고 싶어. ]

용도 선택
[ 정적 웹사이트 ] [ API 서버 ] [ DB 포함 백엔드 ] [ 잘 모르겠음 ]

예산
[ 낮게 ] [ 보통 ]

트래픽
[ 작음 ] [ 보통 ]

보안 우선순위
[ 기본 ] [ 높음 ]
```

이 화면은 `apps/web/app/workspace/AiWorkspaceClient.tsx`에 있다.

버튼 스타일은 `apps/web/app/globals.css`에 있다.

중요한 점은 이 화면이 최종 보드 화면은 아니라는 것이다.

지금은 gg AI API가 실제로 어떻게 동작하는지 보여주는 임시 작업 화면이다.

### GitHub 초안 생성 버튼

흐름은 이렇다.

```text
GitHub URL 입력
=> /api/ai/github-architecture-draft 요청
=> README/package.json 등 일부 파일 근거 수집
=> ArchitectureJson 응답
=> 화면에 리소스 목록과 연결선 개수 표시
```

### 배포 전 점검 버튼

흐름은 이렇다.

```text
현재 draft의 ArchitectureJson 사용
=> /api/ai/pre-deployment-check 요청
=> 비용/보안/설정 finding 생성
=> checklist 생성
=> 화면에 요약과 문제 목록 표시
```

중요한 점은 배포 전 점검 버튼은 draft가 먼저 있어야 누를 수 있다.

왜냐하면 점검할 설계도, 즉 `ArchitectureJson`이 필요하기 때문이다.

### 코드 설명 생성 버튼

흐름은 이렇다.

```text
Terraform 코드 입력
=> /api/ai/terraform-preview-explanation 요청
=> 감지한 Terraform Resource 목록 생성
=> 보안/비용 finding 생성
=> 화면에 설명 표시
```

## 팀원 파트와 연결되는 부분

### jh 보드 파트와 연결되는 부분

jh 파트가 가장 중요하게 봐야 하는 값은 `ArchitectureJson`이다.

gg AI가 만든 초안은 결국 보드가 열 수 있어야 한다.

그래서 `nodes`와 `edges` 모양이 중요하다.

```text
nodes[].id
nodes[].type
nodes[].config
edges[].sourceId
edges[].targetId
```

그리고 finding의 `resourceId`는 `nodes[].id`와 맞아야 한다.

그래야 보드에서 특정 리소스에 경고 표시를 붙일 수 있다.

이번 guardrail 구현에서 jh가 추가로 알아야 하는 것은 이것이다.

`scenarioHint`가 무엇이든 최종 결과는 여전히 `ArchitectureJson`이다.

즉, 보드가 받는 설계도 모양은 바뀌지 않았다.

바뀐 것은 “초안을 고르는 입력 방식”이다.

### sw Terraform 파트와 연결되는 부분

sw 파트는 `ResourceNode.config`를 봐야 한다.

예를 들면 `EC2`에는 이런 값이 필요하다.

```text
instanceType
subnetId
securityGroupIds
```

gg 파트는 이 값이 빠졌는지 먼저 점검한다.

다만 Terraform 최종 코드를 만드는 책임은 sw 파트다.

gg 파트는 Terraform 코드를 최종 생성하지 않는다.

지금 gg 파트가 하는 것은 설명과 위험 점검이다.

### ck 배포 파트와 연결되는 부분

ck 파트는 Plan/Apply 중 오류가 나면 gg API에 오류 설명을 요청할 수 있다.

보내면 되는 최소값은 이것이다.

```json
{
  "stage": "plan",
  "rawMessage": "Terraform 원본 오류",
  "relatedResourceId": "문제가 난 리소스 id"
}
```

`relatedResourceId`는 없을 수도 있다.

gg 파트는 이 값을 받아서 쉬운 설명, 원인, 다음 행동을 돌려준다.

그리고 배포 전에는 `/api/ai/pre-deployment-check`를 먼저 호출할 수 있다.

이 결과에 위험 finding이 있으면 사용자가 확인하고 넘어가게 만들 수 있다.

### ys 플랫폼 파트와 연결되는 부분

ys 파트는 나중에 프로젝트 상세 화면이나 대시보드에서 AI 요약을 보여줄 수 있다.

현재 구현된 핵심 데이터는 이렇다.

```text
summary
findings
checklist
resourceCostEstimates
```

프로젝트 목록에 무조건 넣을 필요는 없다.

처음에는 프로젝트 상세 화면에서만 보여줘도 된다.

## 지금 구현의 한계

현재는 실제 LLM이 연결되어 있지 않다.

즉, ChatGPT 같은 모델이 자유롭게 생각해서 답하는 구조가 아니다.

현재는 정해둔 규칙과 템플릿으로만 동작한다.

그래서 좋은 점은 이렇다.

- 결과가 매번 거의 같다.
- 테스트하기 쉽다.
- 팀원 파트와 연결하기 쉽다.
- 위험한 Terraform을 AI가 마음대로 만들지 않는다.

아쉬운 점은 이렇다.

- 자연어 이해가 깊지 않다.
- GitHub 코드 분석이 얕다.
- 실제 AWS 가격 API를 쓰지 않는다.
- Terraform 문법을 완전하게 파싱하지 않는다.

이 한계는 나중에 고도화 단계에서 해결하면 된다.

## 테스트는 어디에 있나

테스트 파일은 여기다.

```text
apps/api/src/routes/ai.test.ts
```

이 테스트는 API를 직접 호출해본다.

확인하는 것은 이런 것들이다.

- 자연어 요청이 ArchitectureJson을 돌려주는지
- 빈 prompt를 막는지
- 선택지가 자연어 키워드보다 먼저 적용되는지
- 잘못된 선택지 값을 400으로 막는지
- GitHub가 아닌 URL을 막는지
- SSH 전체 공개를 위험으로 잡는지
- RDS 비용 finding이 나오는지
- Terraform 오류를 권한, 인증, region, quota, 문법, 의존성 문제로 나누는지
- Terraform Preview에서 Resource와 위험을 감지하는지

직접 돌리는 명령은 이렇다.

```bash
apps/api/node_modules/.bin/tsx --test apps/api/src/routes/ai.test.ts
```

API 타입체크는 이렇게 돌렸다.

```bash
node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json
```

## 공부할 때 추천 순서

처음부터 모든 파일을 보려고 하면 헷갈린다.

이 순서대로 보는 게 좋다.

1. `packages/types/src/index.ts`
2. `apps/api/src/routes/ai.ts`
3. `apps/api/src/services/aiArchitectureDrafts.ts`
4. `apps/api/src/services/aiPreDeploymentAnalysis.ts`
5. `apps/api/src/services/aiPreDeploymentSecurity.ts`
6. `apps/api/src/services/aiPreDeploymentCost.ts`
7. `apps/api/src/services/aiPreDeploymentConfiguration.ts`
8. `apps/api/src/services/aiTerraformErrorExplanation.ts`
9. `apps/api/src/services/aiTerraformPreviewExplanation.ts`
10. `apps/web/app/workspace/AiWorkspaceClient.tsx`

핵심은 하나다.

**gg AI 파트는 지금 “위험한 자동 실행 AI”가 아니라, 팀 기능을 연결하기 위한 안전한 설명/점검 API다.**

## 이번 guardrail 구현에서 꼭 기억할 것

이번에 만든 기능의 핵심은 아주 단순하다.

**자연어만 믿지 말고, 사용자가 고른 선택지를 같이 믿자.**

서버 입장에서 보면 흐름은 이렇다.

```text
1. 요청이 /api/ai/architecture-draft 로 들어온다.
2. apps/api/src/routes/ai.ts 에서 요청값을 검사한다.
3. scenarioHint, budgetLevel, trafficLevel, securityPriority 값이 맞는지 확인한다.
4. apps/api/src/services/aiArchitectureDrafts.ts 로 넘긴다.
5. scenarioHint가 auto가 아니면 그 선택지를 먼저 따른다.
6. scenarioHint가 auto면 prompt 안의 키워드를 보고 고른다.
7. 예산/트래픽/보안 선택지는 metadata.assumptions에 설명으로 붙인다.
8. 최종 결과로 ArchitectureJson을 반환한다.
```

프론트 입장에서 보면 흐름은 이렇다.

```text
1. 사용자가 자연어를 쓴다.
2. 사용자가 용도/예산/트래픽/보안을 버튼으로 고른다.
3. 자연어 초안 생성 버튼을 누른다.
4. 프론트가 선택지까지 같이 API에 보낸다.
5. 서버가 ArchitectureJson을 돌려준다.
6. 화면이 결과를 보여준다.
```

그래서 이번 구현은 “AI가 더 똑똑해진 것”이 아니다.

오히려 반대다.

**AI가 덜 마음대로 움직이게 만든 것**이다.

MVP에서는 이게 더 안전하다.
