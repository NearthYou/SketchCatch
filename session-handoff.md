# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 현재 검증된 것

- PR #137 충돌 해결을 위해 현재 feature branch에 `origin/dev`를 병합했다.
- `apps/api/src/app.ts`, `apps/api/src/routes/terraform.ts`, `apps/api/src/services/terraform/terraform-diagnostics.ts`의 conflict는 static-only Terraform editor validation 정책을 기준으로 해결했다.
- `origin/dev`의 `terraform-validation.ts`는 `terraform fmt` CLI를 호출하는 경로였으므로, CLI 검증 폐기 정책에 맞춰 병합 결과에서 제거했다.
- `origin/dev`의 정적 진단 보강 중 `unexpected_token`, `trailing_comma` 검사는 `terraform-diagnostics.ts`에 흡수했다.
- Terraform editor validation은 static-only diagnostics다.
- `/terraform/validate`는 `TerraformValidateResponse = { diagnostics }`만 반환한다.
- `/terraform/validate/prepare`, editor validation prepare/warmup, `mode`, `stage`, `status`, `projectId` DTO는 제거됐다.
- Editor validation은 Terraform CLI를 실행하지 않는다. `terraform init`, `terraform validate`, provider download, backend/state mutation은 editor 저장 검증 범위가 아니다.
- 정적 diagnostics는 빈 코드, `{}`/`[]`/`()` 균형, 닫히지 않은 문자열, block header, duplicate address, 잘못된 attribute line, nested block assignment, quoted reference, undefined local reference, shared definition 밖 AWS block을 검사한다.
- 일반 quoted string은 줄을 넘지 않는다. 닫히지 않은 문자열은 해당 줄에서 오류로 확정되고, 뒤쪽 resource header의 따옴표 때문에 오류 line이 밀리지 않는다.
- 닫히지 않은 문자열 때문에 뒤쪽 brace stack은 신뢰할 수 없으므로 `{}` 중괄호 오류를 연쇄로 함께 표시하지 않는다.
- `{}`/`[]`/`()`/문자열 balance 단계에서 error가 있으면 body/reference 검사를 중단한다. 단, 그보다 앞선 block header error는 함께 반환한다. 닫히지 않은 block 때문에 다음 resource header가 이전 block body 오류처럼 표시되지 않아야 한다.
- `/* ... */` block comment 안의 quote, brace, reference는 static diagnostics 대상이 아니다.
- Multi-file editor에서 `sourceFileName` 없는 diagnostic은 특정 파일 line highlight로 보정하지 않는다.
- 검증 중 코드가 바뀌면 오래된 검증 결과를 성공처럼 반영하지 않고 재검증 필요 diagnostics를 남긴다.
- Terraform leave modal에서 사용자가 계속 편집/폐기한 뒤 도착한 오래된 save completion은 현재 modal 상태를 덮지 않는다.
- Deployment artifact 저장은 Terraform panel에서 이미 검증한 source에 대해 중복 combined-code 검증을 건너뛸 수 있다.
- `InfrastructureGraphNode`는 더 이상 내부 `ResourceType` `type` 필드를 갖지 않는다.
- Terraform Preview API orchestration은 `terraform-preview.ts`가 담당하고, `diagram-to-terraform.ts`는 `InfrastructureGraph -> Terraform HCL` 렌더러로만 동작한다.
- `diagram-to-terraform.ts`는 더 이상 `DiagramJson` 또는 `buildInfrastructureGraphFromDiagramJson`를 import하지 않는다.
- Terraform Preview identity는 `iac.provider + iac.terraformBlockType + iac.resourceType + iac.resourceName` 기준이다.
- `iac.resourceType`은 `aws_instance`, `aws_vpc`, `aws_s3_bucket` 같은 provider-specific Terraform resource type을 그대로 유지한다.
- `ResourceType`은 AI/Architecture 분석용 domain classification으로 유지되며 Terraform Preview identity 기준이 아니다.
- Terraform IaC 리소스 지원 여부의 단일 출처는 `packages/types/src/resource-definitions.ts`의 shared `ResourceDefinition`이다.
- API와 Web은 `@sketchcatch/types/resource-definitions` subpath를 통해 같은 resource definition/capability를 사용한다.
- API는 web resource catalog를 import하지 않는다. Web catalog는 icon/category/label/size 같은 presentation 정보만 소유한다.
- `design_region`, `design_az`, `design_group` 같은 화면 전용 container node는 shared definition에 넣지 않고 web catalog에만 둔다.
- `terraformPreview` capability가 true인 리소스만 `InfrastructureGraph` preview node로 포함된다.
- `terraformSync` capability가 true인 리소스만 Terraform editor 구조 변경 proposal 대상이 된다.
- `aws_cloudfront_distribution`은 현재 `terraformPreview: false`, `terraformSync: true` 차이를 유지한다.
- Web catalog의 AWS Terraform 항목과 shared definition/parameter catalog drift 방지 테스트가 있다.
- InfrastructureGraph 중심 Workspace 동기화 v1 구현이 현재 브랜치에 커밋됐다.
- Terraform Preview 생성 경로는 `DiagramJson -> InfrastructureGraph -> Terraform`로 정리됐다.
- VPC/EC2/S3/AMI 계열 Preview와 Terraform sync 흐름은 focused API/Web 테스트, typecheck, lint, build를 통과했다.
- Terraform-only create proposal 자동 반영으로 생긴 새 DiagramJson node는 resource catalog의 `iconUrl`과 `nodeDefaults.size`를 사용한다.
- CloudFront draft/proposal도 `aws_cloudfront_distribution` catalog icon과 size를 사용할 수 있다.
- 기본 Palette는 `resourceCatalog`를 기본값으로 사용한다.
- Design area node도 catalog icon을 유지하며 area header에서 iconUrl을 사용할 수 있다.
- Terraform editor diagnostics는 `sourceFileName`을 가질 수 있고, multi-file validation에서 현재 파일 기준 빨간줄만 표시한다.
- Resource code 부분보기에서는 원본 파일 line을 부분 코드 line으로 보정해 빨간줄을 표시한다.
- Terraform 코드를 수정하면 stale diagnostics/Issues 상태가 즉시 비워진다.
- 오래된 async validation/save 응답은 code version guard로 새 코드 위에 다시 반영되지 않는다.
- 같은 Terraform identity의 `parameters.values` 변경은 Terraform editor 저장 시 DiagramJson에 반영된다.
- Create/delete/rename 구조 변경은 별도 변경 제안 확인 UI 없이 Terraform editor 저장 또는 배포 준비 action 안에서 자동 반영된다.
- Rename proposal 자동 반영 시 source file metadata가 `parameters.fileName`에 보존된다.
- Route Table/Internet Gateway/CloudFront 같은 sync 가능한 네트워크 리소스는 create/delete proposal 대상에 포함된다.
- Resource card Duplicate는 같은 resource type 안에서 `web_copy`, `web_copy_2`처럼 유니크한 Terraform resourceName을 만들고, 자동 생성 `tags.Name`도 함께 동기화한다.
- Diagram icon 삭제는 Terraform Preview에 즉시 반영된다. 마지막 아이콘 삭제도 빈 `main.tf`로 갱신되고, Terraform editor가 dirty 상태여도 삭제된 리소스 주소에 해당하는 block만 제거한다.
- Terraform editor 저장 sync action은 빈 Terraform 코드를 전체 삭제 의도로 처리한다. 지원 범위 안의 Diagram-only resource는 `delete_candidate`로 자동 반영되고, Diagram도 이미 비어 있으면 diagnostics 없이 저장 성공한다.
- 사용자가 보드에서 리소스 아이콘을 직접 추가하면 `parameters.values`는 `{}`로 시작한다. EC2 `instanceType`, VPC `cidrBlock`, `tags.Name` 같은 Terraform parameter 값은 사용자 입력, AI draft config, Terraform editor sync처럼 명시 입력이 있을 때만 채운다.
- 같은 리소스 아이콘을 반복 추가하면 같은 `resourceType` 안에서 `resourceName`이 `ec2_instance`, `ec2_instance_2`, `ec2_instance_3`처럼 숫자 suffix로 유니크하게 생성된다.
- 새로 생성되는 일반 리소스 icon node의 기본 크기는 `56x56`이다. VPC/Subnet/Security Group/Region/AZ/Group 같은 영역 node는 기존 영역 크기를 유지한다.
- Compact resource node는 generic `.nodeShell`의 `72px` 최소 높이를 상속하지 않아 `56x56` 아이콘이 빈 박스처럼 커지지 않는다.
- AI draft 변환은 `vpcId: "aws_vpc.main.id"`, `subnetId: "aws_subnet.public.id"` 같은 Terraform reference 문자열도 `(resourceType, resourceName)`으로 풀어 area parent metadata를 찾는다.
- Terraform 생성 API는 `resourceType`, `resourceName`, top-level/nested attribute/block key가 Terraform identifier 형식이 아니면 HCL을 만들기 전에 거부한다.
- Terraform 코드 에디터는 textarea 위에 read-only syntax highlight layer를 겹쳐 HCL keyword/reference/string/brace 색상을 표시하고, validation error line은 빨간 물결 밑줄로 표시한다.
- Terraform leave dialog에서 `저장하고 나가기`가 Terraform error diagnostics 때문에 실패하면, 모달을 닫고 오른쪽 Terraform 패널을 다시 보여줘 사용자가 물결 오류 표시를 확인할 수 있다.
- Terraform diagnostics가 있는 동안 Issues 탭/shortcut은 unsaved Terraform leave guard에 막히지 않고 바로 열릴 수 있다.
- Terraform leave dialog의 `저장하고 나가기` 시작 상태는 별도 status 문구를 띄우지 않고 버튼 disabled/`저장 중` 상태만 보여준다.
- Terraform generator 서비스는 HTTP 속성 없는 `TerraformDiagramValidationError`를 던지고, `/terraform/generate` 라우터가 이를 400 `bad_request`로 매핑한다.
- Terraform editor의 virtual file validation은 파일별 validate API를 `Promise.all`로 동시에 호출하지 않고 순차 실행한다.
- Diagnostic wavy underline helper는 더 이상 absolute `top` style을 계산하지 않고 표시 대상 line number만 반환한다.
- `cloneParameterValue`는 diagram/workspace 양쪽 중복 정의가 아니라 `apps/web/features/diagram-editor/parameter-value-utils.ts`를 공유한다.
- `docs/data-models.md`는 diagnostic/proposal source metadata와 proposal 지원 범위를 현재 코드에 맞게 기록한다.
- `feature_list.json`에는 동시에 `in_progress`인 항목이 없다.

## 이번 세션의 변경 사항

- `origin/dev` merge conflict를 해결했다.
- `apps/api/src/app.ts`와 `apps/api/src/routes/terraform.ts`는 `validateTerraformPreviewCode` 기반 static-only 검증 주입을 유지한다.
- `apps/api/src/services/terraform/terraform-diagnostics.ts`는 기존 no-cascade 진단에 `unexpected_token`, `trailing_comma` 정적 검사를 함께 실행한다.
- `apps/api/src/services/terraform/terraform-validation.ts`와 `terraform-validation.test.ts`는 editor CLI 검증 폐기 정책에 맞춰 제거 상태로 유지한다.
- `apps/api/src/services/terraform/terraform-diagnostics.ts`에서 일반 quoted string이 줄을 넘지 않도록 처리해, line 20의 누락 quote가 line 24 resource header로 밀려 표시되지 않게 했다.
- `apps/api/src/services/terraform/terraform-diagnostics.ts`에서 balance error가 있으면 뒤쪽 body/reference 검사를 중단해, line 17의 누락 `}`가 line 23 다음 resource에 파생 오류를 만들지 않게 했다.
- `apps/api/src/services/terraform/terraform-diagnostics.ts`가 block comment를 줄 보존 공백으로 처리하고, token error보다 앞선 block header error는 유지하게 했다.
- `apps/api/src/services/terraform/terraform-nested-blocks.ts`를 추가해 renderer/sync/parser/diagnostics가 공유하는 nested block support list를 단일화했다.
- `apps/api/src/services/terraform/terraform-diagnostics.test.ts`에 따옴표 하나 누락 시 `{}` 오류가 같이 뜨지 않는 케이스, line 20 누락 quote가 line 20으로 남는 케이스, virtual file source metadata 유지 케이스를 추가했다.
- `apps/api/src/services/terraform/terraform-diagnostics.test.ts`에 line 17 누락 `}` 때문에 line 23 다음 resource에 `terraform.attribute_syntax`가 같이 뜨지 않는 회귀 케이스를 추가했다.
- `apps/web/features/workspace/TerraformCodePanel.tsx`에서 숨겨진 Issues 복사본과 multi-file diagnostic source fallback을 정리했다.
- `apps/web/features/workspace/workspace.module.css`에서 사용하지 않는 Terraform editor CSS rule을 제거했다.
- `apps/web/features/workspace/terraform-diagnostic-line-highlights.test.ts`에 unclosed string diagnostic이 source line과 resource code offset에 맞게 표시되는 회귀 테스트를 추가했다.
- `packages/types/src/index.ts`에서 editor validation CLI mode/stage/status/prepare DTO를 제거하고 validate 계약을 `diagnostics` 중심으로 단순화했다.
- `apps/api/src/services/terraform/terraform-validation.ts`와 관련 테스트를 제거했다.
- `apps/api/src/deployments/terraform-runner.ts`에서 editor validation 전용 `runTerraformValidateJson` helper를 제거했다.
- `apps/api/src/routes/terraform.ts`에서 `/terraform/validate/prepare` endpoint와 `mode`/`projectId` 입력을 제거하고 static diagnostics만 반환하게 했다.
- `apps/api/src/services/terraform/terraform-diagnostics.ts`가 virtual file source metadata와 정적 diagnostics v1 강화 규칙을 담당하게 했다.
- `apps/web/features/workspace/TerraformCodePanel.tsx`에서 CLI 진행 bar, prepare 상태, full validation 호출을 제거하고 static validation만 호출하게 했다.
- `apps/web/features/workspace/workspace-deployment-artifacts.ts`가 artifact 저장 전 static validation만 요청하게 했다.
- API/Web tests에 CLI endpoint/mode 제거, static validation response, progress UI 제거, nested block assignment, duplicate address error, undefined reference warning 회귀 케이스를 추가했다.
- `docs/data-models.md`, `docs/sw/001_테라폼변환구현가이드_sw.md`, `docs/sw/003_테라폼동기화구조설명_sw.md`를 static-only editor validation 기준으로 갱신했다.
- `apps/api/src/services/terraform/terraform-preview.ts`를 추가해 `generateTerraformFromDiagramJson`을 `DiagramJson -> InfrastructureGraph -> Terraform` orchestration 함수로 옮겼다.
- `apps/api/src/services/terraform/diagram-to-terraform.ts`에서 `DiagramJson`/`buildInfrastructureGraphFromDiagramJson` import와 `generateTerraformFromDiagramJson` export를 제거했다.
- `/terraform/generate` route가 `generateTerraformFromDiagramJson`을 `terraform-preview.ts`에서 import하도록 변경했다.
- 기존 `DiagramJson` 기반 Terraform Preview 회귀 테스트를 `terraform-preview.test.ts`로 옮겼고, `diagram-to-terraform.test.ts`는 `InfrastructureGraph` renderer 단위 테스트와 source regression test로 정리했다.
- `docs/data-models.md`에 Terraform 생성 API 입력과 내부 pipeline, preview orchestrator와 renderer 책임 차이를 기록했다.
- `packages/types`의 `InfrastructureGraphNode`에서 `type: ResourceType`를 제거했다.
- `infrastructure-graph.ts`가 graph node에 `type: resourceDefinition.resourceType`를 넣지 않도록 변경했다.
- `resourceDefinition` 사용처를 preview capability 확인과 `iac.provider` 설정으로 축소했다.
- InfrastructureGraph API 테스트에 EC2가 `EC2`로 변환되지 않고 `iac.resourceType: "aws_instance"`를 유지하는 회귀 케이스를 추가했다.
- `docs/data-models.md`에 Terraform Preview identity와 `ResourceDefinition.resourceType`의 역할 차이를 기록했다.
- 하위 AI 6개 축 코드리뷰를 실행했고, block type을 무시하던 unused shared lookup helper 제거, `aws_security_group_rule` preview-only/sync-unsupported 테스트 보강, web catalog drift 테스트의 `aws_` prefix 의존 제거, identity 문서 표현 정리를 반영했다.
- `packages/types/src/resource-definitions.ts`를 추가해 44개 AWS Terraform resource/data 항목의 provider, domain `ResourceType`, Terraform identity, capability를 정의했다.
- `packages/types/package.json`에 `./resource-definitions` export를 추가했다. root `index.ts` re-export는 Next/Turbopack source resolve 문제 때문에 사용하지 않는다.
- `infrastructure-graph.ts`에서 `PREVIEW_SUPPORTED_BLOCKS`와 `RESOURCE_TYPE_BY_TERRAFORM_TYPE`를 제거하고 shared definition의 `terraformPreview` capability와 provider를 사용하게 했다.
- `terraform-to-diagram.ts`에서 `PROPOSAL_SUPPORTED_BLOCKS`를 제거하고 shared definition의 `terraformSync`를 사용하게 했다.
- Web `resource-settings/catalog.ts`를 shared definition + presentation metadata 구조로 정리했다.
- API/Web 테스트에 hardcoded support list 제거, preview/sync capability 차이, catalog/definition/parameter panel drift 방지 케이스를 추가했다.
- `docs/data-models.md`에 ResourceDefinition/capability 의미, 새 리소스 추가 절차, API/Web 의존성 경계를 문서화했다.
- Terraform HCL tokenizing helper와 회귀 테스트를 추가했다.
- Terraform editor의 기존 2px 빨간 직선 marker를 제거하고, syntax highlight line에 `text-decoration-style: wavy` 오류 밑줄을 적용했다.
- Terraform editor textarea 글자를 투명 처리하고 caret은 유지해, 실제 입력은 textarea가 담당하고 보이는 코드는 highlight layer가 담당하게 했다.
- Playwright로 `/workspace` Terraform 탭에서 syntax color와 mock validation error의 물결 밑줄 표시를 확인했다.
- Terraform leave save 실패 상태 모델에 `shouldRevealTerraformPanel` 흐름을 추가했다.
- `WorkspaceRightPanel`이 최신 Terraform diagnostics를 ref로 보관하고, diagnostics 때문에 저장이 막힌 경우 pending leave action을 취소한 뒤 Terraform 탭을 보여주며 모달을 닫게 했다.
- Diagnostics가 있을 때 Issues 탭과 collapsed Issues shortcut에 Terraform leave guard 예외를 적용했다.
- `createTerraformLeaveSaveStartFeedback`의 저장 중 메시지를 비워 곧 닫힐 모달 안에 순간적인 status 문구가 뜨지 않게 했다.
- 코드리뷰 피드백을 반영해 Terraform 서비스 에러와 HTTP 응답 매핑을 분리했다.
- Terraform virtual file validation을 순차 실행으로 바꿔 파일 수 증가 시 동시 요청 burst를 줄였다.
- 삭제 sync 후 남은 Terraform 코드 확인을 `combineTerraformFiles(nextFiles)` 병합 대신 `nextFiles.some(...)`으로 바꿨다.
- `cloneParameterValue` 중복을 공통 helper로 분리했다.
- wavy underline 전환 후 남아 있던 diagnostic line absolute position 계산 dead code를 제거했다.
- 하위 AI 6개 축으로 catalog/diagram, Terraform sync/proposal, AI draft layout, CSS/resize, backend API/generator, docs/contracts를 read-only 검증했다.
- `.nodeShellResource`에서 generic `min-height`를 해소해 compact icon node가 의도한 크기로 렌더링되게 했다.
- Terraform create proposal fallback과 AI draft fallback unknown resource 크기를 `56x56`으로 통일했다.
- AI draft area fit이 왼쪽/위쪽 자식까지 포함하도록 position+size를 함께 보정하게 했다.
- ArchitectureJson config의 Terraform reference 문자열을 Diagram node identity로 역해석해 VPC/Subnet 부모 영역을 찾도록 했다.
- HCL injection을 막기 위해 Terraform block label과 attribute/block key identifier 검증을 API schema와 generator에 추가했다.
- Design area icon 테스트와 `docs/data-models.md` 계약을 최신 동작에 맞췄고, 사용하지 않는 `DEFAULT_PALETTE_ITEMS` fallback을 제거했다.
- 일반 리소스 catalog 기본 icon size를 `112x112`에서 `56x56`으로 줄였다.
- legacy palette fallback, Terraform create proposal fallback, AI draft fallback 크기도 절반 비율로 낮췄다.
- 일반 resource resize 최소값과 CSS icon frame 최소값을 새 compact icon 크기에 맞췄다.
- AI draft area fit은 작은 icon을 배치해도 부모 VPC/Subnet/Region 박스가 같이 절반 압축되지 않도록 기존 112px footprint를 최소 배치 기준으로 유지한다.
- `docs/data-models.md`에 신규 일반 리소스 icon size와 영역 node 예외를 기록했다.
- 수동 리소스 아이콘 생성 경로가 현재 Diagram node 목록을 보고 중복 Terraform `resourceName`에 숫자 suffix를 붙이도록 수정했다.
- 다이어그램 drop 경로에서 `createDiagramNodeFromPayload`에 현재 node 목록을 전달하도록 연결했다.
- `docs/data-models.md`에 수동 리소스 아이콘의 Terraform identity 중복 회피 계약을 추가했다.
- EC2 Instance를 포함한 모든 수동 리소스 아이콘 생성에서 Terraform parameter 자동 채움을 제거했다.
- VPC/Subnet/Security Group/EC2/S3에 들어가던 Terraform Preview skeleton default helper를 삭제했다.
- AI Architecture Draft 변환 테스트는 catalog default가 아니라 AI가 명시한 config 값만 유지하도록 조정했다.
- `docs/data-models.md`에 수동 리소스 아이콘 생성 시 `parameters.values`가 `{}`로 시작한다는 계약을 추가했다.
- 리소스 아이콘 삭제 후 Terraform 코드를 전부 지워 저장할 때 저장이 실패하던 문제를 수정했다.
- Frontend `saveCodeToDiagram`이 빈 Terraform 코드를 막지 않고 sync API까지 보내도록 변경했다.
- API `syncTerraformToDiagramJson`이 공백 Terraform 입력을 `terraform.sync.empty` 오류가 아니라 Diagram-only resource 삭제 proposals로 처리하게 했다.
- 이미 빈 Diagram + 빈 Terraform은 diagnostics 없이 성공하도록 했다.
- `docs/data-models.md`에 빈 Terraform 저장 sync action의 삭제 의도 계약을 추가했다.
- Diagram icon 삭제 시 Terraform 코드가 남는 문제를 수정했다.
- Terraform Preview 자동 refresh에서 빈 다이어그램 차단 조건을 제거했다.
- Terraform editor 로컬 편집 중에도 삭제된 Diagram resource 주소의 Terraform block만 부분 제거하는 helper와 패널 effect를 추가했다.
- 삭제 동기화 결과 Terraform 코드가 비면 dirty 상태가 남지 않게 했다.
- 관련 regression tests를 추가했다.
- 하위 AI 6개 축으로 API sync/parser, frontend proposal 적용, Terraform editor UX, resource catalog/icon, deployment boundary, docs/contracts를 read-only 검증했다.
- Terraform 변경 제안 확인 패널을 제거하고 저장 시 proposals를 자동 반영하도록 바꿨다.
- `TerraformDiagnostic.sourceFileName`을 shared type에 추가했다.
- `TerraformDiagramChangeProposal.rename_candidate`에 `sourceFileName`과 `line`을 추가했다.
- API Terraform sync parser가 file별 diagnostics에 source file metadata를 채우도록 수정했다.
- Frontend Terraform panel이 전체 검증을 file별로 실행하고 diagnostic source metadata를 UI에 보존하게 했다.
- Diagnostic line highlight helper가 source file filtering과 source line offset을 지원하게 했다.
- CloudFront catalog, parameter override, generated parameter catalog를 추가했다.
- Proposal helper의 create/rename 적용 경로에서 icon/size/fileName/deep clone 보존을 강화했고, `applyAllTerraformSyncProposals`를 추가했다.
- Palette, diagram node creation, area node icon lookup을 catalog 기준으로 정렬했다.
- Resource Duplicate 중복 identity와 stale auto tag 문제를 수정했다.
- 관련 regression tests와 docs/data-models 계약을 갱신했다.

## 검증

- Red before fix: focused API/Web tests failed because CLI endpoint/mode/progress UI and missing static diagnostics were still present.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-diagnostics.test.ts src/routes/terraform.test.ts src/deployments/terraform-runner.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/pre-deployment-diagnostics.test.ts` - passed
- `pnpm --filter @sketchcatch/types typecheck` - passed
- `git diff --check` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/pre-deployment-diagnostics.test.ts` - passed
- `pnpm --filter @sketchcatch/types typecheck` - passed
- `pnpm --filter @sketchcatch/api typecheck` - passed
- `pnpm --filter @sketchcatch/web typecheck` - passed
- `git diff --check` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed before edits
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-preview.test.ts` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/terraform.test.ts` - passed
- `pnpm --filter @sketchcatch/api typecheck` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `git diff --check` - passed
- `pnpm harness:check` - passed after harness record updates
- `pnpm test` - failed in unrelated deployment lock-file/path expectation tests: `deployment-apply-service.test.ts`, `deployment-destroy-plan-service.test.ts`, `deployment-destroy-service.test.ts`, `deployment-init-service.test.ts`, `terraform-lock-file-workspace.test.ts`
- Red before fix: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts` - failed because graph nodes still contained internal `type` and source still used `resourceDefinition.resourceType`
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed after subagent review fixes
- `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts` - passed after subagent review fixes
- `pnpm --filter @sketchcatch/types typecheck` - passed
- `pnpm typecheck` - passed
- `pnpm --filter @sketchcatch/types typecheck` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed
- `git diff --check` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-code-highlighting.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/pre-deployment-diagnostics.test.ts` - passed
- `pnpm --filter @sketchcatch/web test` - passed, 309 tests
- `pnpm --filter @sketchcatch/web typecheck` - passed
- Playwright `/workspace` smoke - passed for syntax color and mocked validation squiggle underline
- Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts` - failed because leave save feedback had no panel reveal path for diagnostics-blocked saves
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
- Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - failed because saving feedback still had a status message and Issues navigation had no leave guard exception
- `pnpm --filter @sketchcatch/web test` - passed, 312 tests
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/routes/terraform.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/terraform-sync-proposals.test.ts features/diagram-editor/diagram-utils.test.ts` - passed
- `pnpm --filter @sketchcatch/api typecheck` - passed
- `pnpm --filter @sketchcatch/web typecheck` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed
- `git diff --check` - passed
- Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - failed because Terraform-style references did not resolve to area parent nodes
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/routes/terraform.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/diagram-editor/area-nodes.test.ts features/diagram-editor/diagram-editor-layout.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/resource-settings/catalog-provider.test.ts features/diagram-editor/diagram-utils.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/node-resize.test.ts features/diagram-editor/flow-mappers.test.ts features/diagram-editor/node-style.test.ts features/diagram-editor/drag-transaction.test.ts features/diagram-editor/reference-drop-targets.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/pre-deployment-diagnostics.test.ts` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/infrastructure-graph.test.ts` - passed
- `pnpm catalog:check` - passed
- `pnpm harness:check` - passed
- `git diff --check` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/workspace/terraform-sync-proposals.test.ts features/diagram-editor/node-resize-bounds.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts features/resource-settings/catalog-provider.test.ts features/diagram-editor/diagram-utils.test.ts features/diagram-editor/node-resize-bounds.test.ts features/diagram-editor/node-resize.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-panel-utils.test.ts` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed
- `git diff --check` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/drag-transaction.test.ts features/diagram-editor/reference-drop-targets.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts` - passed
- `pnpm --filter @sketchcatch/web typecheck` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed
- `git diff --check` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/infrastructure-graph.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/diagram-editor/diagram-utils.test.ts features/resource-settings/catalog.test.ts features/workspace/pre-deployment-diagnostics.test.ts features/parameter-input/validation.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-leave-save-state.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
- `pnpm --filter @sketchcatch/web typecheck` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-panel-utils.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/diagram-editor/reference-drop-targets.test.ts features/diagram-editor/drag-transaction.test.ts features/workspace/terraform-panel-utils.test.ts features/parameter-input/validation.test.ts` - passed
- `pnpm --filter @sketchcatch/web typecheck` - passed
- `pnpm catalog:generate` - passed
- `pnpm catalog:check` - passed after one transient Terraform AWS provider schema handshake retry
- `pnpm typecheck` - passed
- `pnpm lint` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed

## 아직 깨졌거나 미검증된 것

- 새 shared definition 변경에 대한 브라우저 수동 smoke는 수행하지 않았다. 자동/타입/빌드 검증으로 확인했다.
- 전체 `pnpm test`는 deployment lock-file/path separator 기대값 실패 6건으로 통과하지 못했다. 이번 Terraform Preview orchestration focused tests, route tests, `lint`, `typecheck`, `build`, `harness:check`는 통과했다.
- `parameterPanel` capability는 현재 web parameter catalog 보유 여부와 맞췄다. 새 리소스 추가 시 shared definition, web presentation, parameter catalog를 함께 갱신해야 한다.
- `apps/web/next-env.d.ts`는 `pnpm build`가 일시적으로 바꿨지만 이번 작업 범위가 아니라 tracked 상태로 되돌렸다.
- 로컬 브랜치는 upstream보다 1 commit behind 상태다. upstream에는 `docs/jh` 추적 해제 관련 삭제 commit이 하나 있다.
- tracked 상태로 남아 있는 `docs/jh` 파일은 PR 정리 전 ignore 정책에 맞게 제거해야 한다.
- 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 이번 구현 범위를 확인했다.
- Terraform leave save diagnostics 실패 모달 UX는 자동 테스트로 확인했고, 실제 브라우저 수동 smoke는 아직 수행하지 않았다.
- Diagnostics가 있을 때 Issues 탭/shortcut이 leave guard에 막히지 않는 흐름은 자동 테스트로 확인했고, 실제 브라우저 수동 smoke는 아직 수행하지 않았다.
- 하위 AI가 지적한 deployment safety preflight mismatch와 DeploymentPanel init 실패 후 stale PENDING state는 이번 아이콘/preview/editor 회귀 보강 범위 밖이라 후속 작업 후보로 남았다.
- `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.

## 다음으로 최선의 행동

- 다음 Terraform 리소스 추가 시 shared definition/capability, web presentation, 필요 시 parameter catalog/`parameterPanel`, `ResourceType` 확장 여부, drift 테스트를 함께 맞춘다.
- 브라우저에서 EC2/S3/CloudFront 같은 일반 resource icon을 새로 추가했을 때 `56x56` 크기로 보이고, VPC/Subnet 같은 영역 node는 기존 크기를 유지하는지 수동 smoke한다.
- 브라우저에서 EC2/VPC/S3 아이콘을 반복 추가했을 때 Terraform Preview 이름이 순차 suffix로 생성되는지 수동 smoke한다.
- 브라우저에서 CloudFront AI draft가 `AWS` fallback이 아니라 CloudFront icon으로 보이는지 수동 smoke한다.
- Terraform editor에서 `aws_s3_bucket`, `data.aws_ami`, `aws_cloudfront_distribution` create proposal이 저장 시 자동 반영되고 icon/size가 유지되는지 수동 smoke한다.
- Multi-file Terraform에서 `network.tf` 오류가 `main.tf`에 표시되지 않고 해당 파일에서만 빨간줄로 보이는지 확인한다.
- 기존 VPC `cidr_block` 같은 same-identity value update가 저장 시 바로 반영되는지 확인한다.
- Terraform editor에서 syntax error를 만든 뒤 `저장하고 나가기`를 눌렀을 때 모달이 닫히고 Terraform 탭의 물결 오류 표시가 바로 보이는지 확인한다.
- Terraform diagnostics가 있는 상태에서 Issues 탭을 클릭했을 때 저장 확인 모달 없이 Issues 탭이 열리는지 확인한다.
- 별도 이슈로 pre-deployment artifact path와 backend artifact safety check 정렬을 검토한다.

## 건드리지 말아야 할 것

- `.env`, private key, AWS credential, DB password, real access token
- 사용자 승인 없는 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff
- 사용자 확인 없는 Voice Requirement Input 또는 AI 제안의 Practice Architecture 반영
- frontend UI component 안의 Terraform 실행, AWS SDK 호출, deployment mutation logic

## 참고 명령

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

## 최신 핸드오프 - 2026-07-03 Deployment Safety Gate

- 완료: `docs/ys/009_배포안전게이트구현계획_ys.md` 기준 작업 0~12 구현 및 단계별 커밋 완료.
- 핵심 변경: shared warning 계약 확장, `deployment-safety-gate.ts`, warning factory, public RDS/SSH/S3/IAM wildcard security rule, apply/destroy plan Safety Gate 연결, approval `acknowledgedWarningIds`, apply/destroy final guard, UI acknowledgement checkbox.
- 검증 완료: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `git diff --check`.
- 현재 작업 트리: 최종 검증 시점 기준 깨끗해야 한다.
- 주의: 실제 Terraform apply/destroy와 AWS mutation은 수행하지 않았다.

## 2026-07-03 - Issue #128 Worker 1-1 핸드오프

### 현재 검증된 것

- Direct Deployment 승인 스냅샷 재검증 동작은 기존 production code가 이미 만족했다. production 파일은 수정하지 않았다.
- apply precondition 회귀 테스트를 추가했다.
  - artifact hash drift
  - tfplan hash drift
  - AWS account drift
  - AWS region drift
  - missing approval snapshot fields
  - drift 감지 시 apply service가 AWS credential 준비, plan file write, Terraform 실행 전에 멈추는지
- 기존 destroy precondition 동작은 targeted destroy service test run으로 계속 검증했다.
- `docs/sw/005_승인스냅샷재검증클론코딩가이드_sw.md`를 추가하고 `docs/sw/README.md`에서 연결했다.

### 실행한 검증

- `pnpm harness:check` - passed before edits
- `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-approval-service.test.ts src/deployments/deployment-apply-service.test.ts src/deployments/deployment-destroy-service.test.ts` - passed
- `pnpm --filter @sketchcatch/api test` - failed once because existing tests require `S3_BUCKET_NAME`
- `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm --filter @sketchcatch/api test` - passed
- `pnpm --filter @sketchcatch/api lint` - passed
- `pnpm --filter @sketchcatch/api typecheck` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `git diff --check` - passed
- `pnpm harness:check` - passed after note update

### 남은 리스크와 다음 행동

- 이 worker branch를 #128 Worker 1-2 또는 1-3 범위로 확장하지 않는다. Parent agent가 이 focused diff를 review하고 PR을 연다.
- 실제 AWS apply/destroy, cloud mutation, Git/CI/CD handoff, secret access는 수행하지 않았다.

## 최신 핸드오프 - 2026-07-04 Deployment Safety Gate 수정 UX와 AI 설명

### 현재 검증된 것

- `pnpm lint` - passed; Turbo cache rename warning only.
- `pnpm typecheck` - passed; Turbo cache rename warning only.
- `pnpm build` - passed.
- `pnpm test` - passed; API reported 470 passing tests and Turbo reported 5 successful test tasks.
- `pnpm harness:check` - passed before the final record update.
- `git diff --check` - passed before the final record update.

### 이번 작업 변경 사항

- Finding `sourceLocation`을 `CheckFinding`/`DeploymentPlanWarning`에 연결했다.
- Deployment finding 카드의 `수정` 버튼이 Terraform 탭으로 이동하고 해당 line을 highlight한다.
- OpenAI GPT API 기반 safety finding 설명 service와 deterministic fallback을 추가했다.
- Pre-deployment check 결과에 finding별 `aiSafetyExplanation`을 포함했다.
- `AI 창` 버튼이 `sketchcatch:safety-finding-ai-open` 이벤트를 발생시키고, `WorkspaceAiPanel` 임시 설명 패널이 선택된 finding을 표시한다.
- High는 빨간색, Medium은 기존 노란색, Low는 초록색으로 명시했다.
- Medium/Low required warning acknowledgement를 모두 체크해야 승인 버튼이 활성화된다.
- High risk block banner는 승인 불가, `수정`/`AI 창`, Terraform Plan 재실행 경로를 안내한다.
- Safety Gate cost/risk warning 통합과 stable id dedupe 테스트를 보강했다.
- `docs/ys/009_배포안전게이트구현계획_ys.md`에 구현 확인 경로와 검증 명령을 추가했다.

### 주의와 다음 행동

- 실제 Terraform apply/destroy, AWS mutation, Git/CI/CD handoff, secret access는 수행하지 않았다.
- Browser visual smoke는 아직 수동으로 해야 한다.
- 다음에는 안전한 public SSH 예시로 `검사 실행` -> 빨간 High finding -> `수정` 이동 -> `AI 창` 설명 -> Plan 단계 High block을 확인하면 된다.
