# SW Terraform 변환 구현 계획

이 문서는 `docs/sw/spec.md`를 실제 구현 가능한 마일스톤으로 나눈다. 우선순위는 DB 연동 없이 검증 가능한 순수 변환기부터 시작하고, 이후 API, UI, 검증, 동기화, 저장 연동 순서로 확장한다.

## P0. DiagramJson shared type 추가

목표: SW 변환기, API, 웹 UI가 같은 입력 계약을 쓰도록 `DiagramJson` 계열 타입을 공유 타입에 추가한다.

수정 파일:

- `packages/types/src/index.ts`

구현 디테일:

- `TerraformBlockType = "resource" | "data"`를 추가한다.
- `DiagramJson`, `DiagramNode`, `DiagramEdge`, `DiagramNodeParameters`를 추가한다.
- `DiagramNode.parameters.values`는 `Record<string, unknown>`으로 둔다.
- 기존 `ArchitectureJson`은 제거하거나 이름 변경하지 않는다.

완료 조건:

- 타입이 API와 웹에서 import 가능하다.
- `DiagramJson` 필드명은 사용자 제공 계약과 일치한다.
- 민감값을 위한 별도 필드는 추가하지 않는다.

## P1. 순수 Terraform 변환기 구현 및 테스트

목표: `DiagramJson` 객체를 입력으로 받아 Terraform 코드 문자열을 반환하는 순수 함수를 만든다.

수정 파일:

- `apps/api/src/services/terraform/diagramToTerraform.ts`
- `apps/api/src/services/terraform/diagramToTerraform.test.ts`

구현 디테일:

- 공개 함수는 `generateTerraformFromDiagramJson(diagramJson: DiagramJson): string`로 둔다.
- `kind !== "resource"`, `parameters` 없음, `invalid === true` 노드는 제외한다.
- `terraformBlockType` 기본값은 `"resource"`로 둔다.
- `camelCase` key를 `snake_case` attribute로 변환한다.
- `aws_vpc.main.id` 형태의 Terraform reference는 따옴표 없이 출력한다.
- 일반 문자열, number, boolean, object, array를 HCL로 재귀 렌더링한다.
- 정렬은 입력 node 순서를 유지한다.

완료 조건:

- `aws_vpc`, `aws_subnet` 샘플이 기대 HCL로 변환된다.
- skip 조건, `data` block, nested object, array, Terraform reference 테스트가 통과한다.
- 함수는 DB, S3, filesystem, Terraform CLI, AWS SDK를 호출하지 않는다.

## P2. API wrapper 연결

목표: 웹에서 변환기를 호출할 수 있도록 얇은 API endpoint를 만든다.

수정 파일:

- `apps/api/src/routes/terraform.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/terraform.test.ts`

구현 디테일:

- `POST /api/terraform/generate`를 추가한다.
- request body는 `{ diagramJson: DiagramJson }`로 받는다.
- response는 `{ terraformCode: string }`로 반환한다.
- Zod schema는 shared type 필드명과 맞춘다.
- route handler는 validation과 response shaping만 담당하고 변환은 service에 위임한다.

완료 조건:

- 유효한 `DiagramJson` 요청에 Terraform 문자열을 반환한다.
- 빈 nodes, design-only nodes, invalid resource nodes도 실패하지 않고 빈 문자열 또는 유효한 결과를 반환한다.
- 잘못된 body는 400을 반환한다.

## P3. 웹 Terraform editor/preview 연결

목표: workspace에서 `DiagramJson` 샘플을 변환하고 Terraform 코드를 확인할 수 있게 한다.

수정 파일:

- `apps/web/app/workspace/AiWorkspaceClient.tsx`
- 필요 시 작은 helper 또는 component 파일

구현 디테일:

- 초기에는 저장된 DB 데이터 대신 샘플 `DiagramJson`을 사용한다.
- 버튼 클릭 시 `POST /api/terraform/generate`를 호출한다.
- 결과 Terraform 코드는 textarea 기반 editor에 표시한다.
- UI는 변환 API 호출과 결과 표시만 담당한다.
- 프론트엔드에서 Terraform CLI나 AWS SDK를 직접 호출하지 않는다.

완료 조건:

- 사용자가 샘플 다이어그램을 Terraform 코드로 변환해 볼 수 있다.
- loading, error, empty 상태가 표시된다.
- 기존 AI fallback 화면과 충돌하지 않는다.

## P4. 정적 문법 검증 diagnostics

목표: 실제 Terraform CLI 없이 1차 정적 검증 결과를 사용자에게 보여준다.

수정 파일:

- `apps/api/src/services/terraform/terraformDiagnostics.ts`
- `apps/api/src/routes/terraform.ts`
- 관련 테스트

구현 디테일:

- brace 균형, 빈 block name, 지원하지 않는 top-level block, 명백한 reference 문자열 형식을 검사한다.
- API는 `{ diagnostics: TerraformDiagnostic[] }` 형태로 반환한다.
- diagnostic은 `severity`, `message`, 선택 `resourceAddress`를 포함한다.
- 실제 `terraform validate`는 후속 backend/worker 이슈에서만 추가한다.

완료 조건:

- 정상 생성 결과는 error diagnostic이 없다.
- 일부 깨진 HCL 입력은 warning/error diagnostic을 반환한다.
- diagnostic 결과가 웹 editor 아래에 표시된다.

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
- 파싱이 불확실하면 DiagramJson을 변경하지 않고 diagnostic을 반환한다.
- edge 생성은 하지 않는다. 연결 정보는 기존 `edges`를 유지한다.

완료 조건:

- 생성기 output을 수정한 뒤 같은 node의 `values`가 갱신된다.
- 알 수 없는 block이나 복잡한 expression은 안전하게 거절된다.
- 지원 범위 밖 입력은 사용자에게 diagnostic으로 설명된다.

## P6. 저장/불러오기 이후 DB/S3 연결

목표: 저장/불러오기 PR이 들어온 뒤 실제 project draft와 Terraform artifact 저장 흐름을 연결한다.

수정 파일:

- 저장/불러오기 PR의 실제 table, route, DTO 이름을 확인한 뒤 결정한다.

구현 디테일:

- `project_drafts.diagram_json`에서 `DiagramJson`을 읽어 변환 API에 연결한다.
- 생성된 Terraform 파일은 S3 `terraform_file` artifact로 저장한다.
- RDS에는 `ProjectAsset` 또는 `TerraformArtifact` metadata와 `objectKey`만 저장한다.
- Terraform 원문은 RDS에 영구 저장하지 않는다.

완료 조건:

- 저장된 다이어그램을 불러와 Terraform 파일을 생성할 수 있다.
- artifact metadata가 project, architecture 또는 draft 기준과 연결된다.
- 실제 `apply`나 `destroy`는 별도 명시 이슈 없이는 추가하지 않는다.
