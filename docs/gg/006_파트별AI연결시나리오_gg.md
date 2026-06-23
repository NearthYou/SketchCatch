# 파트별 AI 연결 시나리오

## 목적

이 문서는 gg AI 파트와 다른 팀원 파트가 연결되는 지점을 설명하기 위한 별도 공유 문서다.

읽는 사람:

- jh: Architecture Board
- sw: Terraform 변환
- ck: 배포 실행
- ys: 플랫폼/프로젝트
- 팀장 또는 공통 계약 담당

핵심 원칙:

AI는 실제 배포 판단, Terraform 최종 생성, AWS credential 처리를 대신하지 않는다.

AI는 공통 타입으로 정리된 데이터와 룰 기반 점검 결과를 초보자가 이해할 수 있게 설명하는 보조 계층이다.

## 전체 연결 그림

```text
자연어 / Source Repository
  -> gg AI Architecture Draft
  -> ArchitectureJson
  -> jh Architecture Board
  -> sw Terraform Preview
  -> gg AI Terraform Preview 설명
  -> ck Plan / Apply
  -> gg AI 오류 설명
  -> ys 프로젝트 상세 / 작업 화면 요약
```

중심 데이터는 `ArchitectureJson`이다.

보드, Terraform 변환, 배포 전 점검이 모두 같은 `ArchitectureJson`을 기준으로 맞춰야 한다.

## jh 연결 시나리오: Architecture Board

### jh에게 말할 핵심

jh 파트는 AI 전체를 몰라도 된다.

보드가 받아야 하는 핵심 입력은 `ArchitectureJson`이다.

AI가 만든 결과도 말이나 Markdown이 아니라 `ArchitectureJson`으로 온다.

### 확인해야 할 타입

```ts
type ArchitectureJson = {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
};

type ResourceNode = {
  id: string;
  type: ResourceType;
  label?: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
};

type ResourceEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
};
```

### jh가 맞춰야 할 것

- `nodes[].id`를 보드 노드의 고유 id로 쓴다.
- `edges[].sourceId`, `edges[].targetId`가 `nodes[].id`를 가리킨다.
- `ResourceType` 문자열은 공통 타입을 따른다.
- `CheckFinding.resourceId`가 있으면 같은 id를 가진 보드 노드에 경고를 붙인다.

### 말할 예시

“AI가 EC2에 대한 보안 경고를 만들면, 그 finding에는 `resourceId: "backend-server"`가 들어가. 보드는 그 id를 가진 노드에 경고 뱃지나 표시를 붙이면 돼.”

## sw 연결 시나리오: Terraform 변환

### sw에게 말할 핵심

Terraform 생성의 원천은 AI 응답 문자열이 아니라 `ArchitectureJson`이어야 한다.

AI가 Terraform 최종본을 자유롭게 생성하면 위험하다.

sw 파트는 `ArchitectureJson -> Terraform 코드`를 deterministic하게 만들고, gg AI는 그 결과를 설명하는 쪽을 맡는다.

### 연결 API

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

### sw가 맞춰야 할 것

- IaC Preview 문자열을 API에 넘길 수 있어야 한다.
- 가능하면 Terraform Resource와 `ArchitectureJson.nodes[].id` 매핑을 유지한다.
- AI 설명은 deployable Terraform의 원천이 아니다.
- AI finding은 사용자가 검토할 보조 정보다.

### 말할 예시

“sw가 만든 Terraform Preview를 gg AI API에 넘기면, 사용자는 이 코드가 EC2를 만들고, RDS 비용이 생기고, SSH가 열려 있으면 위험하다는 설명을 볼 수 있어.”

## ck 연결 시나리오: Plan / Apply 오류 설명

### ck에게 말할 핵심

배포 실행 파트에서 Plan이나 Apply 실패가 나면, 전체 로그를 AI에게 다 보내지 않아도 된다.

MVP에서는 최소 입력만 넘긴다.

### 연결 API

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

### ck가 맞춰야 할 것

- AI에 넘기기 전에 secret이나 credential은 마스킹해야 한다.
- `stage`는 우선 `validate`, `plan`, `apply`만 쓴다.
- Deployment History와 raw/masked log 저장은 ck 파트가 맡는다.
- AI 설명은 MVP에서 stateless response로 받는다.
- `relatedResourceId`가 있으면 보드나 결과 화면에서 해당 Resource와 연결할 수 있다.

### 말할 예시

“Apply 실패 로그를 통째로 저장하고 AI에게 다 던지는 게 아니라, 사용자가 이해해야 하는 핵심 오류 메시지만 넘기면 돼. 그러면 AI가 ‘권한 부족입니다. IAM 권한을 확인하세요’처럼 바꿔준다.”

## ys 연결 시나리오: 프로젝트 / 플랫폼

### ys에게 말할 핵심

프로젝트 목록은 가볍게 유지하는 게 좋다.

AI 분석 결과는 프로젝트 목록보다 프로젝트 상세, 작업 화면, 프로젝트 확인 보드 쪽에 보여주는 게 맞다.

### 현재 코드에 직접 추가된 핵심 타입

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

### ys가 볼 수 있는 요약 타입 방향

아래 타입은 현재 구현 코드의 직접 export는 아니고, 프로젝트 상세 화면이나 dashboard 연결 때 쓸 수 있는 방향이다.

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

### ys가 맞춰야 할 것

- 프로젝트 목록 API에 AI 상세 결과를 억지로 넣지 않는다.
- 프로젝트 상세나 dashboard API에서 AI 요약을 optional로 보여주는 쪽이 좋다.
- 활동 내역에는 모든 AI 요청을 남기지 말고 중요한 이벤트만 남긴다.
- 예: Architecture Draft 생성, Pre-Deployment Check 완료, Pre-Deployment Check 실패.

### 말할 예시

“프로젝트 목록에 AI 결과를 다 붙이면 목록 API가 무거워져. 대신 프로젝트 상세에 들어갔을 때 ‘위험 high 1개, 예상 비용 얼마, 체크리스트 몇 개’처럼 보여주면 된다.”

## 팀장 또는 공통 계약 담당 연결 시나리오

### 말할 핵심

현재 gg AI API는 공통 타입을 `packages/types`에 뒀다.

다만 공통 API wrapper 형식이 팀 전체에 확정되어 있지 않으면, AI API만 독자 wrapper를 만들지 않는 게 좋다.

### 확인해야 할 것

- API 응답 wrapper를 팀장이 정하면 AI route도 맞춘다.
- `ResourceType` 확장 목록을 팀 공통으로 인정해야 한다.
- `ArchitectureJson`은 보드와 Terraform 변환의 공통 기준으로 유지해야 한다.
- AI 결과 저장 여부는 MVP에서는 stateless response가 기본이다.

### 말할 예시

“AI 분석 결과를 DB에 무조건 저장하면 prompt/output 보안, 버전 관리, 오래된 분석 결과 처리 문제가 생겨. 지금은 요청하면 바로 응답하는 stateless 구조로 두고, 저장은 팀 공통 정책이 정해지면 붙이는 게 안전하다.”

## 꼭 설명해야 할 데이터 타입 요약

### ArchitectureJson

가장 중요한 공통 계약이다.

사용처:

- jh: Architecture Board 표시
- sw: Terraform 생성 원천
- gg: Architecture Draft 생성과 Pre-Deployment Check 입력
- ys: 프로젝트 상세나 저장된 Architecture Snapshot 표시

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

```ts
type AiTerraformPreviewExplanationResult = {
  summary: string;
  detectedResources: AiTerraformDetectedResource[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
};
```

## 팀 공통 작업 방식: TDD

gg AI 파트만 TDD를 해야 하는 것은 아니다.

가능하면 모든 팀원이 자기 파트에서 중요한 경계는 TDD로 고정하는 것이 좋다.

각 파트별 추천 TDD 대상:

- jh: `ArchitectureJson`을 넣었을 때 보드 노드와 연결선이 정상 생성되는지
- sw: 같은 `ArchitectureJson`을 넣으면 같은 Terraform Preview가 나오는지
- ck: Terraform 오류 payload가 stage별로 올바르게 저장/전달되는지
- ys: 프로젝트 목록에는 무거운 AI 상세 결과가 섞이지 않고, 상세 화면에서 optional AI 요약이 표시되는지
- gg: AI fallback API가 외부 LLM 없이도 같은 구조의 응답을 반환하는지

말할 예시:

“우리가 다 Codex로 구현하면 각자 마음대로 필드명을 만들 가능성이 커. TDD는 기능 완성보다도 ‘연결 계약이 깨지지 않게 잡는 장치’로 봐야 해.”
