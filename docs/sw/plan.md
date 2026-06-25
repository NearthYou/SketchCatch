# SW Terraform 변환 구현 계획

이 문서는 `docs/sw/spec.md`를 실제 구현 가능한 마일스톤으로 나눈 계획이다. `dev` 병합 이후 로그인/회원 소유권과 현재 DB schema가 들어왔으므로, 순수 변환기는 그대로 먼저 만들고 DB/S3 연결은 현재 구현 상태와 후속 draft 구조를 분리해서 진행한다.

## dev 병합 후 반영 사항

- 워크스페이스/프로젝트 소유자는 더 이상 익명이 아니다. API에서 프로젝트나 저장 데이터에 접근하는 단계는 `requireActiveUserId`와 `projects.user_id` 기준 권한 검사를 따른다.
- 현재 공통 저장 JSON은 `ArchitectureJson`이고, DB에는 `architectures.architecture_json`으로 저장된다.
- 현재 `project_drafts` 테이블과 `diagram_json` 컬럼은 없다. 따라서 순수 변환기와 API wrapper는 DB를 직접 읽지 않고 `{ diagramJson }` 요청 본문만 받는다.
- 현재 `project_assets`는 `architecture_id`만 갖고 있고 `draft_id`는 없다. Terraform 파일 artifact를 지금 저장한다면 `asset_type = "terraform_file"`과 `architecture_id` 기준으로 연결한다.
- 나중에 `project_drafts.diagram_json`이 들어오면 `draft_id`를 `project_assets`에 추가할지, 기존 `architecture_id`만 유지할지 별도 migration/이슈에서 결정한다.
- 웹에는 `apps/web/lib/api-client.ts`가 있으므로 새 Terraform API 호출은 `apiFetch(..., { auth: true })` 사용을 우선한다.

## P0. DiagramJson shared type 추가

목표: SW 변환기, API, 웹 UI가 같은 입력 계약을 쓰도록 `DiagramJson` 계열 타입을 `packages/types`에 추가한다.

수정 파일:

- `packages/types/src/index.ts`

구현 디테일:

- 기존 `ArchitectureJson`, `ResourceNode`, `ResourceEdge`는 유지한다.
- `TerraformBlockType = "resource" | "data"`를 추가한다.
- `DiagramJson`, `DiagramNode`, `DiagramEdge`, `DiagramNodeParameters`를 추가한다.
- `DiagramNode.parameters.values`는 `Record<string, unknown>`으로 둔다.
- `ArchitectureJson`과 `DiagramJson`은 현재 별도 계약이다. 둘을 섞지 말고, 필요하면 후속 adapter 함수로 연결한다.

완료 조건:

- `DiagramJson` 타입을 API와 웹에서 import할 수 있다.
- 사용자 제공 입력 계약과 필드명이 일치한다.
- 기존 `ArchitectureJson` 관련 코드가 깨지지 않는다.

## P1. 순수 Terraform 변환기 구현 및 테스트

목표: `DiagramJson` 객체를 입력으로 받아 Terraform 코드 문자열을 반환하는 순수 함수를 만든다.

수정 파일:

- `apps/api/src/services/terraform/diagram-to-terraform.ts`
- `apps/api/src/services/terraform/diagram-to-terraform.test.ts`

구현 디테일:

- 공개 함수는 `generateTerraformFromDiagramJson(diagramJson: DiagramJson): string`로 둔다.
- `kind !== "resource"`, `parameters` 없음, `invalid === true` 노드는 제외한다.
- `terraformBlockType` 기본값은 `"resource"`다.
- top-level `values` key는 `camelCase`에서 `snake_case`로 바꾼다.
- `aws_vpc.main.id` 같은 Terraform reference 문자열은 따옴표 없이 출력한다.
- 일반 문자열, number, boolean, null, object, array를 HCL 값으로 재귀 렌더링한다.
- 정렬은 입력 node 순서를 유지한다.
- DB, S3, filesystem, Terraform CLI, AWS SDK를 호출하지 않는다.

완료 조건:

- `aws_vpc`, `aws_subnet` 샘플이 기대 HCL로 변환된다.
- skip 조건, `data` block, nested object, array, Terraform reference 테스트가 통과한다.
- 함수가 같은 입력에 항상 같은 출력을 반환한다.

## P2. 인증된 API wrapper 연결

목표: 웹에서 변환기를 호출할 수 있도록 얇은 API endpoint를 만든다.

수정 파일:

- `apps/api/src/routes/terraform.ts`
- `apps/api/src/routes/terraform.test.ts`
- `apps/api/src/app.ts`

구현 디테일:

- `registerTerraformRoutes`를 만들고 `app.ts`에서 `prefix: "/api"`로 등록한다.
- 우선 endpoint는 `POST /api/terraform/generate`로 둔다.
- request body는 `{ diagramJson: DiagramJson }`다.
- response는 `{ terraformCode: string }`다.
- route handler는 인증, Zod validation, response shaping만 담당하고 변환은 service에 위임한다.
- 저장 데이터 접근은 없더라도 제품 정책상 로그인 사용자를 기준으로 `requireActiveUserId`를 호출한다.
- 나중에 프로젝트 기반 저장 데이터 조회 endpoint를 만들면 `projects.user_id` 기준 권한 검사를 추가한다.

완료 조건:

- 로그인한 요청은 Terraform 문자열을 받는다.
- 인증이 없으면 `401 unauthorized`를 받는다.
- 잘못된 body는 `400 bad_request`를 받는다.
- route test가 현재 Fastify/Zod 에러 처리 방식과 맞다.

## P3. 웹 Terraform editor/preview 연결

목표: workspace에서 `DiagramJson` 샘플을 변환하고 Terraform 코드를 확인할 수 있게 한다.

수정 파일:

- `apps/web/app/workspace/AiWorkspaceClient.tsx`
- 필요 시 `apps/web/lib/terraform-api.ts`

구현 디테일:

- 초기에는 DB 저장 데이터 대신 샘플 `DiagramJson`을 사용한다.
- API 호출은 가능하면 `apiFetch<{ terraformCode: string }>("/terraform/generate", { method: "POST", auth: true, body: { diagramJson } })` 형태로 만든다.
- 결과 Terraform 코드는 기존 Terraform textarea/editor 상태에 표시한다.
- loading, error, empty 상태를 표시한다.
- 프론트엔드에서는 Terraform CLI, AWS SDK, S3 upload를 직접 실행하지 않는다.
- 기존 workspace의 AI fallback 호출 방식과 충돌하면 Terraform API helper를 별도 파일로 분리한다.

완료 조건:

- 로그인한 사용자가 샘플 다이어그램을 Terraform 코드로 변환해 볼 수 있다.
- API 실패 메시지가 기존 `getApiErrorMessage` 패턴과 맞다.
- 기존 AI draft/preview UI가 깨지지 않는다.

## P4. 정적 문법 검증 diagnostics

목표: 실제 Terraform CLI 없이 1차 정적 검증 결과를 사용자에게 보여준다.

수정 파일:

- `apps/api/src/services/terraform/terraformDiagnostics.ts`
- `apps/api/src/routes/terraform.ts`
- 관련 테스트

구현 디테일:

- brace 균형, 빈 block name, 지원하지 않는 top-level block, 명백한 reference 문자열 형식을 검사한다.
- `TerraformDiagnostic` 타입은 `packages/types`에 추가한다.
- diagnostic은 `severity`, `message`, 선택 `resourceAddress`를 포함한다.
- 이 단계의 stage 이름은 deployment enum과 섞지 않는다.
- 실제 `terraform validate`는 후속 backend/worker 이슈에서만 추가한다.

완료 조건:

- 정상 생성 결과는 error diagnostic이 없다.
- 일부 깨진 HCL 입력은 warning/error diagnostic을 반환한다.
- 웹 editor 아래에 diagnostic이 표시된다.

## P5. 제한된 HCL subset 기반 코드 to DiagramJson 동기화

목표: 생성기가 만든 Terraform subset을 다시 `DiagramJson.parameters.values`에 반영할 수 있게 한다.

수정 파일:

- `apps/api/src/services/terraform/terraformToDiagram.ts`
- `apps/api/src/routes/terraform.ts`
- 관련 테스트

구현 디테일:

- 지원 범위는 `resource`와 `data` block, 단순 attribute, map, list로 제한한다.
- block identity는 `(resourceType, resourceName)`으로 찾는다.
- 기존 node를 찾으면 `parameters.values`만 갱신한다.
- 파싱이 불확실하면 `DiagramJson`을 변경하지 않고 diagnostic을 반환한다.
- edge 생성은 하지 않는다. 기존 `edges`를 유지한다.

완료 조건:

- 생성기 output을 수정하면 같은 node의 `values`가 갱신된다.
- 알 수 없는 block이나 복잡한 expression은 안전하게 거절한다.
- 지원 범위와 거절 사유가 diagnostic으로 설명된다.

## P6. 저장/불러오기 이후 DB/S3 연결

목표: 저장/불러오기 PR이 들어온 뒤 실제 project data와 Terraform artifact 저장 흐름을 연결한다.

현재 dev 기준:

- 프로젝트 소유권: `users -> projects`
- 현재 저장 snapshot: `architectures.architecture_json`
- 현재 asset metadata: `project_assets`
- 현재 Terraform artifact 타입: `asset_type = "terraform_file"`

구현 선택지:

- 선택 A: `ArchitectureJson`에서 `DiagramJson`으로 변환하는 adapter를 두고, 현재 `architectures.architecture_json`을 읽어 변환한다.
- 선택 B: 후속 저장/불러오기 PR에서 `project_drafts.diagram_json`을 추가하고, 변환기는 그 컬럼만 읽는다.

선택 B를 택하면 필요한 DB 변경:

- `project_drafts.id` PK
- `project_drafts.project_id -> projects.id`
- `project_drafts.diagram_json`
- 필요 시 `project_assets.draft_id -> project_drafts.id`

완료 조건:

- 저장된 다이어그램을 불러와 Terraform 파일을 생성할 수 있다.
- 생성된 Terraform 원문은 S3에 저장한다.
- RDS에는 `project_assets.object_key` 같은 metadata만 저장한다.
- 실제 `apply`와 `destroy`는 별도 명시 이슈 없이 추가하지 않는다.

## 우선순위 요약

1. P0, P1: DB와 무관한 shared type과 순수 변환기
2. P2: 인증된 API wrapper
3. P3: 웹 editor/preview 연결
4. P4: 정적 diagnostics
5. P5: 제한된 코드 to 다이어그램 동기화
6. P6: 저장/불러오기 PR 이후 DB/S3 연결
