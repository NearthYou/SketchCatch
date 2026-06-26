# 데이터 모델

이 문서는 SketchCatch에서 DB 테이블, API DTO, 프론트 상태 객체가 같은 의미로 쓰이도록 맞춘 공통 데이터 모델 기준이다.

## 결론

사용자가 제안한 모델 방향은 타당하다. 특히 `Project`, `ResourceNode`, `ResourceEdge`, `TerraformCode`, `Deployment`처럼 팀원이 서로 다른 이름으로 구현하면 API 연결 단계에서 깨질 수 있는 영역을 먼저 고정해야 한다는 판단이 맞다.

다만 현재 SketchCatch의 실제 구현과 제품 전략을 기준으로 아래처럼 수정한다.

- 익명 로그인과 `AnonymousWorkspace`는 도입하지 않는다. 프로젝트 소유자는 인증된 `User`이고, API는 `Authorization: Bearer <accessToken>` 기준으로 권한을 확인한다.
- `Diagram`은 DB에 이미 `architectures` 테이블로 들어가 있다. 공통 타입 이름은 `ArchitectureSnapshot`으로 두고, 화면에서는 다이어그램 또는 보드라고 불러도 된다.
- 저장되는 아키텍처 JSON은 `nodes`와 `edges`를 가진 `ArchitectureJson`으로 고정한다.
- 편집 중인 최신 보드 draft는 `ProjectDraft`로 분리하고, 화면 복구용 `DiagramJson`을 저장한다.
- 자연어 요구사항에서 추출한 예산, 트래픽, 런타임, DB, 가용성, 보안 우선순위는 후속 `RequirementConstraint` 모델로 분리할 수 있다.
- 비용·성능 시뮬레이션 결과는 1차 제공에서 최소 DTO로 시작하고, 후속 `DesignSimulationResult` 모델로 분리한다.
- AI 수정 제안은 자동 적용 결과가 아니라 사용자가 diff를 보고 승인해야 하는 `AiChangeProposal` 후보 모델로 다룬다.
- Terraform 원문은 RDS `content` 컬럼에 저장하지 않는다. IaC 파일은 S3에 두고, RDS/API에는 `ProjectAsset` 또는 `TerraformArtifact` 메타데이터와 `objectKey`를 저장한다.
- 실제 AWS 배포 실행은 2차 제공 범위다. 1차 제공에서 다룰 `Deployment`는 통제된 배포/연습 세션 상태 기록 또는 모의 실행 이력으로 제한하고, 프론트에서 AWS SDK를 직접 호출하지 않는다.
- 실제 AWS 계정 연결은 `AwsConnection`으로 표현한다. 현재 구현 범위는 Role Assume 설정에 필요한 `callerPrincipalArn`과 서버 생성 `externalId`를 제공하는 pending 연결 생성, 저장 없는 STS 연결 테스트, 저장형 verify metadata 업데이트, Terraform 실행 전 임시 credential env 준비, deployment init의 임시 credential env 주입까지다. Access Key ID, Secret Access Key, session token은 공유 타입, DB, API 응답에 넣지 않는다.

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

3주 안에 구현을 끝내는 일정에서는 아래 모델을 모두 3주차 종료 전까지 코드 기준으로 맞춘다. 다만 `AwsConnection`, 실제 AWS apply 실행은 인증/권한/비용 사고 방지 설계가 필요하므로 별도 명시가 있을 때만 포함한다.

권장 순서:

| 단계 | 구현 모델 | 목적 |
| --- | --- | --- |
| 1차 초반 | `User`, `Project`, `ArchitectureSnapshot`, `ArchitectureJson`, `ResourceNode`, `ResourceEdge` | 인증된 사용자 기준 프로젝트 생성과 보드 저장 기준 확정 |
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

`userId`는 필수 소유자 키다. `clientGeneratedWorkspaceId`, `anonymousWorkspaces`, `workspaceId`는 로그인 기반 정책과 맞지 않으므로 사용하지 않는다.

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

### ProjectDraft

편집 중인 프로젝트의 최신 draft다. `ArchitectureSnapshot`이 버전 기록이라면, `ProjectDraft`는 새로고침과 탭 종료 후 작업 복구를 위한 최신 편집본이다.

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

DB에서는 `id`를 PK로 두고, `projectId`는 `projects.id`를 참조하는 FK이자 UNIQUE 값으로 둔다. 이렇게 하면 프로젝트당 최신 draft 1개를 유지하면서도 다른 테이블이 draft 자체를 참조할 수 있는 안정적인 키를 가진다.

`diagramJson`은 화면 복구를 위해 노드 크기, 스타일, viewport, Terraform 파라미터 입력값을 포함한다. DB에는 AWS 리소스별 파라미터를 컬럼으로 쪼개지 않고 `project_drafts.diagram_json` JSONB 컬럼에 `DiagramJson` 전체를 저장한다.

로그인 기반 프로젝트 편집 화면은 `GET /api/projects/:id/draft`로 최신 draft를 불러오고, `PUT /api/projects/:id/draft`로 같은 `DiagramJson`을 저장한다. 권한 검증은 `Authorization: Bearer <accessToken>`에서 확인한 현재 사용자와 `projects.user_id`를 비교해 수행한다.

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

통제된 배포 또는 연습 세션의 실행 이력이다. 현재는 Terraform artifact를 기준으로 deployment record와 log를 남기고, init 단계에서는 verified AWS connection으로 임시 credential을 받아 Terraform child process env에만 주입한다. 실제 AWS apply 기능은 2차 제공으로 두며, 프론트에서 직접 AWS SDK를 호출하지 않는다.

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
  failureStage: "init" | "validate" | "plan" | "approval" | "mock_run" | null;
  errorSummary: string | null;
  approvedAt: IsoDateTimeString | null;
  approvedByUserId: string | null;
  approvedTerraformArtifactId: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `deployments`

DB enum 이름은 범용 `status`가 아니라 `deployment_status`를 사용한다. Terraform 검증 단계 이름은 로그와 실패 기록 모두 `validate`로 통일한다. `approvedByUserId`는 `users.id`를 참조하는 FK이며, 사용자 기반 승인 이력을 문자열 이름이 아니라 회원 id로 관리한다.

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

### AwsConnection

실제 AWS 연결이 필요해질 때 추가한다. 기본 방식은 사용자가 자기 AWS 계정에 IAM Role을 만들고, SketchCatch backend가 나중에 `sts:AssumeRole`로 임시 권한을 받아 쓰는 구조다.

현재 구현 범위는 pending 연결을 만들고 사용자에게 Role trust policy에 넣을 값을 제공한 뒤, STS 연결 테스트와 저장형 verify API로 연결 metadata를 검증/저장하는 단계다. `externalId`는 사용자가 직접 정하는 값이 아니라 SketchCatch가 connection 단위로 생성한다.

```ts
type AwsConnectionStatus = "pending" | "verified" | "failed";

type AwsConnection = {
  id: string;
  projectId: string;
  userId: string;
  accountId: string | null;
  roleArn: string | null;
  externalId: string;
  region: string;
  status: AwsConnectionStatus;
  lastVerifiedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

type CreateAwsConnectionRequest = {
  region: string;
};

type AwsRolePermissionSetup = {
  verificationActions: string[];
  initialPolicyDocument: Record<string, unknown> | null;
  terraformPolicyDocument: Record<string, unknown> | null;
};

type AwsRoleSetup = {
  roleName: string;
  trustedPrincipalArn: string;
  externalId: string;
  trustPolicy: Record<string, unknown>;
  permissionSetup: AwsRolePermissionSetup;
};

type SketchCatchCallerRoleSetup = {
  policyName: string;
  assumableRoleArnPattern: string;
  policyDocument: Record<string, unknown>;
};

type CreateAwsConnectionResponse = {
  awsConnection: AwsConnection;
  callerPrincipalArn: string;
  recommendedRoleName: string;
  roleSetup: AwsRoleSetup;
  callerRoleSetup: SketchCatchCallerRoleSetup;
  trustPolicyTemplate: Record<string, unknown>;
};

type TestAwsConnectionRequest = {
  roleArn: string;
  externalId: string;
  region: string;
};

type TestAwsConnectionResponse = {
  ok: true;
  accountId: string;
  callerArn: string;
  region: string;
};

type VerifyAwsConnectionRequest = {
  roleArn: string;
};

type VerifyAwsConnectionResponse = TestAwsConnectionResponse & {
  awsConnection: AwsConnection;
};

type AwsConnectionCloudFormationTemplateResponse = {
  roleName: string;
  stackName: string;
  region: string;
  capabilities: ["CAPABILITY_NAMED_IAM"];
  templateBody: string;
  templateUrl: string | null;
  templateUrlExpiresAt: IsoDateTimeString | null;
  launchStackUrl: string | null;
};
```

`roleSetup`은 사용자가 자기 AWS 계정에서 IAM Role을 만들 때 UI가 그대로 보여줄 묶음이다. `roleName`은 추천 Role 이름이고, `trustedPrincipalArn`은 trust policy의 `Principal.AWS`, `externalId`는 `Condition.StringEquals["sts:ExternalId"]`, `trustPolicy`는 AWS 콘솔에 붙여 넣을 JSON template이다.

`roleSetup.permissionSetup`은 사용자 AWS 계정의 target role에 처음부터 큰 권한을 붙이지 않기 위한 안내 계약이다. 연결 검증 단계에서는 `AssumeRole` 성공 후 임시 credential로 `sts:GetCallerIdentity`만 확인하므로 `initialPolicyDocument`는 `null`이다. Terraform `plan/apply`까지 갈 때 필요한 권한은 설계된 리소스 범위가 확정된 뒤 `terraformPolicyDocument` 쪽에서 별도로 제안하거나 검증한다.

`callerRoleSetup`은 SketchCatch backend가 실행되는 caller role에 운영자가 붙여야 하는 최소 policy template이다. 현재는 추천 role 이름을 `SketchCatchTerraformExecutionRole`로 고정하고 `arn:aws:iam::*:role/SketchCatchTerraformExecutionRole`에 대해서만 `sts:AssumeRole`을 허용한다. 운영에서는 verify API에서 확인된 role ARN 목록만 허용하도록 더 좁힌다.

pending 상태에서는 아직 사용자 target role이 저장되지 않았으므로 `accountId`와 `roleArn`은 `null`이다. verified 상태가 되면 `accountId`, `roleArn`, `lastVerifiedAt`, `status = "verified"`가 저장된다. 실패하면 `status = "failed"`로 저장하되 raw AWS credential은 저장하지 않는다.

`POST /api/aws/connections/test`는 저장 없이 연결 테스트만 수행한다. 요청으로 받은 `roleArn`, `externalId`, `region`을 사용해 STS `AssumeRole`을 호출하고, 반환된 임시 credential로 STS `GetCallerIdentity`를 호출한다. 그 뒤 같은 role을 `externalId` 없이 다시 assume해 보고, 성공하면 trust policy가 잘못 열린 것으로 보고 거부한다. 응답에는 `ok`, `accountId`, `callerArn`, `region`만 포함한다. 임시 credential의 `accessKeyId`, `secretAccessKey`, `sessionToken`은 DB, API 응답, 프론트 상태에 넣지 않는다.

`POST /api/projects/:projectId/aws-connections/:connectionId/verify`는 DB에 저장된 `externalId`와 사용자가 보낸 `roleArn`으로 STS 검증을 수행한 뒤 검증 metadata를 저장한다. `roleArn`의 account id와 `GetCallerIdentity`의 account id가 다르거나, 저장된 region이 `ap-northeast-2`가 아니거나, `externalId`가 비어 있거나, externalId 없이도 role이 assume되면 verified 저장을 거부한다.

`GET /api/projects/:projectId/aws-connections/:connectionId/cloudformation-template`는 사용자가 IAM 콘솔에서 Role을 수동으로 만들지 않도록 CloudFormation Role 생성 템플릿을 내려준다. 응답의 `templateBody`는 즉시 복사/저장할 수 있는 YAML이고, `SKETCHCATCH_PUBLIC_BASE_URL`이 설정되어 있으면 `templateUrl`과 AWS Console `launchStackUrl`도 함께 내려간다. `templateUrl`은 만료되는 서명 token으로 보호되는 public read URL이며, CloudFormation이 이 URL을 읽어 `SketchCatchTerraformExecutionRole` stack을 만들 수 있게 한다. 이 API도 AWS 리소스를 직접 생성하지 않고, 생성 승인은 사용자 AWS 계정의 CloudFormation 화면에서 사용자가 수행한다.

DB에는 `aws_connections` 테이블을 사용한다. 저장하는 값은 `projectId`, `userId`, `externalId`, `region`, `status`, 검증 metadata다. Access Key ID, Secret Access Key, session token은 저장하지 않는다.

Terraform init은 deployment project의 최신 verified AWS connection을 조회한 뒤 매번 verified `roleArn`과 `externalId`로 다시 `AssumeRole`하고, externalId 없이도 role이 assume되는지 다시 확인한다. 받은 임시 credential은 Terraform child process env로만 전달한다. plan/apply가 연결되면 같은 계약을 사용하되, apply 전에는 승인 당시 `accountId`, `region`, `tfplanHash`와 실행 시점 값을 다시 비교해 drift가 있으면 차단한다.

### DeploymentLog

배포 워커 또는 통제된 실행 기능이 생긴 뒤 추가한다.

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

DB 기준: `deployment_logs`

`deploymentId`와 `sequence` 조합은 UNIQUE 제약으로 보호한다. 같은 배포 안에서 같은 순번의 로그가 중복 저장되지 않아야 화면과 감사 이력이 같은 순서를 재현할 수 있다.

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
| `ProjectDraft` | `project_drafts.diagram_json` | 구현됨 |
| `ProjectAsset` | `project_assets` | 구현됨 |
| `TerraformArtifact` | `project_assets.asset_type = "terraform_file"` | 저장 모델 구현됨 |
| `Deployment` | `deployments`, `deployment_logs`, `/api/projects/:projectId/deployments`, `/api/deployments/:deploymentId`, `/api/deployments/:deploymentId/init`, `/api/deployments/:deploymentId/logs` | Terraform artifact 기준 실행 이력, init 실행, 로그 저장 구현됨 |
| `AwsConnection` | `aws_connections`, `/api/projects/:projectId/aws-connections`, `/api/projects/:projectId/aws-connections/:connectionId/cloudformation-template`, `/api/aws/connections/cloudformation-template`, `/api/aws/connections/test`, `/api/projects/:projectId/aws-connections/:connectionId/verify` | Role Assume 설정값 제공, CloudFormation Role 생성 템플릿 제공, STS 연결 테스트, 저장형 verify, deployment init credential 주입 구현됨 |
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
