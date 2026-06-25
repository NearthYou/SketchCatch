# 데이터 모델

이 문서는 SketchCatch에서 DB 테이블, API DTO, 프론트 상태 객체가 같은 의미로 쓰이도록 맞춘 공통 데이터 모델 기준이다.

## 결론

사용자가 제안한 모델 방향은 타당하다. 특히 `Project`, `ResourceNode`, `ResourceEdge`, `TerraformCode`, `Deployment`처럼 팀원이 서로 다른 이름으로 구현하면 API 연결 단계에서 깨질 수 있는 영역을 먼저 고정해야 한다는 판단이 맞다.

다만 현재 SketchCatch의 실제 구현과 제품 전략을 기준으로 아래처럼 수정한다.

- 1차 제공 초반은 로그인 사용자가 아니라 `AnonymousWorkspace` 기반이다. `User`는 인증 도입 시 추가한다.
- `Diagram`은 DB에 이미 `architectures` 테이블로 들어가 있다. 공통 타입 이름은 `ArchitectureSnapshot`으로 두고, 화면에서는 다이어그램 또는 보드라고 불러도 된다.
- 저장되는 아키텍처 JSON은 `nodes`와 `edges`를 가진 `ArchitectureJson`으로 고정한다.
- 자연어 요구사항에서 추출한 예산, 트래픽, 런타임, DB, 가용성, 보안 우선순위는 후속 `RequirementConstraint` 모델로 분리할 수 있다.
- 비용·성능 시뮬레이션 결과는 1차 제공에서 최소 DTO로 시작하고, 후속 `DesignSimulationResult` 모델로 분리한다.
- AI 수정 제안은 자동 적용 결과가 아니라 사용자가 diff를 보고 승인해야 하는 `AiChangeProposal` 후보 모델로 다룬다.
- Terraform 원문은 RDS `content` 컬럼에 저장하지 않는다. IaC 파일은 S3에 두고, RDS/API에는 `ProjectAsset` 또는 `TerraformArtifact` 메타데이터와 `objectKey`를 저장한다.
- 실제 AWS 배포 실행은 2차 제공 범위다. 1차 제공에서 다룰 `Deployment`는 통제된 배포/연습 세션 상태 기록 또는 모의 실행 이력으로 제한하고, 프론트에서 AWS SDK를 직접 호출하지 않는다.

## 이름 규칙

- TypeScript, API DTO, 프론트 상태 객체는 `camelCase`를 사용한다.
- PostgreSQL 컬럼은 `snake_case`를 사용한다.
- API 경계에서 변환된 객체는 반드시 공유 타입의 의미를 따른다.
- 날짜는 API와 프론트에서 ISO 문자열(`IsoDateTimeString`)로 다룬다. DB/ORM 내부에서만 `Date` 객체를 사용할 수 있다.
- 공유 타입에는 비밀번호 해시, 암호화 전 access key, secret key 같은 민감값을 넣지 않는다.

예시:

| DB 컬럼 | API / 프론트 필드 |
| --- | --- |
| `project_id` | `projectId` |
| `user_id` | `userId` |
| `created_at` | `createdAt` |
| `architecture_json` | `architectureJson` |

## 1차 제공 모델

1차 제공에서는 아래 모델을 코드 기준으로 맞춘다. 다만 `User`, `AwsCredential`, 실제 AWS apply 실행은 인증/권한/비용 사고 방지 설계가 필요하므로 별도 명시가 있을 때만 포함한다.

권장 순서:

| 단계 | 구현 모델 | 목적 |
| --- | --- | --- |
| 1차 초반 | `AnonymousWorkspace`, `Project`, `ArchitectureSnapshot`, `ArchitectureJson`, `ResourceNode`, `ResourceEdge` | 프로젝트 생성과 보드 저장 기준 확정 |
| 1차 중반 | `ProjectAsset`, `TerraformArtifact` | 다이어그램 이미지, Terraform 파일, export 산출물 저장 |
| 1차 후반 | `Deployment`, `Template` | 모의/통제된 실행 이력과 Template 공유 기준 확정 |

### User

로그인/회원가입 기능의 사용자 모델이다. 공유 타입의 `User`에는 `passwordHash`를 넣지 않는다.

```ts
type User = {
  id: string;
  username: string;
  email: string;
  nickname: string;
  createdAt: IsoDateTimeString;
};
```

DB 기준: `users`

DB 내부 테이블에는 `password_hash`, `updated_at`, `deleted_at`이 있을 수 있지만, API DTO와 프론트 상태 객체로는 노출하지 않는다.

### AuthSession

로그인, 회원가입, token refresh 응답에서 사용하는 session DTO다.

```ts
type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};
```

DB 기준: `refresh_tokens`

DB에는 refresh token 원문을 저장하지 않고 hash만 저장한다. access token은 짧은 만료 시간을 가진 서명 token으로 다루며, `projects` 조회와 생성은 access token에서 확인한 `userId`를 사용한다.

### API Error Response

프론트가 공통으로 처리하는 API 에러 DTO다. 성공 응답은 각 API DTO를 그대로 반환하고, 실패 응답은 아래 형태로 고정한다.

```ts
type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "internal_server_error";

type ApiErrorResponse = {
  error: ApiErrorCode;
  message: string;
};
```

로그인 실패 횟수 제한에 걸린 `429` 응답만 `lockedUntil`을 추가로 포함한다.

```ts
type LoginLockedErrorResponse = ApiErrorResponse & {
  error: "too_many_requests";
  lockedUntil: IsoDateTimeString;
};
```

프론트 기준 상태 코드는 아래처럼 처리한다.

| HTTP status | `error` | 의미 |
| --- | --- | --- |
| `401` | `unauthorized` | access token 없음, 만료, 삭제된 사용자, 잘못된 로그인 정보 |
| `404` | `not_found` | 존재하지 않거나 현재 사용자가 접근할 수 없는 리소스 |
| `409` | `conflict` | 이미 사용 중인 username/email 같은 중복 입력 |
| `429` | `too_many_requests` | 로그인 실패 횟수 초과, `lockedUntil`까지 재시도 차단 |

### Project

사용자가 만드는 인프라 설계 프로젝트다.

```ts
type Project = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `projects`

`userId`는 인증 도입 후 마이그레이션할 수 있도록 선택값으로 둔다. 현재 1차 제공에서는 `workspaceId`가 필수 소유자 키다.

### ArchitectureSnapshot

다이어그램의 저장 단위다. 사용자가 보드에서 수정할 때마다 새 버전을 만들 수 있으므로 `version`을 가진 스냅샷으로 본다.

```ts
type ArchitectureSnapshot = {
  id: string;
  projectId: string;
  version: number;
  source: "manual" | "prompt" | "template" | "imported" | string;
  architectureJson: ArchitectureJson;
  createdAt: IsoDateTimeString;
};
```

DB 기준: `architectures`

### ArchitectureJson

화면 보드, API 저장, 비용/위험 룰 엔진, IaC 생성이 함께 보는 핵심 JSON이다.

```ts
type ArchitectureJson = {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
};
```

### ResourceNode

화면에 보이는 AWS 리소스 노드다.

```ts
type ResourceNode = {
  id: string;
  type:
    | "VPC"
    | "SUBNET"
    | "EC2"
    | "RDS"
    | "S3"
    | "SECURITY_GROUP"
    | "CLOUDFRONT"
    | "LAMBDA"
    | "UNKNOWN";
  label?: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
};
```

`config`는 리소스별 설정을 담는 확장 필드다. 예를 들어 EC2는 `instanceType`, `ami`, RDS는 `engine`, `instanceClass`처럼 서로 다른 값을 가질 수 있다.

1차 제공에서 보드, AI, Terraform 생성기가 공유해야 하는 `ResourceType` 값은 아래로 고정한다.

| 값 | 의미 | 1차 제공 사용 |
| --- | --- | --- |
| `VPC` | 네트워크 경계 | 기본 |
| `SUBNET` | VPC 내부 subnet | 기본 |
| `EC2` | 서버 인스턴스 | 기본 |
| `RDS` | 관계형 DB | 기본 |
| `S3` | 객체 저장소/정적 웹 origin | 기본 |
| `SECURITY_GROUP` | 접근 제어 규칙 | 기본 |
| `CLOUDFRONT` | 정적 웹 배포 CDN | 정적 웹사이트 유형 |
| `LAMBDA` | 서버리스 함수 | 후순위 또는 기존 타입 호환 |
| `UNKNOWN` | 지원하지 않는 리소스 fallback | fallback |

Codex 작업자는 `Security Group`, `security-group`, `cloudfront`처럼 다른 문자열을 새로 만들지 않는다. 새 리소스가 필요하면 먼저 이 문서와 `packages/types/src/index.ts`, API Zod schema를 같은 PR에서 맞춘다.

### ResourceEdge

리소스 사이의 연결 정보다.

```ts
type ResourceEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
};
```

`sourceId`와 `targetId`는 반드시 같은 `ArchitectureJson.nodes` 안의 `ResourceNode.id`를 가리켜야 한다.

### ProjectAsset

다이어그램 이미지, Terraform 파일, export zip처럼 S3에 저장되는 산출물의 메타데이터다.

```ts
type ProjectAsset = {
  id: string;
  projectId: string;
  architectureId: string | null;
  assetType:
    | "diagram_png"
    | "diagram_svg"
    | "terraform_file"
    | "project_export_zip"
    | "thumbnail";
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number | null;
  createdAt: IsoDateTimeString;
};
```

DB 기준: `project_assets`

### TerraformArtifact

사용자 제안의 `TerraformCode`는 방향은 맞지만, `content`를 RDS에 저장하는 구조는 프로젝트 규칙과 맞지 않는다. Terraform 파일은 S3에 저장하고, RDS에는 참조 정보만 둔다.

```ts
type TerraformArtifact = ProjectAsset & {
  assetType: "terraform_file";
  architectureId: string;
};
```

API가 미리보기를 제공해야 한다면 S3에서 파일을 읽어 응답 DTO에 `content`를 임시로 포함할 수는 있다. 하지만 영구 저장 기준 모델은 `objectKey`다.

### Deployment

통제된 배포 또는 연습 세션의 실행 이력이다. 1차 제공에서는 모의 실행, dry-run, 제한된 demo 상태 기록으로 구현한다. 실제 AWS apply 기능은 2차 제공으로 두며, 프론트에서 직접 AWS SDK를 호출하지 않는다.

```ts
type Deployment = {
  id: string;
  projectId: string;
  architectureId: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
  startedAt: IsoDateTimeString;
  finishedAt: IsoDateTimeString | null;
};
```

### Template

Template 공유용 모델이다. 1차 제공에서는 보드 저장이 안정된 뒤 기본 Template부터 추가한다.

```ts
type Template = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  architectureJson: ArchitectureJson;
  likeCount: number;
  createdAt: IsoDateTimeString;
};
```

`diagramJson`보다는 `architectureJson`을 사용한다. 프로젝트 전체에서 같은 JSON 이름을 쓰기 위해서다.

## 후순위 모델

아래 모델은 1차 제공에서 분리한다. 이유는 CRUD 난이도보다 보안/권한/운영 정책 결정이 더 중요하기 때문이다.

### AwsCredential

실제 AWS 연결이 필요해질 때 추가한다. 1차 제공에는 넣지 않는다.

```ts
type AwsCredential = {
  id: string;
  userId: string;
  accountId: string;
  roleArn: string;
  createdAt: IsoDateTimeString;
};
```

가능하면 access key/secret key 저장보다 role assumption 기반 연결을 우선한다. 불가피하게 key를 저장해야 할 때는 암호화 저장과 접근 권한 분리를 먼저 설계한다.

### DeploymentLog

배포 워커 또는 통제된 실행 기능이 생긴 뒤 추가한다.

```ts
type DeploymentLog = {
  id: string;
  deploymentId: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  createdAt: IsoDateTimeString;
};
```

### AI 결과 DTO

AI 결과 DTO는 API/프론트/보드/IaC 화면이 공유하는 응답 계약이다. 팀장 선택 결과에 따라 Pre-Deployment Analysis는 저장 대상이 될 수 있지만, 이 섹션은 우선 구현 전 `packages/types/src/index.ts`에 고정할 응답 필드명을 정의한다.

```ts
type AiResultMetadata = {
  source: "prompt" | "template_fallback" | "llm_fallback" | "github";
  confidence: "low" | "medium" | "high";
  assumptions: string[];
  explanations: string[];
};

type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
};
```

`AiArchitectureDraftResult.architectureJson`만 Architecture Board의 입력이 된다. `metadata`는 AI 근거 표시용이며 별도 그래프 구조가 아니다. AI 생성 출처는 최상위 `source` 필드로 두지 않고 `metadata.source`로 관리한다.

새 Architecture Draft의 주 입력은 Source Repository가 아니라 자연어 요구사항이다. `metadata.source = "prompt"`는 Requirement Prompt 기반 생성 결과를 뜻하고, `github`는 Source Repository가 보조 evidence로 쓰인 경우에만 사용한다.

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
  category:
    | "cost"
    | "security"
    | "configuration"
    | "permission"
    | "network"
    | "performance"
    | "availability";
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

type AiAnalysisSummary = {
  status: "not_analyzed" | "completed" | "warning" | "failed";
  highestSeverity: "low" | "medium" | "high" | null;
  findingCount: number;
  estimatedMonthlyCost?: MoneyEstimate;
  summary: string;
  updatedAt: IsoDateTimeString;
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

`CheckFinding.resourceId`는 있으면 반드시 같은 `ArchitectureJson.nodes[].id`를 가리킨다. 보드 경고 표시, Plan 전 화면, 프로젝트 요약은 이 값을 기준으로 연결한다.

`AiAnalysisSummary`는 ys 선택 결과에 따라 프로젝트 목록 필수 필드가 아니다. 프로젝트 상세, 프로젝트 확인 보드, high severity Toast 같은 화면에서 선택적으로 소비한다.

`AiPreDeploymentAnalysisResult`는 팀장 선택 결과에 따라 저장 가능한 AI 결과다. 저장 schema와 stale data 정책은 팀장 공통 DB 기준을 따르고, Architecture Draft와 Error Explanation은 별도 합의 전까지 응답 DTO 중심으로 다룬다.

1차 제공의 기본 시뮬레이션은 아래처럼 별도 결과 타입으로 분리하는 방향을 검토한다. 실제 필드와 저장 여부는 시뮬레이션 구현 이슈에서 확정한다.

```ts
type DesignSimulationResult = {
  summary: string;
  assumptions: string[];
  requestFlow: Array<{
    fromResourceId: string;
    toResourceId: string;
    description: string;
  }>;
  bottleneckResourceIds: string[];
  estimatedMonthlyCost?: MoneyEstimate;
  findings: CheckFinding[];
};
```

AI 수정 제안은 자동 적용 결과가 아니라 사용자가 적용 전 diff를 보는 proposal이다.

```ts
type AiChangeProposal = {
  id: string;
  title: string;
  reason: string;
  affectedResourceIds: string[];
  expectedCostChange?: MoneyEstimate;
  expectedSecurityImpact: "improved" | "neutral" | "worse";
  expectedPerformanceImpact: "improved" | "neutral" | "worse";
  architectureJsonPatchSummary: string[];
  terraformDiffSummary: string[];
  relatedFindingIds: string[];
};
```

`AiChangeProposal`은 즉시 `ArchitectureJson`에 반영하지 않는다. 사용자가 변경 diff를 확인하고 적용해야 하며, 적용 후에는 Pre-Deployment Check를 다시 실행한다.

```ts
type AiTerraformErrorExplanationResult = {
  stage: "validate" | "export" | "plan" | "apply";
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

`rawMessage`는 숨기지 않는다. `nextActions`는 1-3개로 제한한다. `relatedResourceId`는 오류가 특정 리소스와 연결될 때만 사용한다.

### Activity

알림, 감사 로그, 최근 활동 UI가 필요해질 때 추가한다.

```ts
type Activity = {
  id: string;
  userId: string;
  action: string;
  createdAt: IsoDateTimeString;
};
```

## 현재 구현 매핑

| 공통 모델 | 현재 DB/API 구현 | 상태 |
| --- | --- | --- |
| `User` | `users`, `/api/auth/*` | 구현됨 |
| `AuthSession` | `refresh_tokens`, access token DTO | 구현됨 |
| `Project` | `projects.user_id` | 구현됨 |
| `ArchitectureSnapshot` | `architectures` | 구현됨 |
| `ArchitectureJson` | `architectures.architecture_json` | 공유 패키지에 타입 정의됨 |
| `ResourceNode` | `architectureJson.nodes` 내부 객체 | 공유 패키지에 타입 정의됨 |
| `ResourceEdge` | `architectureJson.edges` 내부 객체 | 공유 패키지에 타입 정의됨 |
| `ProjectAsset` | `project_assets` | 구현됨 |
| `TerraformArtifact` | `project_assets.asset_type = "terraform_file"` | 저장 모델 구현됨 |
| `Deployment` | 향후 table/API | 1차 후반 또는 2차 제공 대상 |
| `Template` | 향후 table/API | 1차 후반 대상 |
| `DesignSimulationResult` | 향후 AI/API DTO | 1차 최소 구현 후 확정 |
| `AiChangeProposal` | 향후 AI/API DTO | 1차 수정 제안 UX와 함께 확정 |
| `User` | 향후 auth table/API | 후순위 |

## 팀 작업 규칙

새 API나 프론트 상태를 만들기 전에 먼저 `packages/types/src/index.ts`에 공통 타입을 추가하거나 수정한다. 그 다음 API의 Zod schema, DB schema, 프론트 상태 타입이 같은 필드명을 따르는지 확인한다.

특히 아래 이름은 바꾸지 않는다.

- `projectId`
- `userId`
- `architectureId`
- `architectureJson`
- `nodes`
- `edges`
- `sourceId`
- `targetId`
- `objectKey`

AI/보드/IaC/배포를 나눠 구현할 때 아래 규칙을 추가로 지킨다.

- jh 보드는 `ArchitectureJson`만으로 열릴 수 있어야 한다. AI 전용 metadata를 보드 필수 입력으로 만들지 않는다.
- sw Terraform 생성기는 `ArchitectureJson`과 `ResourceNode.config`를 입력으로 삼고, AI 응답 자체를 원천 진실로 삼지 않는다.
- ck Plan/Apply 화면은 `AiPreDeploymentAnalysisResult`, `AiTerraformErrorExplanationResult`, raw Terraform/AWS output을 분리해서 다룬다.
- ys 플랫폼 화면은 프로젝트 목록이나 알림에서 AI 요약을 보여줄 수 있지만, 원천 데이터는 프로젝트/아키텍처/분석 DTO를 참조한다.
- 팀장 선택 C에 따라 공통 API 응답 wrapper는 AI 라우트만 먼저 만들지 않고 전체 route 정리 이후 같은 wrapper를 따른다. wrapper 적용 전에도 DTO 필드명은 이 문서를 따른다.
