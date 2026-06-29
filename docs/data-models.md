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
| `AwsConnection` | 사용자가 한 번 연결해 여러 프로젝트에서 재사용하는 AWS Role 연결 metadata |
| `Deployment` | 승인된 Terraform 실행 단위 |
| `DeploymentPlanArtifact` | S3에 저장된 `tfplan` 파일의 Deployment별 metadata |
| `DeploymentLog` | Deployment 단계별 실행 로그 |
| `DeployedResource` | Apply 성공 후 Terraform state에서 추출한 실제 생성 리소스 |
| `TerraformOutput` | Apply 성공 후 `terraform output -json`에서 추출한 output |
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

보드 전용 node metadata는 `node.metadata`에 둔다. `metadata`는 화면 편집 상태를 복구하기 위한 값이며,
Terraform resource/data block 생성에는 사용하지 않는다.

```ts
type AwsRegionCode =
  | "ap-northeast-2"
  | "ap-northeast-1"
  | "ap-southeast-1"
  | "us-east-1"
  | "us-west-2"
  | "eu-west-1"
  | "eu-central-1";

type DiagramNodeMetadata = {
  awsRegion?: AwsRegionCode;
};
```

Region 디자인 노드의 선택 리전은 `node.metadata.awsRegion`에 region code로 저장한다.
예: `ap-northeast-2`. 화면 label은 프론트엔드 option catalog에서 code와 매핑한다.

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

소셜 로그인 provider 계정은 `oauth_accounts`에 저장한다. `oauth_accounts.provider + provider_user_id`는 외부 provider 계정의 고유 연결 키이며, 실제 provider access token은 저장하지 않는다. 소셜 전용 사용자는 `users.password_hash`가 `null`일 수 있고, 일반 비밀번호 로그인에서는 password hash가 없는 사용자를 로그인 실패로 처리한다.


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

Terraform 역동기화는 사용자가 편집 중인 Terraform 문자열을 기존 `DiagramJson`에 반영한다. 지원 범위 밖 HCL, 매칭할 수 없는 block, 불확실한 파싱이 있으면 기존 `DiagramJson`을 변경하지 않고 diagnostics를 반환한다.

```ts
type TerraformSyncToDiagramRequest = {
  diagramJson: DiagramJson;
  terraformCode: string;
};

type TerraformSyncToDiagramResponse = {
  diagramJson: DiagramJson;
  diagnostics: TerraformDiagnostic[];
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

## AwsConnection

`AwsConnection`은 프로젝트별 설정이 아니라 사용자 계정 단위의 AWS Role 연결이다. 사용자는 환경설정에서 AWS 계정을 한 번 연결하고, 각 프로젝트의 Deployment 흐름에서는 검증된 연결을 선택해 재사용한다.

같은 사용자가 같은 AWS `accountId`를 `verified` 상태로 중복 연결할 수 없도록 `userId + accountId` partial unique index를 둔다. `pending` 연결은 아직 accountId를 모르기 때문에 생성될 수 있지만, verify 시점에 이미 연결된 AWS account면 실패 처리한다.

DB 기준: `aws_connections`

저장하는 값은 연결 metadata뿐이다. Access Key ID, Secret Access Key, Session Token, `AssumeRole` 결과 credential은 저장하지 않는다.

```ts
type AwsConnection = {
  id: string;
  userId: string;
  accountId: string | null;
  roleArn: string | null;
  externalId: string;
  region: "ap-northeast-2";
  status: "pending" | "verified" | "failed";
  lastVerifiedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

API 경로:

- `GET /api/aws/connections`
- `POST /api/aws/connections`
- `POST /api/aws/connections/:connectionId/test`
- `POST /api/aws/connections/:connectionId/verify`
- `POST /api/aws/connections/:connectionId/verify-created-role`
- `DELETE /api/aws/connections/:connectionId`
- `GET /api/aws/connections/:connectionId/cloudformation-template`

`DELETE /api/aws/connections/:connectionId`는 SketchCatch의 연결 metadata만 삭제한다. 사용자 AWS 계정에 생성된 IAM Role이나 CloudFormation Stack은 자동으로 삭제하지 않는다. `Deployment`가 참조 중인 연결은 삭제할 수 없고 `409 conflict`를 반환한다.

`Deployment`는 이 연결을 `awsConnectionId`로 참조한다.

## Deployment

`Deployment`는 사용자가 승인한 IaC Preview를 실제 클라우드 리소스에 반영하는 실행 단위다.

```ts
type Deployment = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string | null;
  currentPlanArtifactId: string | null;
  stateObjectKey: string | null;
  resultWarningSummary: string | null;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
  activeStage: "init" | "validate" | "plan" | "apply" | null;
  planSummary: DeploymentPlanSummary | null;
  isBlocked: boolean;
  blockedBy: "risk_analysis" | "cost_analysis" | "missing_approval" | null;
  blockedReason: string | null;
  failureStage:
    | "init"
    | "validate"
    | "plan"
    | "approval"
    | "aws_connection"
    | "mock_run"
    | "apply"
    | null;
  errorSummary: string | null;
  approvedAt: IsoDateTimeString | null;
  approvedByUserId: string | null;
  approvedTerraformArtifactId: string | null;
  approvedPlanArtifactId: string | null;
  approvedTerraformArtifactHash: string | null;
  approvedTfplanHash: string | null;
  approvedAwsAccountId: string | null;
  approvedAwsRegion: string | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  failedAt: IsoDateTimeString | null;
  cancelRequestedAt: IsoDateTimeString | null;
  cancelledAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

`Deployment`는 제품/문서/화면/코드에서 실제 실행 단위로 통일한다.

승인 시점에는 사용자가 확인한 Plan을 이후 Apply 대상과 비교할 수 있도록
`approvedTerraformArtifactId`, `approvedPlanArtifactId`, `approvedTerraformArtifactHash`,
`approvedTfplanHash`, `approvedAwsAccountId`, `approvedAwsRegion`을 함께 고정한다. 이후
Apply 단계는 이 snapshot과 현재 artifact, `tfplan`, AWS account/region이 다르면 실행하지 않는다.

Apply가 성공하면 `stateObjectKey`에는 S3에 업로드한 `terraform.tfstate` object key를 저장한다.
`terraform output -json`, `terraform show -json`, state 업로드 같은 후처리 중 일부가 실패해도
실제 AWS Apply가 성공했다면 Deployment는 `SUCCESS`로 유지하고, 사용자가 확인할 수 있도록
`resultWarningSummary`와 apply stage 로그에 경고를 남긴다.

실행 중인 Deployment는 `activeStage`와 `startedAt`을 가진다. 실행이 끝나면 `activeStage`는
`null`로 돌아가고 `completedAt`을 저장한다. 실패는 `failedAt`, 사용자가 취소를 요청한 시점은
`cancelRequestedAt`, 실제 취소 완료 시점은 `cancelledAt`에 저장한다.

한 프로젝트에는 동시에 하나의 `RUNNING` Deployment만 허용한다. 이 제약은 애플리케이션 체크와
`deployments_project_running_unique` partial unique index를 함께 사용해 보장한다.

## DeploymentPlanArtifact

`DeploymentPlanArtifact`는 사용자가 승인할 수 있는 특정 Terraform Plan 파일의 metadata다. `tfplan` 바이너리는 S3에 저장하고, RDS에는 object key와 hash, Plan 생성 시점의 Terraform artifact hash, 실행 계정/region만 저장한다. `terraform show -json tfplan`의 raw JSON 전체는 저장하지 않는다.

DB 기준: `deployment_plan_artifacts`

```ts
type DeploymentPlanArtifact = {
  id: string;
  deploymentId: string;
  terraformArtifactId: string;
  terraformArtifactSha256: string | null;
  objectKey: string;
  sha256: string;
  accountId: string;
  region: string;
  createdAt: IsoDateTimeString;
};
```

`terraformArtifactSha256`은 Plan 생성 시점에 복원한 Terraform artifact 내용을 기준으로 계산한다. 컬럼은 기존 row 마이그레이션을 위해 nullable이지만, 새 Plan은 반드시 값을 저장해야 하며 hash가 없는 Plan artifact는 승인할 수 없다. Approval 단계는 현재 S3 Terraform artifact hash와 이 값을 비교해 Plan 생성 이후 원본 Terraform artifact가 바뀐 경우 승인을 막는다.

`deployment_plan_artifacts.deployment_id`는 `deployments.id`를 FK로 참조한다. `deployments.current_plan_artifact_id`는 현재 승인 대상 Plan을 가리키는 nullable pointer이며, 같은 Deployment의 artifact인지 여부는 Deployment service에서 검증한다.

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

MVP live apply는 안전한 데모 범위를 위해 아래 Terraform resource type만 허용한다.
이외 resource type이 변경 대상에 포함되면 Plan은 `risk_analysis`로 block된다.

- `aws_vpc`
- `aws_subnet`
- `aws_internet_gateway`
- `aws_route_table`
- `aws_route_table_association`
- `aws_security_group`
- `aws_security_group_rule`
- `aws_instance`
- `aws_s3_bucket`

## DeployedResource와 TerraformOutput

`DeployedResource`는 Apply 성공 후 `terraform show -json`으로 현재 state를 읽어 RDS에 저장한
리소스 목록이다. 사용자 화면에서 실제로 어떤 Terraform address와 AWS resource id가 남았는지
확인하는 데 쓴다.

DB 기준: `deployed_resources`

```ts
type DeployedResource = {
  id: string;
  deploymentId: string;
  terraformAddress: string;
  terraformType: string;
  providerName: string | null;
  resourceId: string | null;
  region: string;
  createdAt: IsoDateTimeString;
};
```

`TerraformOutput`은 Apply 성공 후 `terraform output -json` 결과를 RDS에 저장한 값이다.
Terraform이 sensitive로 표시한 output은 저장과 응답 모두에서 `value: null`로 다룬다.

DB 기준: `terraform_outputs`

```ts
type TerraformOutput = {
  id: string;
  deploymentId: string;
  name: string;
  value: unknown | null;
  sensitive: boolean;
  createdAt: IsoDateTimeString;
};
```

조회 API:

- `GET /api/deployments/:deploymentId/resources`
- `GET /api/deployments/:deploymentId/outputs`

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
  llmExplanation?: LlmExplanation;
};
```

`LlmExplanation`은 rule 기반 결과를 덮어쓰지 않고, 사용자가 읽기 쉬운 요약과 다음 행동을 붙이는 공통 설명 계약이다. OpenAI 호출이 실패하거나 일부 필드가 rule 기반 기본값으로 대체되면 `fallbackUsed`를 `true`로 둔다.

```ts
type LlmExplanation = {
  target:
    | "architecture_draft"
    | "design_simulation"
    | "pre_deployment_check"
    | "terraform_error_explanation";
  summary: string;
  highlights: string[];
  nextActions: string[];
  fallbackUsed: boolean;
  fallbackReason?:
    | "missing_api_key"
    | "timeout"
    | "rate_limited"
    | "invalid_request"
    | "auth_error"
    | "provider_error"
    | "invalid_response";
};
```

`AiArchitectureDraftResult`, `AiPreDeploymentAnalysisResult`, `DesignSimulationResult`, `AiTerraformErrorExplanationResult`는 필요할 때 `llmExplanation?: LlmExplanation`를 포함할 수 있다.

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
