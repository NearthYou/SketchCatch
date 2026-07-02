# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 현재 검증된 것

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
- `docs/data-models.md`는 diagnostic/proposal source metadata와 proposal 지원 범위를 현재 코드에 맞게 기록한다.
- `feature_list.json`에는 동시에 `in_progress`인 항목이 없다.

## 이번 세션의 변경 사항

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

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/infrastructure-graph.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/workspace-ai-diagram-adapter.test.ts features/diagram-editor/diagram-utils.test.ts features/resource-settings/catalog.test.ts features/workspace/pre-deployment-diagnostics.test.ts features/parameter-input/validation.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-leave-save-state.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
- `pnpm --filter @sketchcatch/web typecheck` - passed
- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-panel-utils.test.ts` - passed
- `pnpm catalog:generate` - passed
- `pnpm catalog:check` - passed after one transient Terraform AWS provider schema handshake retry
- `pnpm typecheck` - passed
- `pnpm lint` - passed
- `pnpm build` - passed
- `pnpm harness:check` - passed

## 아직 깨졌거나 미검증된 것

- 기존 unrelated 변경 `DESIGN.md` 삭제 상태는 이번 작업에서 건드리지 않았다.
- 기존 unrelated 변경 `apps/web/next-env.d.ts` 변경 상태는 이번 작업에서 건드리지 않았다.
- 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/타입/빌드 검증으로 이번 구현 범위를 확인했다.
- 하위 AI가 지적한 deployment safety preflight mismatch와 DeploymentPanel init 실패 후 stale PENDING state는 이번 아이콘/preview/editor 회귀 보강 범위 밖이라 후속 작업 후보로 남았다.
- `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.

## 다음으로 최선의 행동

- 브라우저에서 CloudFront AI draft가 `AWS` fallback이 아니라 CloudFront icon으로 보이는지 수동 smoke한다.
- Terraform editor에서 `aws_s3_bucket`, `data.aws_ami`, `aws_cloudfront_distribution` create proposal이 저장 시 자동 반영되고 icon/size가 유지되는지 수동 smoke한다.
- Multi-file Terraform에서 `network.tf` 오류가 `main.tf`에 표시되지 않고 해당 파일에서만 빨간줄로 보이는지 확인한다.
- 기존 VPC `cidr_block` 같은 same-identity value update가 저장 시 바로 반영되는지 확인한다.
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
