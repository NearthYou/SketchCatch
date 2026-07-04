# 데이터 모델

이 문서는 SketchCatch에서 DB 테이블, API DTO, 프론트 상태 객체, AI 결과, Terraform/Deployment 흐름이 같은 의미로 쓰이도록 맞춘 공통 데이터 모델 기준이다.

## 원칙

- TypeScript, API DTO, 프론트 상태 객체는 `camelCase`를 사용한다.
- PostgreSQL 컬럼은 `snake_case`를 사용한다.
- 날짜는 API와 프론트에서 `IsoDateTimeString`으로 다룬다.
- 공유 타입에는 `passwordHash`, raw access key, secret key, private token, DB password를 넣지 않는다.
- 새 필드, enum, status, DTO는 먼저 이 문서와 `packages/types/src/index.ts`에 맞춘다.
- API 요청/응답은 shared type을 기준으로 하고, API route에서는 Zod schema로 같은 계약을 검증한다.
- `Resource`, `Practice Architecture`, `InfrastructureGraph`, `Reverse Engineering`은 provider-neutral 개념으로 다룬다. AWS-first 구현은 가능하지만 공통 모델에 AWS-only 가정을 섞지 않는다.
- AI, Bedrock, Amazon Q, 음성 입력은 제안과 설명 계층이다. Practice Architecture, IaC Preview, Git 변경, Deployment 실행 같은 상태 변경은 `User-Accepted Change`여야 한다.

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
| `RequirementInput` | 텍스트 또는 음성에서 들어온 요구사항 입력 |
| `ProviderAdapter` | provider별 Resource 조회, import, IaC 세부를 공통 모델로 변환하는 경계 |
| `GitCicdHandoff` | IaC Preview를 Source Repository PR과 외부 pipeline으로 넘기는 handoff metadata |
| `ReverseEngineeringScan` | 기존 cloud Resource 스캔 작업과 복원 결과 metadata |

## Requirement Input과 User-Accepted Change

`RequirementInput`은 사용자가 Practice Architecture를 만들거나 바꾸기 위해 제공하는 자연어 입력이다. 입력 채널은 텍스트 또는 음성일 수 있다. 음성 입력은 Amazon Transcribe 같은 전사 단계를 거쳐 텍스트로 확인된 뒤 `RequirementPrompt`로 확정된다.

```ts
type RequirementInputMode = "text" | "voice";

type RequirementInput = {
  mode: RequirementInputMode;
  text: string;
  transcriptSource?: "amazon_transcribe";
  confirmedByUser: boolean;
};
```

AI가 만든 `ArchitectureDraft`, `ArchitectureSuggestion`, Git 변경, Deployment 실행은 자동으로 프로젝트 상태를 바꾸지 않는다. 상태 변경 API는 사용자의 명시적 수락/승인 시점과 대상을 추적할 수 있어야 한다.

```ts
type UserAcceptedChangeTarget =
  | "architecture_draft"
  | "architecture_suggestion"
  | "iac_handoff"
  | "git_change"
  | "deployment_action";

type UserAcceptedChange = {
  target: UserAcceptedChangeTarget;
  acceptedByUserId: string;
  acceptedAt: IsoDateTimeString;
};
```

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

`id`는 `DiagramJson.nodes[].id`와 안정적으로 대응해야 한다. Terraform Preview 경로의 리소스 identity는 내부 `ResourceType` 변환값이 아니라 `iac.provider + iac.terraformBlockType + iac.resourceType + iac.resourceName`이다. Terraform sync v1은 Terraform HCL 안의 `(terraformBlockType, resourceType, resourceName)`으로 기존 node를 찾고, provider는 shared `ResourceDefinition`에서 해석한다. 매칭할 수 없는 block, 알 수 없는 block, 복잡한 expression처럼 안전하게 해석할 수 없는 입력은 기존 그래프나 `DiagramJson`을 변경하지 않고 diagnostic으로 반환한다.

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
  parentAreaNodeId?: string;
};
```

Region 디자인 노드의 선택 리전은 `node.metadata.awsRegion`에 region code로 저장한다.
예: `ap-northeast-2`. 화면 label은 프론트엔드 option catalog에서 code와 매핑한다.

영역 노드 안에 명시적으로 배치된 node는 `node.metadata.parentAreaNodeId`에 부모 영역 node id를 저장한다.
이 값은 영역 이동 시 자식 node를 함께 이동시키기 위한 보드 편집 metadata이며, Terraform resource/data block 생성에는 사용하지 않는다.

Terraform 변환에 필요한 값은 아래 4개다.

- `node.parameters.terraformBlockType`
- `node.parameters.resourceType`
- `node.parameters.resourceName`
- `node.parameters.values`

`resourceType`과 `resourceName`은 Terraform block label로 직접 렌더링되므로 Terraform identifier 형식(`^[a-zA-Z_][a-zA-Z0-9_-]*$`)만 허용한다. `parameters.values`의 top-level key와 nested block key도 `camelCase`에서 `snake_case`로 정규화한 뒤 같은 identifier 형식을 만족해야 하며, 형식이 맞지 않으면 Terraform 생성 API는 HCL을 만들기 전에 `bad_request`로 거부한다.

사용자가 보드에서 리소스 아이콘을 직접 추가할 때는 Terraform identity metadata인 `terraformBlockType`, `resourceType`, `resourceName`, `fileName`만 자동 생성하고, `parameters.values`는 `{}`로 시작한다. 같은 `resourceType`의 아이콘을 반복 추가하면 `resourceName`은 `ec2_instance`, `ec2_instance_2`, `ec2_instance_3`처럼 숫자 suffix를 붙여 Terraform address 중복을 피한다. EC2 `instanceType`, VPC `cidrBlock`, `tags.Name` 같은 실제 Terraform parameter 값은 사용자 입력, AI draft config, Terraform editor sync처럼 명시 입력이 있을 때만 채운다.

신규 일반 리소스 아이콘 node의 기본 `size`는 `56x56`이다. VPC, Subnet, Security Group, Region, AZ, Group처럼 포함 관계를 표현하는 영역 node는 catalog의 별도 영역 크기를 사용하며, 일반 아이콘 축소 때문에 자동으로 절반 축소하지 않는다.

DB에는 refresh token 원문을 저장하지 않고 hash만 저장한다. API 응답 DTO와 프론트 상태에는 refresh token 원문을 넣지 않고, 서버가 `HttpOnly`, `SameSite=Lax` 쿠키로 내려보낸다. access token은 짧은 만료 시간을 가진 표준 JWT로 다루며, 프론트는 access token을 `localStorage`나 `sessionStorage`에 저장하지 않고 런타임 메모리에만 보관한다. 새로고침처럼 메모리가 비면 `/api/auth/refresh`가 refresh cookie로 새 access token을 복구한다. refresh/logout 같은 cookie 기반 인증 요청은 CSRF 방지를 위해 별도 CSRF cookie 값과 `X-CSRF-Token` header 값이 일치해야 한다.

```ts
type AuthSession = {
  accessToken: string;
  expiresInSeconds: number;
};
```

소셜 로그인 provider 계정은 `oauth_accounts`에 저장한다. `oauth_accounts.provider + provider_user_id`는 외부 provider 계정의 고유 연결 키이며, 실제 provider access token은 저장하지 않는다. 소셜 전용 사용자는 `users.password_hash`가 `null`일 수 있고, 일반 비밀번호 로그인에서는 password hash가 없는 사용자를 로그인 실패로 처리한다.


AWS-first Direct Deployment Path에서는 `DiagramJson -> InfrastructureGraph -> Terraform` 흐름을 우선 사용한다. Terraform 편집 내용을 다시 반영할 때는 `Terraform -> InfrastructureGraph patch -> DiagramJson` 흐름으로 같은 node의 `parameters.values`를 갱신한다. AI 분석이나 비용/위험 분석이 `ArchitectureJson`을 요구하면 `DiagramJson -> ArchitectureJson` 어댑터를 둔다.

`ArchitectureJson`, `InfrastructureGraph`, `DiagramJson`은 서로 대체 관계가 아니다.

- `ArchitectureJson`: 도메인 저장/분석 계약
- `InfrastructureGraph`: Terraform/DiagramJson 동기화 계약
- `DiagramJson`: 보드 편집/화면 복구/Terraform 변환 계약

## ResourceType

`ResourceType`은 provider-neutral `Resource` 개념을 코드에서 분류하기 위한 값이다. 현재 shared type은 AWS-first MVP 리소스를 먼저 담고 있지만, `Resource` 자체를 AWS 전용 개념으로 해석하지 않는다. Azure/GCP 등 provider별 타입은 Provider Adapter와 shared type 확장 작업에서 추가한다.

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
  | "INTERNET_GATEWAY"
  | "ROUTE_TABLE"
  | "ROUTE_TABLE_ASSOCIATION"
  | "AMI"
  | "LAMBDA"
  | "IAM_ROLE"
  | "IAM_POLICY"
  | "IAM_INSTANCE_PROFILE"
  | "KMS_KEY"
  | "CLOUDWATCH_LOG_GROUP"
  | "CLOUDWATCH_METRIC_ALARM"
  | "API_GATEWAY_REST_API"
  | "LAMBDA_PERMISSION"
  | "UNKNOWN";
```

팀원은 `Security Group`, `security-group`, `cloudfront` 같은 새 문자열을 임의로 만들지 않는다. 새 Resource나 provider가 필요하면 `docs/data-models.md`, `packages/types`, API Zod schema, 프론트 소비처를 같은 PR에서 맞춘다.

## ResourceDefinition과 Terraform Capability

Terraform IaC 리소스의 지원 여부는 `packages/types/src/resource-definitions.ts`의 `ResourceDefinition`을 단일 출처로 삼는다. 여기에는 `provider`, domain `resourceType`, Terraform block identity, capability만 둔다. 여기서 domain `resourceType`은 AI/Architecture 분석용 분류값이며 Terraform Preview identity 기준이 아니다. `design_region`, `design_az`, `design_group`처럼 화면 배치만 위한 container node는 IaC 리소스가 아니므로 공통 definition에 넣지 않고 web catalog에만 둔다.

```ts
type ResourceCapability = {
  terraformPreview: boolean;
  terraformSync: boolean;
  parameterPanel: boolean;
};

type ResourceDefinition = {
  id: string;
  provider: CloudProvider;
  resourceType: ResourceType;
  terraform: {
    blockType: TerraformBlockType;
    resourceType: string;
  };
  capabilities: ResourceCapability;
};
```

capability의 의미는 아래와 같다.

- `terraformPreview`: `DiagramJson -> InfrastructureGraph -> Terraform` preview 생성 대상인지 나타낸다.
- `terraformSync`: Terraform editor에서 발견한 block을 Diagram 변경 후보로 받아들일 수 있는지 나타낸다.
- `parameterPanel`: web parameter catalog에 사용자 입력 UI가 있는지 나타낸다.

새 Terraform 리소스를 추가할 때는 아래 순서를 따른다.

1. `packages/types/src/resource-definitions.ts`에 shared `ResourceDefinition`을 추가하거나 capability를 수정한다.
2. `apps/web/features/resource-settings/catalog.ts`에는 icon URL, category, label, size 같은 화면 표현만 추가한다.
3. parameter 입력 UI가 필요하면 web parameter catalog를 추가하고 `parameterPanel` capability를 맞춘다.
4. API는 web catalog를 import하지 않는다. API는 shared `ResourceDefinition`만 보고 preview/sync 지원 여부를 판단한다.

현재 `ResourceType` union에 없는 세부 AWS Terraform type은 v1에서 `UNKNOWN`으로 둔다. domain type 확장이 필요하면 `ResourceType`과 shared definition, API/Web 소비처, 문서를 같은 변경에서 맞춘다.

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

### Project Delete Preview

프로젝트 삭제 전에는 `GET /api/projects/:id/delete-preview`로 현재 삭제 방식을 판정한다.

```ts
type ProjectDeletePreviewMode =
  | "plain"
  | "planned"
  | "deployment_history"
  | "active_resources"
  | "blocked_running_deployment"
  | "blocked_multiple_active_deployments";

type ProjectDeleteAction =
  | "delete_project"
  | "delete_project_only"
  | "destroy_then_delete";

type ProjectDeletePreview = {
  projectId: string;
  mode: ProjectDeletePreviewMode;
  hasDeploymentHistory: boolean;
  hasPlanHistory: boolean;
  activeDeploymentId: string | null;
  activeDeploymentCount: number;
  activeResourceCount: number;
  latestDeploymentStatus: DeploymentStatus | null;
  message: string;
  availableActions: ProjectDeleteAction[];
};
```

`RUNNING` Deployment가 있으면 삭제를 막는다. 현재 AWS 리소스가 남아 있는 Deployment가 정확히 하나면 `destroy_then_delete`와 `delete_project_only`를 제공한다. 여러 개면 자동 destroy 대상을 특정하지 않고 `delete_project_only`만 제공한다.

`destroy_then_delete`는 `DELETE /api/projects/:id`의 직접 action이 아니다. 화면은 기존 Destroy Plan 생성, 승인, Destroy 실행을 완료한 뒤 `delete_project`로 프로젝트 기록을 삭제한다.

```ts
type DeleteProjectRequest = {
  action: "delete_project" | "delete_project_only";
};

type DeleteProjectResponse = {
  deleted: true;
  cleanup: {
    s3Status: "success" | "partial_failed" | "failed";
    failedObjectCount: number;
    message: string | null;
  };
};
```

프로젝트 삭제 시 RDS의 프로젝트 관련 기록은 삭제한다. S3 object 삭제는 best-effort로 처리하며, 일부 실패해도 프로젝트 삭제는 완료하고 `cleanup`으로 경고를 전달한다.

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

## Terraform 생성과 Editor 검증 DTO

Terraform 생성 API는 `DiagramJson`을 입력으로 받지만 내부 pipeline은 `DiagramJson -> InfrastructureGraph -> Terraform` 순서로 나뉜다. API용 preview orchestration은 `terraform-preview.ts`가 담당하고, `diagram-to-terraform.ts`는 이미 정규화된 `InfrastructureGraph`를 Terraform HCL 문자열로 렌더링하는 책임만 가진다.

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
  terraformFiles?: TerraformSyncFileInput[];
};

type TerraformSyncFileInput = {
  fileName: string;
  terraformCode: string;
};

type TerraformSyncToDiagramResponse = {
  diagramJson: DiagramJson;
  diagnostics: TerraformDiagnostic[];
  proposals?: TerraformDiagramChangeProposal[];
};
```

`terraformCode`는 기존 단일 파일 호환용 입력이다. Workspace가 여러 Terraform 파일을 들고 있으면 `terraformFiles`를 함께 보내며, API는 `fileName + block identity`를 기준으로 source file metadata를 유지한다.

동일한 `(terraformBlockType, resourceType, resourceName)`을 가진 Terraform block과 Diagram node는 같은 리소스로 보고 `parameters.values`만 갱신할 수 있다. Terraform에만 있거나 Diagram에만 있는 구조 변경, 이름 변경 후보는 API 응답에서 `proposals`로 표시할 수 있다.

```ts
type TerraformBlockIdentity = {
  terraformBlockType: "resource" | "data";
  resourceType: string;
  resourceName: string;
};

type TerraformDiagramChangeProposal =
  | {
      kind: "create_candidate";
      identity: TerraformBlockIdentity;
      sourceFileName?: string;
      line?: number;
      parameters: DiagramNodeParameters;
    }
  | {
      kind: "delete_candidate";
      identity: TerraformBlockIdentity;
      nodeId: string;
      resourceAddress: string;
    }
  | {
      kind: "rename_candidate";
      from: TerraformBlockIdentity;
      to: TerraformBlockIdentity;
      sourceFileName?: string;
      line?: number;
      nodeId: string;
      resourceAddress: string;
    };
```

`proposals`는 Terraform editor 저장 또는 배포 준비처럼 사용자가 명시적으로 실행한 Terraform sync action 안에서 반영된다. 프론트엔드는 별도 변경 제안 확인 UI를 띄우지 않고, 해당 명시 action을 사용자 승인 경계로 삼아 create/delete/rename 후보를 `DiagramJson`에 자동 반영할 수 있다.

Terraform editor 저장 sync action에서 `terraformCode`와 모든 `terraformFiles[].terraformCode`가 공백이면 사용자가 Terraform 리소스를 모두 삭제하려는 명시 의도로 본다. 이때 API는 `terraformSync` capability가 `true`인 Diagram-only resource를 `delete_candidate`로 반환하고, Diagram도 이미 비어 있으면 diagnostics 없이 성공한다.

Terraform editor에서 새로 발견한 구조 변경 proposal의 v1 범위는 shared `ResourceDefinition`의 `terraformSync` capability가 `true`인 Terraform block이다. Terraform Preview 렌더링 대상은 `terraformPreview` capability로 따로 판단한다. 따라서 `aws_cloudfront_distribution`처럼 sync는 가능하지만 preview는 아직 제외되는 리소스가 있을 수 있다. 이미 같은 identity로 매칭된 block은 parser가 안전하게 해석할 수 있는 경우 `parameters.values` 갱신 대상이 될 수 있다.

Parameter panel의 `Advanced Parameters` UI는 내부 노출 정책이 정해질 때까지 숨긴다. 이는 UI 노출 정책이며 저장 정책이 아니다. 기존 `parameters.values`에 남아 있는 optional 또는 catalog 밖 값은 사용자가 명시적으로 삭제하지 않는 한 보존하고, Terraform Preview renderer가 이해할 수 있으면 계속 렌더링 입력으로 사용한다.

Terraform editor 검증은 static-only 선행 검사다. API는 Terraform CLI를 실행하지 않고 문자열만 분석해 빠른 diagnostics를 반환한다. 검사 범위는 빈 코드, 괄호/대괄호/소괄호 짝, 닫히지 않은 문자열, `resource`/`data` block header, 중복 block address, 잘못된 attribute 라인, nested block을 attribute처럼 쓴 경우, 따옴표로 감싼 Terraform reference, 선언되지 않은 local resource reference, shared `ResourceDefinition`에 없는 AWS Terraform block이다.

구조 토큰 검사에서 error가 나오면 같은 파일의 body/reference 검사는 중단한다. 닫히지 않은 문자열이나 `{}` 때문에 depth 계산이 깨진 상태에서 뒤쪽 `resource` header를 이전 block body 오류처럼 표시하지 않기 위해서다. 이 경우 사용자는 먼저 가장 앞쪽 구조 오류를 고친 뒤 다시 검증한다.

Workspace가 여러 Terraform 파일을 들고 있으면 `terraformFiles`를 함께 보내고, API는 파일별 문자열을 독립적으로 검사해 `sourceFileName`을 diagnostics에 붙인다. `terraformCode`는 단일 파일 호환용 입력이자 빈 코드 저장 의도 판별용 입력이다. Editor validation은 provider schema 전체를 재현하지 않으며, 실제 `terraform init`, `terraform validate`, `plan`, `apply`, `destroy`, backend/state mutation은 Deployment 실행 경계에서만 다룬다.

```ts
type TerraformDiagnosticSeverity = "info" | "warning" | "error";

type TerraformDiagnostic = {
  severity: TerraformDiagnosticSeverity;
  message: string;
  code?: string;
  line?: number;
  sourceFileName?: string;
  resourceAddress?: string;
  nodeId?: string;
};

type TerraformValidateRequest = {
  terraformCode: string;
  terraformFiles?: TerraformSyncFileInput[];
};

type TerraformValidateResponse = {
  diagnostics: TerraformDiagnostic[];
};
```

Editor validation diagnostics는 Deployment의 `init`, `validate`, `plan`, `apply` stage와 섞지 않는다. Deployment 실행은 승인된 Terraform artifact와 AWS 연결을 기준으로 별도 안전 게이트를 가진다. Editor validation은 사용자 편집 코드가 저장 가능한지 확인하는 선행 검사일 뿐, 실제 cloud mutation을 의미하지 않는다.

## AwsConnection

`AwsConnection`은 프로젝트별 설정이 아니라 사용자 계정 단위의 AWS Role 연결이다. 사용자는 환경설정에서 AWS 계정을 한 번 연결하고, 각 프로젝트의 Deployment 흐름에서는 검증된 연결을 선택해 재사용한다.

같은 사용자가 같은 AWS `accountId`를 `verified` 상태로 중복 연결할 수 없도록 `userId + accountId` partial unique index를 둔다. `pending` 연결은 아직 accountId를 모르기 때문에 생성될 수 있지만, verify 시점에 이미 연결된 AWS account면 실패 처리한다.

새 AWS 연결을 만들면 사용자별 오래된 미검증 연결을 정리한다. 기본 정책은 `pending`/`failed` 연결 중 최신 5개를 남기고 나머지를 삭제하는 것이다. `verified` 연결과 `Deployment`가 참조 중인 연결은 자동 정리 대상에서 제외한다.

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
  currentPlanOperation: "apply" | "destroy" | null;
  stateObjectKey: string | null;
  resultWarningSummary: string | null;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED" | "DESTROYED";
  activeStage: "init" | "validate" | "plan" | "apply" | "destroy" | null;
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
    | "destroy"
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

Apply가 성공하면 `terraform output -json`, `terraform show -json`, `terraform.tfstate` S3 업로드를 순서대로 시도한다.
실제 AWS Apply가 성공했다면 이 단계 중 일부가 실패해도 Deployment는 `SUCCESS`로 유지하고 apply stage 로그에 경고를 남긴다.

`stateObjectKey`에는 S3에 업로드한 `terraform.tfstate` object key를 저장한다. state 업로드에 실패하면 `null`일 수 있다.
`terraform show -json` 기반 resource inventory는 현재 `SUCCESS` 저장 전에 `TerraformOutput`과 함께 저장한다.

`terraform apply tfplan`이 시작된 뒤 실패하거나 취소되면 로컬 `terraform.tfstate`를 best-effort로 S3에 저장하고,
성공하면 `stateObjectKey`를 남긴다. 이 상태의 Deployment는 `FAILED`와 `failureStage: "apply"`를 유지하며,
사용자가 명시적으로 cleanup을 실행할 때 `terraform plan -destroy` → 승인 → destroy apply 순서로 정리한다.
Destroy가 성공하면 Deployment는 `DESTROYED`가 되고, `stateObjectKey`, 현재 Plan pointer, 배포 리소스, output을 정리한다.

실행 중인 Deployment는 `activeStage`와 `startedAt`을 가진다. 실행이 끝나면 `activeStage`는
`null`로 돌아가고 `completedAt`을 저장한다. 실패는 `failedAt`, 사용자가 취소를 요청한 시점은
`cancelRequestedAt`, 실제 취소 완료 시점은 `cancelledAt`에 저장한다.

한 프로젝트에는 동시에 하나의 `RUNNING` Deployment만 허용한다. 이 제약은 애플리케이션 체크와
`deployments_project_running_unique` partial unique index를 함께 사용해 보장한다.

Deployment 생성 후에는 프로젝트 단위 retention을 실행한다. 기본 정책은 최신 Deployment 기록 20개,
사용 중이지 않은 최신 TerraformArtifact 5개, 사용 중이지 않은 최신 ArchitectureSnapshot 5개를
남긴다. 다만 `RUNNING`, `SUCCESS`, `stateObjectKey`가 남은 `FAILED`, `failureStage: "destroy"`인
`FAILED` Deployment는 실제 리소스 확인이나 cleanup 재시도에 필요할 수 있으므로 개수 제한을 넘어도
삭제하지 않는다. 삭제되는 Deployment의 `DeploymentPlanArtifact`, `DeploymentLog`,
`DeployedResource`, `TerraformOutput`은 DB cascade로 함께 정리하고, S3 object는 best-effort로 삭제한다.

## DeploymentPlanArtifact

`DeploymentPlanArtifact`는 사용자가 승인할 수 있는 특정 Terraform Plan 파일의 metadata다. `tfplan` 바이너리는 S3에 저장하고, RDS에는 object key와 hash, Plan 생성 시점의 Terraform artifact hash, 실행 계정/region만 저장한다. Terraform plan/show의 raw JSON 전체는 저장하지 않는다.

DB 기준: `deployment_plan_artifacts`

```ts
type DeploymentPlanArtifact = {
  id: string;
  deploymentId: string;
  terraformArtifactId: string;
  terraformArtifactSha256: string | null;
  operation: "apply" | "destroy";
  objectKey: string;
  sha256: string;
  accountId: string;
  region: string;
  createdAt: IsoDateTimeString;
};
```

`terraformArtifactSha256`은 Plan 생성 시점에 복원한 Terraform artifact 내용을 기준으로 계산한다. 컬럼은 기존 row 마이그레이션을 위해 nullable이지만, 새 Plan은 반드시 값을 저장해야 하며 hash가 없는 Plan artifact는 승인할 수 없다. Approval 단계는 현재 S3 Terraform artifact hash와 이 값을 비교해 Plan 생성 이후 원본 Terraform artifact가 바뀐 경우 승인을 막는다.

`operation`은 해당 `tfplan`이 일반 apply용인지 cleanup destroy용인지 구분한다. Apply 실행은 `operation: "apply"` Plan만,
destroy 실행은 `operation: "destroy"` Plan만 사용할 수 있다.

`deployment_plan_artifacts.deployment_id`는 `deployments.id`를 FK로 참조한다. `deployments.current_plan_artifact_id`는 현재 승인 대상 Plan을 가리키는 nullable pointer이며, 같은 Deployment의 artifact인지 여부는 Deployment service에서 검증한다.

API 응답의 `Deployment.currentPlanOperation`은 `current_plan_artifact_id`가 가리키는 Plan artifact의 `operation`을 펼쳐서 내려주는 읽기용 필드다. 프론트엔드는 이 값으로 apply plan과 destroy plan을 구분해 Apply 버튼과 Destroy 버튼을 분리한다.

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

Plan summary는 사용자 승인 화면에 필요한 최소 요약이다. 현재 기본 흐름에서는 `terraform plan -out=tfplan` 이후 `terraform show -json tfplan` 결과의 `resource_changes`를 파싱해 생성한다.

사용자가 승인한 plan과 apply 대상 plan은 같은 artifact/hash 기준이어야 한다.

MVP Direct Deployment Path live apply는 안전 범위를 위해 아래 Terraform resource type만 허용한다.
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

이 목록은 Apply 완료 저장 시 `TerraformOutput`과 함께 같은 Deployment 범위로 교체 저장한다.
다만 `terraform show -json`이 실패하거나 취소되면 실제 AWS Apply는 성공으로 유지되고, 리소스 목록은 빈 값으로 저장될 수 있다.

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
  stage: "init" | "validate" | "plan" | "apply" | "destroy";
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  relatedResourceId: string | null;
  createdAt: IsoDateTimeString;
};
```

로그는 sequence 순서를 보장한다. message에는 credential, token, password, DB URL, sensitive output이 남지 않아야 한다.

## Git/CI/CD Handoff

`GitCicdHandoff`는 `IaC Preview`를 Source Repository와 외부 pipeline으로 넘기는 팀 운영 배포 경로의 metadata다. Direct Deployment Path를 대체하는 것이 아니라 운영 배포용 별도 경로다.

```ts
type GitCicdHandoffStatus =
  | "draft"
  | "pr_created"
  | "pipeline_running"
  | "pipeline_success"
  | "pipeline_failed"
  | "cancelled";

type GitCicdHandoff = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  sourceRepositoryId: string;
  pullRequestUrl: string | null;
  pipelineRunUrl: string | null;
  status: GitCicdHandoffStatus;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

Git/CI/CD handoff도 `UserAcceptedChange` 이후에만 생성한다. 저장소 토큰, private key, CI secret 원문은 shared type, DB, 로그에 저장하지 않는다.

## Reverse Engineering Scan

`ReverseEngineeringScan`은 Provider Adapter를 통해 기존 cloud Resource를 읽고 Practice Architecture와 import suggestion을 만드는 작업 단위다. MVP는 AWS adapter부터 구현할 수 있지만 모델은 provider-neutral하게 둔다.

```ts
type ReverseEngineeringScanStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

type ReverseEngineeringScan = {
  id: string;
  projectId: string;
  provider: CloudProvider;
  status: ReverseEngineeringScanStatus;
  architectureId: string | null;
  errorSummary: string | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

스캔 결과가 만든 Practice Architecture와 import suggestion은 사용자가 확인하기 전까지 기존 프로젝트 상태를 덮어쓰지 않는다.

## Runtime Cache

Redis 기반 Runtime Cache는 Deployment, Reverse Engineering, Git/CI/CD Integration 같은 long-running workflow의 status/cache/log streaming 보조에 사용한다. Runtime Cache 데이터는 원천 기록이 아니며, 최종 기록은 RDS/S3에 저장한다.

Runtime Cache는 사용자 Practice Architecture Resource가 아니므로 `ResourceType`에 Redis를 추가하지 않는다. AI 결과 캐싱은 2순위이며, 캐시된 결과가 deterministic validation이나 Deployment Safety Gate를 대체할 수 없다.

## AI 결과 DTO

AI는 원천 진실이 아니라 설명과 제안 계층이다. 배포 가능한 artifact는 deterministic graph, generator, validation, Terraform CLI 결과를 거쳐야 한다.

AI provider 응답에는 호출 출처와 비용 추적을 위한 metadata를 함께 둔다. Bedrock, Amazon Q Business, Amazon Transcribe는 `AI_BILLING_MODE=aws_credit_only`와 provider별 credit confirmation flag가 모두 충족될 때만 실제 호출한다. 조건이 맞지 않으면 provider 호출 없이 fallback 설명이나 실패 상태를 반환한다.

```ts
type AiProvider =
  | "bedrock"
  | "amazon_q"
  | "amazon_transcribe"
  | "openai"
  | "fallback";

type AiProviderMetadata = {
  provider: AiProvider;
  service:
    | "bedrock_runtime"
    | "amazon_q_business"
    | "amazon_transcribe"
    | "openai_responses"
    | "rule_fallback";
  model?: string;
  routeTarget: string;
  cacheHit: boolean;
  cacheKey: string;
  estimatedUsage: {
    inputCharacters: number;
    inputTokensEstimate: number;
    outputCharacters?: number;
    outputTokensEstimate?: number;
  };
  billingMode: "aws_credit_only" | "standard" | "disabled";
  generatedAt: IsoDateTimeString;
};
```

```ts
type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
  llmExplanation?: LlmExplanation;
};
```

Natural Language Diagramming의 `ArchitectureDraft`는 LLM 자유 생성이 아니라 규칙 기반 요구사항 fact 조립으로 만든다. 같은 Requirement Prompt는 같은 `ArchitectureJson`을 반환해야 한다. `LlmExplanation` 문구는 보조 설명이므로 결정성 기준에 포함하지 않는다.

```ts
type CreateArchitectureDraftRequest = {
  prompt: string;
};

type ArchitectureRequirementFact =
  | "web_frontend"
  | "static_delivery"
  | "server_runtime"
  | "database"
  | "object_storage"
  | "file_upload"
  | "auth_or_user_data"
  | "serverless_runtime"
  | "network_boundary"
  | "iam_permissions"
  | "observability"
  | "encryption";

type ArchitectureDraftPattern =
  | "static_site"
  | "api_server"
  | "backend_with_db"
  | "server_storage"
  | "serverless_function";
```

`selectedDraftPattern`은 UI와 LLM 설명을 위한 대표 패턴 라벨이다. 생성 기준은 패턴 점수가 아니라 `requirementFacts` 조합이며, 같은 fact 조합은 같은 리소스 조립 순서와 같은 node/edge id를 사용한다.

`ArchitectureDraft`가 자동 생성하는 node type은 `ResourceType` 중 `UNKNOWN`을 제외한 지원 목록으로 제한한다. 현재 지원 목록은 `VPC`, `SUBNET`, `INTERNET_GATEWAY`, `ROUTE_TABLE`, `ROUTE_TABLE_ASSOCIATION`, `EC2`, `RDS`, `S3`, `SECURITY_GROUP`, `CLOUDFRONT`, `LAMBDA`, `AMI`, `IAM_ROLE`, `IAM_POLICY`, `IAM_INSTANCE_PROFILE`, `KMS_KEY`, `CLOUDWATCH_LOG_GROUP`, `CLOUDWATCH_METRIC_ALARM`, `API_GATEWAY_REST_API`, `LAMBDA_PERMISSION`이다.

Requirement Prompt에서 지원 가능한 아키텍처 단서나 대체 가능한 요구사항을 찾지 못하면 `ArchitectureDraft`를 생성하지 않고 `400 bad_request`로 되돌린다. 보조 선택값은 `CreateArchitectureDraftRequest` 계약에서 제거되었으며, 명확한 자연어 단서 없이 기본 초안을 강제로 만들지 않는다.

`웹사이트 하나 배포하고 싶어`처럼 대상은 아키텍처와 관련 있지만 화면만 필요한지, 방문자 입력/파일 업로드가 필요한지, 로그인/데이터 저장이 필요한지 알 수 없는 요구사항은 곧바로 `static_site`로 단정하지 않는다. Workspace AI는 전문 용어 대신 쉬운 질문과 추천 답안을 차례로 보여주고, 답변을 모아 구현 리스트를 확인받은 뒤 사용자가 진행을 승인할 때만 자연어 `prompt`를 다시 구성해 `ArchitectureDraft`를 요청한다. 질문에서는 `S3`, `EC2`, `RDS`, `IAM` 같은 내부 리소스 이름을 먼저 묻지 않고, 비용 영향과 보호 범위를 사용자 언어로 설명한다.

예산, 방문자 규모, 보호 수준은 별도 보조 선택값이 아니라 자연어 단서에서 `operatingProfile`로 계산된다. 예를 들어 `저렴하게`, `처음엔`, `방문자 증가`, `개인정보 보호` 같은 표현은 EC2/RDS 크기, CloudFront price class, 로그 보존 기간, public access block, deletion protection 같은 지원 가능한 config 차이로 반영된다.

`metadata.guardrailWarnings`는 AI 초안 카드 하단에 표시할 경고 계약이다.

```ts
type ArchitectureGuardrailWarningCode =
  | "unsupported_resource_omitted"
  | "unsupported_requirement_substituted"
  | "partial_generation"
  | "guardrail_adjusted_config"
  | "board_replacement_required"
  | "low_budget_rds_cost";
```

`LlmExplanation`은 rule 기반 결과를 덮어쓰지 않고, 사용자가 읽기 쉬운 요약과 다음 행동을 붙이는 공통 설명 계약이다. Bedrock, Amazon Q Business, OpenAI legacy/fallback provider 호출이 실패하거나 일부 필드가 rule 기반 기본값으로 대체되면 `fallbackUsed`를 `true`로 둔다.

```ts
type LlmExplanation = {
  target:
    | "architecture_draft"
    | "design_simulation"
    | "pre_deployment_check"
    | "terraform_error_explanation"
    | "terraform_preview_explanation"
    | "architecture_patch_preview";
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
    | "invalid_response"
    | "provider_not_configured"
    | "credit_not_confirmed"
    | "daily_limit_exceeded";
  providerMetadata?: AiProviderMetadata;
};
```

`AiArchitectureDraftResult`, `AiPreDeploymentAnalysisResult`, `DesignSimulationResult`, `AiTerraformErrorExplanationResult`는 필요할 때 `llmExplanation?: LlmExplanation`를 포함할 수 있다.

자연어 Architecture 수정 요청은 `ArchitecturePatchPreview`로만 반환한다. 이 preview는 `proposedArchitectureJson`과 diff 성격의 `changes`를 보여줄 뿐이며, `requiresUserAcceptance: true`와 `userAcceptedChange: null` 상태로 내려간다. 실제 Architecture Board 반영은 별도 적용 버튼에서 `UserAcceptedChange`를 기록한 뒤에만 가능하다.

```ts
type ArchitecturePatchIntent = {
  instruction: string;
  requestedAction: "add_resource" | "remove_resource" | "modify_resource" | "manual_review";
  targetResourceId?: string;
  resourceType?: ResourceType;
};

type ArchitecturePatchPreview = {
  intent: ArchitecturePatchIntent;
  baseArchitectureJson: ArchitectureJson;
  proposedArchitectureJson: ArchitectureJson;
  changes: ArchitecturePatchPreviewChange[];
  requiresUserAcceptance: true;
  userAcceptedChange: UserAcceptedChange | null;
  llmExplanation?: LlmExplanation;
  providerMetadata: AiProviderMetadata;
};
```

Voice Requirement Input은 Amazon Transcribe 작업 결과가 나온 뒤에도 곧바로 `RequirementPrompt`가 되지 않는다. 전사 결과는 `TranscribeConfirmation`으로 내려가고, 사용자가 확인/수정/확정한 뒤에만 `RequirementPrompt`가 생성된다.

```ts
type VoiceRequirementInput = {
  mediaUri: string;
  mediaFormat: "mp3" | "mp4" | "wav" | "flac" | "ogg" | "amr" | "webm";
  languageCode?: string;
};

type TranscribeConfirmation = {
  transcriptionJobName: string | null;
  voiceRequirementInput: VoiceRequirementInput | null;
  transcriptText: string | null;
  confirmedText: string | null;
  confirmedByUser: boolean;
  confirmedByUserId?: string;
  status: "transcribing" | "awaiting_user_confirmation" | "confirmed" | "failed";
  failureReason?: string;
  providerMetadata: AiProviderMetadata;
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
