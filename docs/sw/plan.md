# SW Terraform 구현 계획

이 문서는 `docs/sw/spec.md`를 실제 구현 가능한 마일스톤으로 나눈 계획이다. 현재 브랜치 `feature/sw/28-terraform-editor-validation`은 #27 변환기 구현 위에서 시작했고, 최신 `dev`에는 deployment init, project draft 저장 구조, workspace 컴포넌트 분리 변경이 들어와 있다.

이번 #28 문서 기준은 다음과 같다.

- #27에서 P0-P3는 이미 구현된 baseline으로 본다.
- #28은 P4 정적 diagnostics와 Terraform editor 표시를 구현한다.
- deployment init/terraform-runner는 배포 실행 준비 흐름이며, #28의 정적 문법 검증과 섞지 않는다.
- workspace Terraform UI는 이제 `AiWorkspaceClient.tsx` 본문이 아니라 `TerraformPreviewPanel.tsx`와 props로 분리되어 있다.

## 현재 dev 반영 사항

- 워크스페이스/프로젝트 소유자는 익명이 아니다. API에서 저장 데이터에 접근하는 단계는 `requireActiveUserId`와 `projects.user_id` 기준 권한 검사를 따른다.
- 현재 공통 저장 JSON은 `ArchitectureJson`이고, DB에는 `architectures.architecture_json`으로 저장된다.
- 최신 draft 저장 구조는 `project_drafts.diagram_json`과 `ProjectDraft` 타입으로 구현되어 있다. 로그인 기반 화면은 `GET /api/projects/:id/draft`, `PUT /api/projects/:id/draft`를 통해 `DiagramJson`을 저장/복구할 수 있다.
- #28의 `/terraform/validate`는 draft DB를 직접 읽지 않는다. 사용자가 textarea에서 편집 중인 `{ terraformCode }` request body만 검증한다.
- 현재 `project_assets`는 `architecture_id`만 갖고 있고 `draft_id`는 없다. Terraform 파일 artifact 저장은 후속 저장/불러오기 PR 이후 다시 설계한다.
- `dev`에는 deployment init stage와 `terraform-runner`, `terraform-workspace`가 들어와 있다. 이는 실제 배포 실행 쪽 코드이며, #28의 정적 diagnostics API에서 호출하지 않는다.
- 웹 API 호출은 `apps/web/lib/api-client.ts`의 `apiFetch(..., { auth: true })` 패턴을 우선한다.
- workspace의 AI API 데모 호출은 `apps/web/app/workspace/workspace-api-client.ts`의 `postJson`을 쓰지만, Terraform generate/validate처럼 인증이 필요한 API는 계속 `apiFetch`를 쓴다.

## Baseline. #27에서 완료된 범위

아래 항목은 #28에서 다시 만들지 않는다. 문서나 이슈 설명에서 “새로 구현”처럼 보이면 “기존 기반 위에 확장”으로 고친다.

### P0. DiagramJson shared type

- `packages/types/src/index.ts`에 `DiagramJson`, `DiagramNode`, `DiagramEdge`, `DiagramNodeParameters`, `TerraformBlockType` 계열 타입이 있다.
- 실제 canonical type은 `packages/types/src/index.ts`다.
- 현재 타입은 화면 렌더링용 필드를 포함하는 rich type이므로, 문서 예시의 단순 type만 보고 필드를 줄이지 않는다.

### P1. 순수 Terraform 변환기

- `apps/api/src/services/terraform/diagram-to-terraform.ts`
- 공개 함수: `generateTerraformFromDiagramJson(diagramJson: DiagramJson): string`
- DB, S3, filesystem, Terraform CLI, AWS SDK를 호출하지 않는 deterministic pure service다.

### P2. 인증된 generate API wrapper

- endpoint: `POST /api/terraform/generate`
- request: `{ diagramJson }`
- response: `{ terraformCode }`
- route handler는 인증, Zod validation, response shaping만 담당한다.

### P3. 웹 Terraform editor/preview

- workspace 화면은 샘플 `DiagramJson`을 `/terraform/generate`로 보내고 Terraform textarea에 결과를 표시한다.
- 샘플 `DiagramJson`은 `apps/web/app/workspace/sample-diagram-json.ts`로 분리되어 있다.
- Terraform textarea와 preview UI는 `apps/web/app/workspace/TerraformPreviewPanel.tsx`로 분리되어 있고, `AiWorkspaceClient.tsx`가 state와 API 호출을 소유한다.
- 기존 AI 설명 생성 흐름과 Terraform 코드 생성 흐름은 역할을 분리한다.

## P4. #28 정적 문법 검증 diagnostics

목표: 사용자가 textarea에서 수정한 Terraform 문자열을 실제 Terraform CLI 없이 빠르게 점검하고, editor 아래에 diagnostics를 표시한다.

### 1. shared diagnostics type 추가

수정 파일:

- `packages/types/src/index.ts`

추가 타입:

```ts
export type TerraformDiagnosticSeverity = "info" | "warning" | "error";

export type TerraformDiagnostic = {
  severity: TerraformDiagnosticSeverity;
  message: string;
  code?: string | undefined;
  line?: number | undefined;
  resourceAddress?: string | undefined;
  nodeId?: string | undefined;
};

export type TerraformValidateRequest = {
  terraformCode: string;
};

export type TerraformValidateResponse = {
  diagnostics: TerraformDiagnostic[];
};
```

완료 조건:

- API route와 웹에서 같은 diagnostics response type을 import할 수 있다.
- deployment의 `DeploymentStage`/`DeploymentFailureStage` enum을 재사용하지 않는다.

### 2. pure diagnostics service 추가

수정 파일:

- `apps/api/src/services/terraform/terraform-diagnostics.ts`
- `apps/api/src/services/terraform/terraform-diagnostics.test.ts`

공개 함수:

```ts
export function createTerraformDiagnostics(terraformCode: string): TerraformDiagnostic[]
```

구현 디테일:

- 입력 문자열만 받아 diagnostics 배열을 반환한다.
- DB, S3, filesystem, Terraform CLI, AWS SDK를 호출하지 않는다.
- error가 있어도 throw하지 않고 diagnostics로 반환한다.
- v1에서는 HCL 전체 parser를 만들지 않고, 생성기가 만든 Terraform subset과 편집 중 흔한 실수를 정적으로 검사한다.

검사 항목:

- 빈 코드: `error`, code `terraform.empty`
- 중괄호/대괄호/따옴표 불균형: `error`, code `terraform.unbalanced`
- top-level block header가 `resource "type" "name" {` 또는 `data "type" "name" {`가 아니면 `error`, code `terraform.block_header`
- 같은 `resource.type.name` 또는 `data.type.name`이 두 번 나오면 `warning`, code `terraform.duplicate_address`
- `"aws_vpc.main.id"`처럼 따옴표 안에 Terraform reference가 있으면 `warning`, code `terraform.quoted_reference`
- block body가 비어 있으면 `warning`, code `terraform.empty_block`

완료 조건:

- 정상 생성 결과에는 error diagnostic이 없다.
- 깨진 HCL 입력은 사람이 이해할 수 있는 message와 가능하면 line을 포함한다.
- 함수가 같은 입력에 항상 같은 diagnostics를 반환한다.

### 3. validate API endpoint 추가

수정 파일:

- `apps/api/src/routes/terraform.ts`
- `apps/api/src/routes/terraform.test.ts`

endpoint:

- `POST /api/terraform/validate`
- request body: `{ terraformCode: string }`
- response body: `{ diagnostics: TerraformDiagnostic[] }`
- 인증: `/terraform/generate`와 동일하게 `requireActiveUserId`

구현 디테일:

- 기존 `registerTerraformRoutes` 안에 endpoint를 추가한다.
- Zod schema는 `terraformCode: z.string()`만 요구한다.
- 실제 Terraform CLI를 호출하지 않는다.
- route handler는 인증, body parse, service 호출, response shaping만 담당한다.

완료 조건:

- 인증된 요청은 diagnostics 배열을 받는다.
- 인증이 없으면 `401 unauthorized`를 받는다.
- body가 잘못되면 `400 bad_request`를 받는다.

### 4. workspace editor UI 연결

수정 파일:

- `apps/web/app/workspace/AiWorkspaceClient.tsx`
- `apps/web/app/workspace/TerraformPreviewPanel.tsx`
- 필요하면 `apps/web/app/workspace/terraform-diagnostics-view.tsx`

구현 디테일:

- `AiWorkspaceClient.tsx`는 `terraformCode`, diagnostics state, loading/error state, `runTerraformValidation` handler를 소유한다.
- `runTerraformValidation`은 `apiFetch<TerraformValidateResponse>("/terraform/validate", { method: "POST", auth: true, body: { terraformCode } })`로 호출한다.
- `TerraformPreviewPanel.tsx`는 `onTerraformValidate`, `terraformDiagnostics`, `isValidatingTerraform`, `terraformDiagnosticsError`, `hasStaleTerraformDiagnostics` 같은 props를 받아 버튼과 표시 영역만 렌더링한다.
- `onTerraformCodeChange`를 감싸서 Terraform 코드가 수정되면 이전 diagnostics를 stale 상태로 바꾸거나 초기화한다.
- diagnostics는 severity별로 구분해서 textarea 아래에 표시한다.
- `workspace-api-client.ts`의 `postJson`은 AI demo API용이므로 Terraform validate 호출에 사용하지 않는다.
- 기존 “코드 설명 생성” 버튼은 AI 설명용으로 유지하고, 정적 검증 버튼과 역할을 섞지 않는다.

완료 조건:

- 사용자가 샘플 변환 후 Terraform 코드를 수정하고 문법 점검을 누를 수 있다.
- diagnostics가 없으면 성공 상태를 보여준다.
- warning/error가 있으면 severity, message, line/resourceAddress를 확인할 수 있다.
- API 실패 메시지는 기존 `getApiErrorMessage` 패턴과 맞다.

## P5. 코드 수정 사항을 DiagramJson에 반영

목표: 생성기가 만든 제한된 HCL subset을 다시 `DiagramJson.parameters.values`에 반영한다. #28에서는 구현하지 않고 후속 #29에서 진행한다.

핵심 방향:

- 지원 범위는 `resource`와 `data` block, 단순 attribute, map, list로 제한한다.
- block identity는 `(resourceType, resourceName)`으로 찾는다.
- 기존 node를 찾으면 `parameters.values`만 갱신한다.
- 파싱이 불확실하면 `DiagramJson`을 변경하지 않고 diagnostic을 반환한다.
- edge 생성은 하지 않고 기존 `edges`를 유지한다.

## P6. 저장/불러오기 이후 DB/S3 연결

목표: 현재 구현된 draft 저장 구조와 후속 Terraform artifact 저장 흐름을 연결한다. #28에서는 구현하지 않는다.

현재 dev 기준:

- 프로젝트 소유권: `users -> projects`
- 현재 저장 snapshot: `architectures.architecture_json`
- 현재 편집 draft: `project_drafts.diagram_json`
- 현재 asset metadata: `project_assets`
- 현재 Terraform artifact 타입: `asset_type = "terraform_file"`

후속 연결 방향:

- 저장된 편집 상태를 Terraform으로 변환할 때는 `GET /api/projects/:id/draft`로 `ProjectDraft.diagramJson`을 읽는 흐름을 우선 검토한다.
- `ArchitectureJson`에서 `DiagramJson`으로 변환하는 adapter는 기존 snapshot만 가진 프로젝트를 지원해야 할 때 별도 이슈에서 다룬다.
- 생성된 Terraform 원문은 S3에 저장한다.
- RDS에는 `project_assets.object_key` 같은 metadata만 저장한다.
- `project_assets`는 현재 `architecture_id` 중심이므로 draft 기반 artifact 연결에 `draft_id`가 필요한지는 별도 migration 이슈에서 결정한다.
- 실제 `apply`와 `destroy`는 별도 명시 이슈 없이 추가하지 않는다.

## 우선순위 요약

1. 완료: P0-P3 shared type, pure converter, generate API, workspace preview
2. 현재 #28: P4 정적 diagnostics type/service/API/UI/test
3. 후속 #29: P5 제한된 코드 to DiagramJson 동기화
4. 후속 저장 이슈: P6 저장/불러오기 PR 이후 DB/S3 연결
