# AI 작업 공유 발표 스크립트

## 목적

이 문서는 gg AI 브랜치에서 현재 만들어진 구현물을 팀원에게 설명하기 위한 공유용 스크립트다.

별도 장표를 쓰지 않고, 실제 `/workspace` 화면과 API 흐름을 보면서 설명하는 것을 기준으로 한다.

## 발표 전 준비

로컬 서버를 켜고 아래 화면을 연다.

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api dev
npm exec --package=pnpm@11.8.0 -- pnpm --dir apps/web exec next dev --port 3000
```

확인할 주소:

- Web: `http://localhost:3000/workspace`
- API health: `http://127.0.0.1:4000/health`

발표 전에 버튼 세 개를 직접 눌러본다.

1. `자연어 초안 생성`
2. `배포 전 점검`
3. `코드 설명 생성`

## 전체 공유 시나리오

### 1. 오프닝

말할 내용:

이번 브랜치에서 내가 만든 것은 “AI가 모든 걸 알아서 하는 기능”이 아니다.

현재 만든 것은 팀원 기능과 연결할 수 있는 AI 보조 API와 확인용 `/workspace` 화면이다.

핵심 원칙은 하나다.

AI는 실제 배포 판단이나 Terraform 최종 생성을 마음대로 하지 않는다. 코드가 만든 구조와 룰 기반 점검 결과를 초보자가 이해할 수 있게 설명하는 역할을 한다.

### 2. `/workspace` 화면 보여주기

화면에서 보여줄 것:

- 왼쪽 위 `Architecture Draft`
- 오른쪽 위 `Draft 결과`
- 왼쪽 아래 `비용/보안 점검`
- 오른쪽 아래 `Terraform Preview 설명`

말할 내용:

이 화면은 최종 서비스 화면이라기보다, gg AI 파트가 어떤 데이터를 만들고 어떤 응답을 주는지 확인하기 위한 작업대다.

여기서 중요한 것은 UI 디자인이 아니라 데이터 흐름이다.

자연어가 들어오면 Architecture Draft가 나오고, 그 결과를 가지고 배포 전 점검을 실행할 수 있다.

Terraform 코드도 넣으면 어떤 Resource를 만드는지, 위험한 설정이 있는지 설명을 받을 수 있다.

### 3. 자연어 → Architecture Draft 데모

실행:

`자연어 요청`에 아래 문장을 넣고 `자연어 초안 생성`을 누른다.

```text
DB가 포함된 백엔드 API 서버를 AWS에 배포하고 싶어.
```

말할 내용:

이 버튼은 `/api/ai/architecture-draft`를 호출한다.

응답은 긴 설명문이 아니라 `ArchitectureJson` 중심이다.

`ArchitectureJson`은 Architecture Board가 열 수 있는 설계도 JSON이다. 여기에는 `nodes`와 `edges`가 있다.

현재 예시에서는 VPC, Subnet, EC2, RDS, Security Group 같은 Resource 노드가 만들어진다.

여기서 jh 보드 파트가 봐야 할 핵심은 “AI가 만든 결과를 보드에서 열 수 있느냐”다.

### 4. 배포 전 점검 데모

실행:

Draft 결과가 나온 상태에서 `배포 전 점검`을 누른다.

말할 내용:

이 버튼은 `/api/ai/pre-deployment-check`를 호출한다.

입력은 방금 만든 `ArchitectureJson`이다.

응답은 `summary`, `totalMonthlyEstimate`, `resourceCostEstimates`, `findings`, `checklist`로 온다.

여기서 중요한 것은 `findings`다.

예를 들어 RDS가 있으면 월 비용이 생길 수 있고, Security Group에 SSH가 `0.0.0.0/0`으로 열려 있으면 보안 위험으로 잡을 수 있다.

AI가 위험을 마음대로 상상하는 게 아니라, 룰 기반 점검 결과를 만들고 그걸 사람이 이해하기 쉽게 보여주는 흐름이다.

### 5. Terraform Preview 설명 데모

실행:

오른쪽 아래 Terraform 코드 영역에서 `코드 설명 생성`을 누른다.

말할 내용:

이 버튼은 `/api/ai/terraform-preview-explanation`을 호출한다.

여기서 AI는 Terraform 최종본을 생성해서 배포하는 게 아니다.

이미 있는 IaC Preview 또는 Terraform 코드가 무엇을 만들고, 위험한 설정이 있는지를 설명한다.

예를 들어 `aws_instance`가 있으면 EC2 Instance를 만든다고 설명하고, `aws_security_group_rule`에서 SSH가 전체 공개로 열려 있으면 보안 finding을 붙인다.

이 부분은 sw Terraform 변환 파트와 연결된다.

sw가 만든 IaC Preview를 gg AI API에 넘기면, 사용자가 이해할 수 있는 설명을 붙일 수 있다.

### 6. Terraform 오류 설명은 화면에는 아직 없다고 말하기

말할 내용:

현재 `/workspace` 화면에는 Terraform 오류 설명 버튼은 아직 따로 없다.

하지만 API는 만들어져 있다.

endpoint는 `/api/ai/terraform-error-explanation`이다.

ck 배포 파트에서 Plan이나 Apply 실패가 나면 아래처럼 넘기면 된다.

```ts
{
  stage: "plan",
  rawMessage: "AccessDenied: ...",
  relatedResourceId: "backend-server"
}
```

그러면 AI는 권한 문제인지, region 문제인지, quota 문제인지, 문법 문제인지 분류해서 초보자용 설명과 다음 행동을 반환한다.

### 7. GitHub 링크 기반 초안은 어떻게 설명할지

말할 내용:

GitHub 링크 기반 초안도 API와 화면 입력은 준비돼 있다.

endpoint는 `/api/ai/github-architecture-draft`다.

MVP에서는 전체 코드를 분석하지 않는다.

대상은 public Source Repository이고, README, package metadata, Dockerfile, docker-compose file 정도만 evidence로 사용한다.

이유는 속도와 안정성 때문이다.

전체 코드를 LLM에게 다 던지면 비용도 커지고, 틀릴 가능성도 커지고, 민감한 코드 처리 문제가 생긴다.

그래서 지금은 “초안 생성용 힌트” 정도로만 쓴다.

## 팀원별 연결 설명 시나리오

### jh에게 설명할 시나리오: Architecture Board 연결

jh에게 말할 핵심:

jh 파트는 AI 전체를 몰라도 된다.

보드가 받아야 하는 핵심 입력은 `ArchitectureJson`이다.

```ts
type ArchitectureJson = {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
};
```

`ResourceNode`는 이렇게 생겼다.

```ts
type ResourceNode = {
  id: string;
  type: ResourceType;
  label?: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
};
```

`ResourceEdge`는 이렇게 생겼다.

```ts
type ResourceEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
};
```

jh가 확인해야 할 것:

- `nodes[].id`를 보드 노드의 고유 id로 쓴다.
- `edges[].sourceId`, `edges[].targetId`가 `nodes[].id`를 가리킨다.
- `ResourceType` 문자열은 공통 타입을 따른다.
- AI finding이 특정 Resource에 붙을 때는 `CheckFinding.resourceId`가 `ResourceNode.id`와 같아야 한다.

말할 예시:

“AI가 EC2에 대한 보안 경고를 만들면, 그 finding에는 `resourceId: "backend-server"`가 들어가. 보드는 그 id를 가진 노드에 경고 뱃지나 표시를 붙이면 돼.”

### sw에게 설명할 시나리오: Terraform 변환 연결

sw에게 말할 핵심:

Terraform 생성의 원천은 AI 응답 문자열이 아니라 `ArchitectureJson`이어야 한다.

AI가 Terraform 최종본을 자유롭게 생성하면 위험하다.

sw 파트는 `ArchitectureJson -> Terraform 코드`를 deterministic하게 만들고, gg AI는 그 결과를 설명하는 쪽을 맡는다.

연결 API:

```text
POST /api/ai/terraform-preview-explanation
```

입력:

```ts
{
  terraformCode: string;
}
```

응답:

```ts
type AiTerraformPreviewExplanationResult = {
  summary: string;
  detectedResources: AiTerraformDetectedResource[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
};
```

sw가 확인해야 할 것:

- IaC Preview 문자열을 API에 넘길 수 있어야 한다.
- 가능하면 Terraform Resource와 ArchitectureJson node id 매핑을 유지해야 한다.
- AI 설명은 deployable Terraform의 원천이 아니다.
- AI finding은 사용자가 검토할 보조 정보다.

말할 예시:

“sw가 만든 Terraform Preview를 내가 만든 API에 넘기면, 사용자는 이 코드가 EC2를 만들고, RDS 비용이 생기고, SSH가 열려 있으면 위험하다는 설명을 볼 수 있어.”

### ck에게 설명할 시나리오: Plan/Apply 오류 설명 연결

ck에게 말할 핵심:

배포 실행 파트에서 Plan이나 Apply 실패가 나면, 전체 로그를 AI에게 다 보내지 않아도 된다.

MVP에서는 최소 입력만 넘긴다.

연결 API:

```text
POST /api/ai/terraform-error-explanation
```

입력:

```ts
type AiTerraformStage = "validate" | "plan" | "apply";

{
  stage: AiTerraformStage;
  rawMessage: string;
  relatedResourceId?: string;
}
```

응답:

```ts
type AiTerraformErrorExplanationResult = {
  stage: AiTerraformStage;
  category: AiTerraformErrorCategory;
  severity: RiskLevel;
  rawMessage: string;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  relatedResourceId?: string;
};
```

ck가 확인해야 할 것:

- AI에 넘기기 전에 secret이나 credential은 마스킹해야 한다.
- `stage`는 우선 `validate`, `plan`, `apply`만 쓴다.
- 전체 deployment history 저장은 ck 파트가 맡고, AI 설명은 stateless response로 받는다.
- `relatedResourceId`가 있으면 보드나 결과 화면에서 해당 Resource와 연결할 수 있다.

말할 예시:

“Apply 실패 로그를 통째로 저장하고 AI에게 다 던지는 게 아니라, 사용자가 이해해야 하는 핵심 오류 메시지만 넘기면 돼. 그러면 AI가 ‘권한 부족입니다. IAM 권한을 확인하세요’처럼 바꿔준다.”

### ys에게 설명할 시나리오: 프로젝트/플랫폼 연결

ys에게 말할 핵심:

프로젝트 목록은 가볍게 유지하는 게 좋다.

AI 분석 결과는 프로젝트 목록보다 프로젝트 상세, 작업 화면, 프로젝트 확인 보드 쪽에 보여주는 게 맞다.

ys가 볼 수 있는 요약 타입 방향:

```ts
type AiAnalysisSummary = {
  status: "not_analyzed" | "completed" | "warning" | "failed";
  highestSeverity: RiskLevel | null;
  findingCount: number;
  estimatedMonthlyCost: MoneyEstimate | null;
  summary: string;
  updatedAt: IsoDateTimeString;
};
```

현재 코드에 직접 추가된 핵심 타입은 아래다.

```ts
type CheckFinding = {
  id: string;
  category: "cost" | "security" | "configuration" | "permission";
  severity: "low" | "medium" | "high";
  resourceId?: string;
  title: string;
  description: string;
  recommendation: string;
};
```

ys가 확인해야 할 것:

- 프로젝트 목록 API에 AI 상세 결과를 억지로 넣지 않는다.
- 프로젝트 상세나 dashboard API에서 AI 요약을 optional로 보여주는 쪽이 좋다.
- 활동 내역에는 모든 AI 요청을 남기지 말고 중요한 이벤트만 남긴다.
- 예: Architecture Draft 생성, Pre-Deployment Check 완료, Pre-Deployment Check 실패.

말할 예시:

“프로젝트 목록에 AI 결과를 다 붙이면 목록 API가 무거워져. 대신 프로젝트 상세에 들어갔을 때 ‘위험 high 1개, 예상 비용 얼마, 체크리스트 몇 개’처럼 보여주면 된다.”

### 팀장 또는 공통 계약 담당에게 설명할 시나리오

말할 핵심:

현재 gg AI API는 공통 타입을 `packages/types`에 뒀다.

다만 공통 API wrapper 형식이 팀 전체에 확정되어 있지 않으면, AI API만 독자 wrapper를 만들지 않는 게 좋다.

확인해야 할 것:

- API 응답 wrapper를 팀장이 정하면 AI route도 맞춘다.
- `ResourceType` 확장 목록을 팀 공통으로 인정해야 한다.
- `ArchitectureJson`은 보드와 Terraform 변환의 공통 기준으로 유지해야 한다.
- AI 결과 저장 여부는 MVP에서는 stateless response가 기본이다.

말할 예시:

“AI 분석 결과를 DB에 무조건 저장하면 prompt/output 보안, 버전 관리, 오래된 분석 결과 처리 문제가 생겨. 지금은 요청하면 바로 응답하는 stateless 구조로 두고, 저장은 팀 공통 정책이 정해지면 붙이는 게 안전하다.”

## 꼭 설명해야 할 데이터 타입 요약

### ArchitectureJson

가장 중요한 공통 계약이다.

사용처:

- jh: Architecture Board 표시
- sw: Terraform 생성 원천
- gg: Architecture Draft 생성과 Pre-Deployment Check 입력
- ys: 프로젝트 상세나 저장된 Architecture Snapshot 표시

핵심:

```ts
type ArchitectureJson = {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
};
```

### ResourceType

Resource 종류 문자열이다.

현재 포함:

```ts
"VPC" | "SUBNET" | "EC2" | "RDS" | "S3" | "SECURITY_GROUP" | "CLOUDFRONT" | "LAMBDA" | "UNKNOWN"
```

주의:

팀원마다 `SecurityGroup`, `security_group`, `SECURITY_GROUP`처럼 다르게 쓰면 연결이 깨진다.

### AiArchitectureDraftResult

자연어 또는 Source Repository 초안 생성 결과다.

사용처:

- gg API 응답
- web `/workspace` Draft 결과 표시
- jh 보드 연결 후보

핵심:

```ts
type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
};
```

### AiPreDeploymentAnalysisResult

배포 전 비용/보안/설정 점검 결과다.

사용처:

- gg Pre-Deployment Check API 응답
- ys 프로젝트 상세 요약 후보
- jh 보드 finding 표시 후보
- ck Apply 승인 전 차단 기준 후보

핵심:

```ts
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

### CheckFinding

비용, 보안, 설정, 권한 문제 하나를 표현하는 타입이다.

사용처:

- 보드 노드 경고
- 프로젝트 상세 위험 요약
- Apply 전 승인 차단
- 초보자 설명 문구

핵심:

```ts
type CheckFinding = {
  id: string;
  category: "cost" | "security" | "configuration" | "permission";
  severity: "low" | "medium" | "high";
  resourceId?: string;
  title: string;
  description: string;
  recommendation: string;
};
```

주의:

`resourceId`가 있으면 `ArchitectureJson.nodes[].id`와 연결해야 한다.

### ChecklistItem

배포 전 확인할 항목이다.

사용처:

- Pre-Deployment Check 결과 화면
- Apply 전 사용자 확인 화면

핵심:

```ts
type ChecklistItem = {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  relatedFindingIds: string[];
};
```

### AiTerraformErrorExplanationResult

Terraform validate, plan, apply 오류 설명 결과다.

사용처:

- ck 배포 실패 화면
- 사용자용 오류 설명
- 다음 행동 안내

핵심:

```ts
type AiTerraformErrorExplanationResult = {
  stage: "validate" | "plan" | "apply";
  category: AiTerraformErrorCategory;
  severity: RiskLevel;
  rawMessage: string;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  relatedResourceId?: string;
};
```

주의:

`rawMessage`는 AI 호출 전에 secret masking이 끝난 값이어야 한다.

### AiTerraformPreviewExplanationResult

IaC Preview가 무엇을 만드는지 설명하는 결과다.

사용처:

- sw Terraform Preview 화면
- gg AI 설명 패널
- 사용자가 배포 전 Terraform 코드를 이해하는 흐름

핵심:

```ts
type AiTerraformPreviewExplanationResult = {
  summary: string;
  detectedResources: AiTerraformDetectedResource[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
};
```

## 회의에서 그대로 말할 짧은 버전

이번 브랜치에서 gg AI 파트는 실제로 눌러볼 수 있는 API와 `/workspace` 확인 화면을 만들었다.

자연어 또는 Source Repository URL을 넣으면 Architecture Draft가 나오고, 그 결과는 `ArchitectureJson`으로 온다.

이 `ArchitectureJson`은 jh 보드, sw Terraform 변환, gg Pre-Deployment Check가 같이 보는 중심 데이터다.

배포 전 점검은 비용, 보안, 설정 문제를 `CheckFinding`과 `ChecklistItem`으로 반환한다.

Terraform Preview 설명은 sw가 만든 IaC Preview를 사용자가 이해할 수 있게 바꿔준다.

Terraform 오류 설명은 ck가 Plan/Apply 실패 메시지를 넘기면 원인과 다음 행동을 쉬운 말로 반환한다.

ys는 프로젝트 목록에 AI 결과를 다 넣기보다는 프로젝트 상세나 작업 화면에서 AI 요약을 보여주는 방향이 좋다.

중요한 원칙은 AI가 실제 배포 판단을 하지 않는다는 것이다.

AI는 안전한 보조 계층이고, 생성과 검증의 기준은 공통 타입과 deterministic code에 둔다.

## 팀원에게 마지막으로 요청할 것

jh:

`ArchitectureJson.nodes`, `ArchitectureJson.edges`, `CheckFinding.resourceId` 연결이 보드에서 가능한지 확인해달라.

sw:

Terraform 생성 원천을 `ArchitectureJson`으로 두고, 생성된 IaC Preview 문자열을 AI 설명 API에 넘길 수 있는지 확인해달라.

ck:

Plan/Apply 오류 설명 API에 넘길 payload를 `{ stage, rawMessage, relatedResourceId? }`로 맞출 수 있는지 확인해달라.

ys:

AI 요약을 프로젝트 목록이 아니라 프로젝트 상세나 작업 화면에 optional로 붙이는 흐름이 가능한지 확인해달라.
