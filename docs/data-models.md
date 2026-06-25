# 데이터 모델

이 문서는 SketchCatch에서 DB 테이블, API DTO, 프론트 상태 객체가 같은 의미로 쓰이도록 맞춘 공통 데이터 모델 기준이다.

## 결론

사용자가 제안한 모델 방향은 타당하다. 특히 `Project`, `ResourceNode`, `ResourceEdge`, `TerraformCode`, `Deployment`처럼 팀원이 서로 다른 이름으로 구현하면 API 연결 단계에서 깨질 수 있는 영역을 먼저 고정해야 한다는 판단이 맞다.

다만 현재 SketchCatch의 실제 구현과 제품 전략을 기준으로 아래처럼 수정한다.

- MVP 초반은 로그인 사용자가 아니라 `AnonymousWorkspace` 기반이다. `User`는 인증 도입 시 추가한다.
- `Diagram`은 DB에 이미 `architectures` 테이블로 들어가 있다. 공통 타입 이름은 `ArchitectureSnapshot`으로 두고, 화면에서는 다이어그램 또는 보드라고 불러도 된다.
- 저장되는 아키텍처 JSON은 `nodes`와 `edges`를 가진 `ArchitectureJson`으로 고정한다.
- 편집 중인 최신 보드 draft는 `ProjectDraft`로 분리하고, 화면 복구용 `DiagramJson`을 저장한다.
- Terraform 원문은 RDS `content` 컬럼에 저장하지 않는다. IaC 파일은 S3에 두고, RDS/API에는 `ProjectAsset` 또는 `TerraformArtifact` 메타데이터와 `objectKey`를 저장한다.
- 실제 AWS 배포 실행은 후순위다. 3주 안에 구현할 `Deployment`는 통제된 배포/연습 세션 상태 기록 또는 모의 실행 이력으로 제한하고, 프론트에서 AWS SDK를 직접 호출하지 않는다.

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
| `workspace_id` | `workspaceId` |
| `created_at` | `createdAt` |
| `architecture_json` | `architectureJson` |

## MVP 모델

3주 안에 구현을 끝내는 일정에서는 아래 모델을 모두 3주차 종료 전까지 코드 기준으로 맞춘다. 다만 `User`, `AwsCredential`, 실제 AWS apply 실행은 인증/권한/비용 사고 방지 설계가 필요하므로 별도 명시가 있을 때만 포함한다.

권장 순서:

| 주차 | 구현 모델 | 목적 |
| --- | --- | --- |
| 1주차 | `AnonymousWorkspace`, `Project`, `ArchitectureSnapshot`, `ArchitectureJson`, `ResourceNode`, `ResourceEdge` | 프로젝트 생성과 보드 저장 기준 확정 |
| 2주차 | `ProjectAsset`, `TerraformArtifact` | 다이어그램 이미지, Terraform 파일, export 산출물 저장 |
| 3주차 | `Deployment`, `Template` | 모의/통제된 실행 이력과 템플릿 공유 기준 확정 |

### AnonymousWorkspace

현재 인증이 없으므로 프로젝트 소유자는 `User`가 아니라 익명 워크스페이스다.

```ts
type AnonymousWorkspace = {
  id: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `anonymous_workspaces`

### Project

사용자가 만드는 인프라 설계 프로젝트다.

```ts
type Project = {
  id: string;
  workspaceId: string;
  userId?: string;
  name: string;
  description: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `projects`

`userId`는 인증 도입 후 마이그레이션할 수 있도록 선택값으로 둔다. 현재 MVP에서는 `workspaceId`가 필수 소유자 키다.

프로젝트 목록 페이지는 현재 인증 사용자 대신 `clientGeneratedWorkspaceId`를 기준으로 조회한다. 인증이 붙은 화면에서는 API의 `resolveProjectOwner` 연결 지점이 request session에서 `userId`를 제공하고, 서버는 `projects.user_id` 기준으로 프로젝트를 조회한다.

```ts
type ProjectListResponse = {
  projects: Project[];
};
```

인증이 도입되면 클라이언트가 임의의 `userId`를 보내지 않는다. 인증 담당 코드가 서버 request에서 사용자 정보를 읽어 `resolveProjectOwner`로 `{ userId, workspaceId }`를 넘기고, 프로젝트 생성/목록/상세/draft 저장 API는 이 owner 정보로 소유권을 검증한다. `workspaceId`가 없고 `userId`만 있으면 API는 내부 호환용 workspace id를 `user:<userId>` 형태로 파생한다.

### ArchitectureSnapshot

다이어그램의 저장 단위다. 사용자가 보드에서 수정할 때마다 새 버전을 만들 수 있으므로 `version`을 가진 스냅샷으로 본다.

```ts
type ArchitectureSnapshot = {
  id: string;
  projectId: string;
  version: number;
  source: "manual" | "prompt_mock" | "imported" | string;
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
  type: "VPC" | "EC2" | "RDS" | "S3" | "LAMBDA" | "UNKNOWN";
  label?: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
};
```

`config`는 리소스별 설정을 담는 확장 필드다. 예를 들어 EC2는 `instanceType`, `ami`, RDS는 `engine`, `instanceClass`처럼 서로 다른 값을 가질 수 있다.

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
  projectId: string;
  diagramJson: DiagramJson;
  revision: number;
  serverSavedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `project_drafts`

`diagramJson`은 화면 복구를 위해 노드 크기, 스타일, viewport, 파라미터 값을 포함한다. 스냅샷 저장이나 IaC 분석처럼 서버 기준 확정 데이터가 필요할 때는 별도 변환 또는 스냅샷 API를 사용한다.

DB-backed 프로젝트 편집 화면은 `projectId`와 `clientGeneratedWorkspaceId`로 `GET /api/projects/:id/draft`를 호출해 최신 draft를 불러오고, 편집 중에는 `PUT /api/projects/:id/draft`로 같은 `DiagramJson`을 저장한다. 인증 API owner resolver가 연결된 경우 `clientGeneratedWorkspaceId` 없이도 같은 endpoint가 session 사용자 기준으로 동작한다. 브라우저 IndexedDB는 네트워크 실패나 새로고침 복구를 위한 보조 캐시이며, 제품 기준 저장 원천은 RDS의 `project_drafts`다.

인증 담당 팀이 붙일 서버 연결 지점:

```ts
buildApp({
  resolveProjectOwner: async (request) => {
    const session = await readSession(request);

    return {
      userId: session.userId,
      workspaceId: session.workspaceId
    };
  }
});
```

세션에 안정적인 `workspaceId`가 아직 없으면 `userId`만 반환해도 된다.

```ts
buildApp({
  resolveProjectOwner: async (request) => {
    const session = await readSession(request);

    return {
      userId: session.userId
    };
  }
});
```

프로젝트 페이지 담당 팀이 붙일 프론트 연결 지점:

```tsx
<ProjectWorkspaceDraftManager
  projectId={project.id}
  projectName={project.name}
/>
```

인증 session이 없는 익명 workspace 화면에서는 `workspaceId`를 함께 넘긴다.

```tsx
<ProjectWorkspaceDraftManager
  projectId={project.id}
  projectName={project.name}
  workspaceId={clientGeneratedWorkspaceId}
/>
```

### 팀 간 Interface 계약

팀원이 동시에 작업할 때는 구현 파일을 직접 의존하지 말고 아래 Interface를 기준으로 붙인다.

- 리소스 팔레트는 `ResourceCatalogProvider.listResources()`를 통해 `ResourceItem[]`을 제공한다. 새 AWS 리소스 항목을 추가하는 팀은 catalog와 parameter catalog를 맞추고, 캔버스 팀은 `ResourceItem`만 사용한다.
- 프로젝트 편집 화면은 `ProjectDraftRepository.load/save`를 통해 `DiagramJson` draft를 불러오고 저장한다. IndexedDB 복구와 서버 저장 우선순위는 repository 구현 안에 둔다.
- API route는 `ProjectRepository`를 통해 `Project`, `ArchitectureSnapshot`, `ProjectDraft`, `ProjectAsset`을 다룬다. route handler는 HTTP validation과 status code 변환만 담당한다.

`DiagramJson`은 화면 draft 복구용 계약이다. 노드 크기, 스타일, viewport, Terraform 파라미터 입력값처럼 편집기 상태를 포함한다. `ArchitectureJson`은 snapshot, IaC 분석, 비용/위험 규칙이 보는 확정 아키텍처 계약이며 `ResourceNode`와 `ResourceEdge` 중심으로 유지한다. 두 타입은 목적이 다르므로 자동으로 같은 의미로 취급하지 않는다.

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

통제된 배포 또는 연습 세션의 실행 이력이다. 3주차까지는 모의 실행, dry-run, 제한된 demo 상태 기록으로 구현한다. 실제 AWS apply 기능은 명시적으로 설계될 때까지 후순위이며, 프론트에서 직접 AWS SDK를 호출하지 않는다.

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

커뮤니티 공유용 템플릿이다. 3주 일정에서는 보드 저장이 안정된 뒤 3주차 안에 추가한다.

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

아래 모델은 3주 안에 모든 기능을 끝내더라도 기본 구현 범위에서 분리한다. 이유는 CRUD 난이도보다 보안/권한/운영 정책 결정이 더 중요하기 때문이다.

### User

인증 도입 후 추가한다. 공유 타입의 `User`에는 `passwordHash`를 넣지 않는다.

```ts
type User = {
  id: string;
  email: string;
  nickname: string;
  createdAt: IsoDateTimeString;
};
```

DB 내부 테이블에는 `password_hash`가 있을 수 있지만, API DTO와 프론트 상태 객체로 노출하지 않는다.

### AwsCredential

실제 AWS 연결이 필요해질 때 추가한다. 초반 MVP에는 넣지 않는다.

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
| `AnonymousWorkspace` | `anonymous_workspaces` | 구현됨 |
| `Project` | `projects` | 구현됨 |
| `ArchitectureSnapshot` | `architectures` | 구현됨 |
| `ArchitectureJson` | `architectures.architecture_json` | 공유 패키지에 타입 정의됨 |
| `ResourceNode` | `architectureJson.nodes` 내부 객체 | 공유 패키지에 타입 정의됨 |
| `ResourceEdge` | `architectureJson.edges` 내부 객체 | 공유 패키지에 타입 정의됨 |
| `ProjectDraft` | `project_drafts` | 구현됨 |
| `ProjectAsset` | `project_assets` | 구현됨 |
| `TerraformArtifact` | `project_assets.asset_type = "terraform_file"` | 저장 모델 구현됨 |
| `Deployment` | 향후 table/API | 3주차 구현 대상 |
| `Template` | 향후 table/API | 3주차 구현 대상 |
| `User` | 향후 auth table/API | 후순위 |

## 팀 작업 규칙

새 API나 프론트 상태를 만들기 전에 먼저 `packages/types/src/index.ts`에 공통 타입을 추가하거나 수정한다. 그 다음 API의 Zod schema, DB schema, 프론트 상태 타입이 같은 필드명을 따르는지 확인한다.

특히 아래 이름은 바꾸지 않는다.

- `projectId`
- `workspaceId`
- `architectureId`
- `architectureJson`
- `nodes`
- `edges`
- `sourceId`
- `targetId`
- `objectKey`
