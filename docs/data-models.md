# 데이터 모델

이 문서는 SketchCatch에서 DB 테이블, API DTO, 프론트 상태 객체, AI 결과, Terraform/Deployment 흐름이 같은 의미로 쓰이도록 맞춘 공통 데이터 모델 기준이다.

## 원칙

- TypeScript, API DTO, 프론트 상태 객체는 `camelCase`를 사용한다.
- PostgreSQL 컬럼은 `snake_case`를 사용한다.
- 날짜는 API와 프론트에서 `IsoDateTimeString`으로 다룬다.
- 공유 타입에는 `passwordHash`, raw access key, secret key, private token, DB password를 넣지 않는다.
- 새 필드, enum, status, DTO는 먼저 이 문서와 `packages/types/src/index.ts`에 맞춘다.
- API 요청/응답은 shared type을 기준으로 하고, API route에서는 Zod schema로 같은 계약을 검증한다.

## 핵심 계약

| 모델 | 책임 |
| --- | --- |
| `ArchitectureJson` | 저장된 Practice Architecture의 도메인 그래프 |
| `InfrastructureGraph` | `DiagramJson`과 Terraform 사이의 양방향 동기화 중간 그래프 |
| `DiagramJson` | Architecture Board 편집 상태와 Terraform 변환 입력 |
| `ProjectDraft` | 프로젝트별 최신 편집 draft |
| `TerraformArtifact` | S3에 저장된 Terraform 파일 메타데이터 |
| `Deployment` | 승인된 Terraform 실행 단위 |
| `DeploymentLog` | Deployment 단계별 실행 로그 |
| `CheckFinding` | Pre-Deployment Check의 단일 경고/검증 결과 |

## ArchitectureJson

`ArchitectureJson`은 프로젝트 저장, AI 분석, 비용/위험 분석이 바라보는 도메인 그래프다.

```ts
type ArchitectureJson = {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
};
```

`ResourceNode`:

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

`ResourceEdge`:

```ts
type ResourceEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
};
```

`sourceId`와 `targetId`는 같은 `ArchitectureJson.nodes[].id`를 가리켜야 한다.

## InfrastructureGraph

`InfrastructureGraph`는 `DiagramJson`과 Terraform을 양방향 동기화할 때 사용하는 정규화된 중간 모델이다. Architecture Board 전용 그래프를 새로 만드는 것이 아니라, 보드 편집 상태와 Terraform HCL subset이 같은 Resource identity와 IaC identity를 공유하도록 맞추는 동기화 계약이다.

```ts
type InfrastructureGraph = {
  nodes: InfrastructureGraphNode[];
  edges: InfrastructureGraphEdge[];
};
```

`InfrastructureGraphNode`:

```ts
type InfrastructureGraphNode = {
  id: string;
  type: ResourceType;
  label?: string;
  iac: {
    provider: CloudProvider;
    terraformBlockType: TerraformBlockType;
    resourceType: string;
    resourceName: string;
    fileName?: string;
  };
  config: Record<string, unknown>;
};
```

`InfrastructureGraphEdge`:

```ts
type InfrastructureGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
};
```

`id`는 `DiagramJson.nodes[].id`와 안정적으로 대응해야 한다. Terraform에서 들어온 변경은 `(resourceType, resourceName)`으로 기존 node를 찾고, 찾은 node의 `id`를 유지한 채 `config`를 갱신한다. 매칭할 수 없는 block, 알 수 없는 block, 복잡한 expression처럼 안전하게 해석할 수 없는 입력은 기존 그래프나 `DiagramJson`을 변경하지 않고 diagnostic으로 반환한다.

## DiagramJson

`DiagramJson`은 Architecture Board 편집 상태와 Terraform 변환 입력이다. React Flow 스타일의 위치, 크기, viewport, node style, Terraform parameters를 포함할 수 있다.

```ts
type DiagramJson = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: DiagramViewport;
};
```

Terraform 변환에 필요한 값은 아래 4개다.

- `node.parameters.terraformBlockType`
- `node.parameters.resourceType`
- `node.parameters.resourceName`
- `node.parameters.values`

DB에는 refresh token 원문을 저장하지 않고 hash만 저장한다. API 응답 DTO와 프론트 상태에는 refresh token 원문을 넣지 않고, 서버가 `HttpOnly`, `SameSite=Lax` 쿠키로 내려보낸다. access token은 짧은 만료 시간을 가진 표준 JWT로 다루며, 프론트는 access token을 `localStorage`나 `sessionStorage`에 저장하지 않고 런타임 메모리에만 보관한다. 새로고침처럼 메모리가 비면 `/api/auth/refresh`가 refresh cookie로 새 access token을 복구한다. refresh/logout 같은 cookie 기반 인증 요청은 CSRF 방지를 위해 별도 CSRF cookie 값과 `X-CSRF-Token` header 값이 일치해야 한다.

```ts
type AuthSession = {
  accessToken: string;
  expiresInSeconds: number;
};
```

4일 AWS E2E 데모에서는 `DiagramJson -> InfrastructureGraph -> Terraform` 흐름을 우선 사용한다. Terraform 편집 내용을 다시 반영할 때는 `Terraform -> InfrastructureGraph patch -> DiagramJson` 흐름으로 같은 node의 `parameters.values`를 갱신한다. AI 분석이나 비용/위험 분석이 `ArchitectureJson`을 요구하면 `DiagramJson -> ArchitectureJson` 어댑터를 둔다.

`ArchitectureJson`, `InfrastructureGraph`, `DiagramJson`은 서로 대체 관계가 아니다.

- `ArchitectureJson`: 도메인 저장/분석 계약
- `InfrastructureGraph`: Terraform/DiagramJson 동기화 계약
- `DiagramJson`: 보드 편집/화면 복구/Terraform 변환 계약

## ResourceType

MVP에서 공통으로 사용할 `ResourceType` 값은 아래로 고정한다.

```ts
type ResourceType =
  | "VPC"
  | "SUBNET"
  | "EC2"
  | "RDS"
  | "S3"
  | "SECURITY_GROUP"
  | "CLOUDFRONT"
  | "LAMBDA"
  | "UNKNOWN";
```

팀원은 `Security Group`, `security-group`, `cloudfront` 같은 새 문자열을 임의로 만들지 않는다. 새 Resource가 필요하면 `docs/data-models.md`, `packages/types`, API Zod schema, 프론트 소비처를 같은 PR에서 맞춘다.

## Project

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

`userId`는 인증된 사용자 소유자 키다. 프로젝트 접근은 `Authorization: Bearer <accessToken>`에서 확인한 사용자와 `projects.user_id`를 비교한다.

## ArchitectureSnapshot

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

저장된 버전은 `ArchitectureSnapshot`이다. 화면에서 다이어그램, 보드, 설계라고 부르더라도 API/DB 계약에서는 이 이름을 따른다.

## ProjectDraft

```ts
type ProjectDraft = {
  id: string;
  projectId: string;
  diagramJson: DiagramJson;
  revision: number;
  serverSavedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `project_drafts`

프로젝트당 최신 draft 1개를 유지한다. `diagramJson`은 화면 복구와 Terraform 변환을 위해 JSONB로 저장한다.

## ProjectAsset와 TerraformArtifact

파일성 산출물은 S3에 저장하고, RDS에는 metadata와 `objectKey`만 저장한다.

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

type TerraformArtifact = ProjectAsset & {
  assetType: "terraform_file";
  architectureId: string;
};
```

Terraform 원문은 RDS `content` 컬럼에 저장하지 않는다. API가 미리보기를 제공하기 위해 S3에서 읽어 임시 응답으로 내려줄 수는 있지만, 영구 저장 기준은 S3 object다.

## Terraform 생성과 정적 검증 DTO

Terraform 생성은 `DiagramJson`을 입력으로 받고 내부에서 `InfrastructureGraph`로 정규화한 뒤 Terraform 문자열을 반환한다.

```ts
type TerraformGenerateRequest = {
  diagramJson: DiagramJson;
};

type TerraformGenerateResponse = {
  terraformCode: string;
};
```

정적 검증은 실제 Terraform CLI를 실행하지 않고 사용자가 편집 중인 Terraform 문자열만 점검한다.

```ts
type TerraformDiagnosticSeverity = "info" | "warning" | "error";

type TerraformDiagnostic = {
  severity: TerraformDiagnosticSeverity;
  message: string;
  code?: string;
  line?: number;
  resourceAddress?: string;
  nodeId?: string;
};

type TerraformValidateRequest = {
  terraformCode: string;
};

type TerraformValidateResponse = {
  diagnostics: TerraformDiagnostic[];
};
```

정적 diagnostics는 Deployment의 `init`, `validate`, `plan`, `apply` stage와 섞지 않는다. 실제 Terraform CLI 기반 검증은 Deployment 실행 흐름에서 다룬다.

## Deployment

`Deployment`는 사용자가 승인한 IaC Preview를 실제 클라우드 리소스에 반영하는 실행 단위다.

```ts
type Deployment = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
  planSummary: DeploymentPlanSummary | null;
  isBlocked: boolean;
  blockedBy: "risk_analysis" | "cost_analysis" | "missing_approval" | null;
  blockedReason: string | null;
  failureStage: "init" | "validate" | "plan" | "approval" | "apply" | "destroy" | "cleanup" | null;
  errorSummary: string | null;
  approvedAt: IsoDateTimeString | null;
  approvedByUserId: string | null;
  approvedTerraformArtifactId: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

`Deployment`는 제품/문서/화면/코드에서 실제 실행 단위로 통일한다.

## DeploymentPlanSummary

```ts
type DeploymentPlanSummary = {
  createCount: number;
  updateCount: number;
  deleteCount: number;
  replaceCount: number;
  blocked: boolean;
  warnings: DeploymentPlanWarning[];
};
```

Plan summary는 `terraform show -json tfplan`을 파싱해 만든다. 사용자가 승인한 plan과 apply 대상 plan은 같은 artifact/hash 기준이어야 한다.

## DeploymentLog

```ts
type DeploymentLog = {
  id: string;
  deploymentId: string;
  sequence: number;
  stage: "init" | "validate" | "plan" | "apply";
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  relatedResourceId: string | null;
  createdAt: IsoDateTimeString;
};
```

로그는 sequence 순서를 보장한다. message에는 credential, token, password, DB URL, sensitive output이 남지 않아야 한다.

## AI 결과 DTO

AI는 원천 진실이 아니라 설명과 제안 계층이다. 배포 가능한 artifact는 deterministic graph, generator, validation, Terraform CLI 결과를 거쳐야 한다.

```ts
type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
};
```

```ts
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
```

`CheckFinding.resourceId`가 있으면 같은 `ArchitectureJson.nodes[].id` 또는 변환된 보드 node id를 가리켜야 한다.

## 팀 작업 규칙

- 정현: Architecture Board는 `DiagramJson` 계약을 따른다.
- 시원: Terraform 변환은 `DiagramNode.parameters`를 입력으로 삼는다.
- 채강: Deployment는 `TerraformArtifact`, `Deployment`, `DeploymentLog` 계약을 따른다.
- 경근: AI 분석은 `ArchitectureJson`, `CheckFinding`, 비용 DTO를 따른다.
- 윤서: 플랫폼 화면은 `User`, `Project`, 인증 DTO, 프로젝트 DTO를 따른다.
- 팀장: DB schema, API 응답, shared type 충돌을 최종 조정한다.

새 계약이 필요하면 담당자 문서에만 쓰지 말고, 이 문서와 `packages/types/src/index.ts`에 먼저 반영한다.
