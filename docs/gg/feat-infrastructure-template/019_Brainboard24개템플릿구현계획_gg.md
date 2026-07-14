# Brainboard 24개 AWS Template 구현 계획

> **For agentic workers:** `superpowers:test-driven-development`로 각 작업의 RED를 먼저 만들고, 독립 작업은 `superpowers:subagent-driven-development`로 분리한다. 완료를 주장하거나 커밋하기 전에는 `superpowers:verification-before-completion`을 적용한다.

**Goal:** Brainboard의 Chafik Belhaoues AWS Template 24개를 다운로드 수 내림차순으로 정확히 수집·등록해, 기존 여섯 개를 바꾸지 않으면서 내장 Template gallery를 총 30개로 만든다. 별도 `빈 보드로 시작` action은 개수에서 제외한다.

**Architecture:** Brainboard 원본을 24개 독립 source fixture로 보존하고, 단일 adapter가 이를 기존 `TemplateDefinition`, `DiagramJson`, 초기 Terraform file seed로 변환한다. 기존 Template은 `catalog-normalized`, 신규 Template은 `source-exact` geometry 정책을 사용한다. Resource identity와 Terraform renderer는 기존 shared catalog를 재사용하며, 지원하지 않는 Resource는 fallback으로 숨기지 않고 해당 fixture 검증을 실패시킨다.

**Tech Stack:** TypeScript, Node test runner/`tsx`, React/Next.js, `@xyflow/react`, Zod, 기존 SketchCatch Terraform renderer, 로그인된 Chrome의 Brainboard UI.

## 전역 제약

- 기준 branch는 `dev`, 작업 branch는 이슈 #381에 연결된 `feature/gg/381-brainboard-aws-templates`다.
- 기존 여섯 Template의 ID, semantic/layout contract, thumbnail hash를 바꾸지 않는다.
- 신규 24개는 기존 Template을 대체하지 않고 별도 `brainboard-*` ID로 추가한다.
- Brainboard의 `Plan`, `Apply`, `Deploy`는 실행하지 않는다.
- 원본 capture 실패는 Template별로 격리하고 다음 항목을 계속 처리한다.
- 원본 node 좌표·크기·순서·parent·z-index와 edge path·port·순서를 임의 auto-layout으로 바꾸지 않는다.
- 원본 Terraform의 resource/data type, logical name, file 경계, 값, nested block, reference를 fixture에 보존한다. clone architecture UUID는 workspace seed에서 제외한다.
- 코드 수정은 `apply_patch`, fixture의 결정적 생성·formatting은 repository script를 사용한다.
- 각 단계는 테스트 실패 확인 → 최소 구현 → 해당 테스트 통과 → 회귀 확인 순서로 진행한다.

## Task 1. 기존 여섯 개 기준선과 ID 경계 잠그기

**Files**

- Modify: `packages/types/src/template-definitions.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/template-layout-contract.test.ts`
- Modify: `packages/types/src/template-presentation-contract.test.ts`
- Modify: `packages/types/src/template-definitions.test.ts`
- Modify: `apps/api/src/source-repositories/repository-template-recommendation.ts`
- Modify: `apps/api/src/source-repositories/repository-template-recommendation.test.ts`
- Modify: `apps/web/features/workspace/public-repository-recommendation.ts`
- Modify: `apps/web/features/workspace/public-repository-recommendation.test.ts`

1. RED: 기존 여섯 ID만 포함하는 `REPOSITORY_TEMPLATE_IDS`와 `RepositoryTemplateId`, 전체 gallery용 `TEMPLATE_IDS`와 `TemplateId`가 서로 다른 union임을 검증한다.
2. 기존 `TEMPLATE_IDS` 여섯 개를 `REPOSITORY_TEMPLATE_IDS`로 이름을 분리하고, 추천 후보·AI handoff·Zod enum·설명 `Record`는 반드시 여섯 개 전용 type을 사용하게 한다.
3. 기존 presentation layout map과 기존 여섯 개 hash expectation은 `Record<RepositoryTemplateId, ...>`로 좁힌다.
4. 기존 여섯 개만 build한 DiagramJson과 semantic/layout hash가 변경 전 golden과 같은지 실행한다.
5. Focused verification:

```bash
pnpm --filter @sketchcatch/api exec tsx --test ../../packages/types/src/template-definitions.test.ts ../../packages/types/src/template-layout-contract.test.ts ../../packages/types/src/template-presentation-contract.test.ts
pnpm --filter @sketchcatch/api exec tsx --test src/source-repositories/repository-template-recommendation.test.ts
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/public-repository-recommendation.test.ts
```

## Task 2. Brainboard source contract와 24개 manifest 만들기

**Files**

- Create: `packages/types/src/brainboard-templates/ids.ts`
- Create: `packages/types/src/brainboard-templates/source-types.ts`
- Create: `packages/types/src/brainboard-templates/manifest.ts`
- Create: `packages/types/src/brainboard-templates/validate-source.ts`
- Create: `packages/types/src/brainboard-templates/source-contract.test.ts`
- Modify: `packages/types/src/index.ts`

1. RED: 24개 ID/sourceTemplateId가 유일하고, author가 `Chafik Belhaoues`, provider가 `aws`, download 수가 비증가 순서이며 마지막 `AWS secure S3 bucket`이 0인지 검증한다.
2. `BrainboardTemplateSource`에 origin, capture status, source viewport, ordered nodes, ordered edges, ordered Terraform files, source resource address를 정의한다.
3. Resource node에는 `terraformBlockType`, `terraformResourceType`, 원본 `resourceName`, 원본 `fileName`, structured values를 필수로 둔다. Presentation node에는 catalog identity를 필수로 둔다.
4. Edge에는 source/target source ID, 양쪽 port, 원본 SVG path, waypoint, arrow 방향, DOM order를 둔다.
5. Terraform file은 `{ fileName, code, sha256, includeInWorkspace }[]`로 정의해 file 순서를 보존한다.
6. validator가 node/edge/order/address/file 중복, dangling parent/edge, parent cycle, SHA-256 불일치, resource block 누락, workspace seed의 clone UUID 포함을 각각 구체적인 오류로 반환하게 한다.
7. Focused verification:

```bash
pnpm --filter @sketchcatch/api exec tsx --test ../../packages/types/src/brainboard-templates/source-contract.test.ts
```

## Task 3. source-exact Diagram 계약을 shared type과 API에 추가하기

**Files**

- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/routes/project-draft-schemas.ts`
- Modify: `apps/api/src/routes/project-draft-schemas.test.ts`
- Modify: `apps/api/src/routes/terraform.ts`
- Modify: `apps/api/src/routes/terraform.test.ts`
- Modify: `apps/web/features/diagram-editor/diagram-utils.ts`
- Modify: `apps/web/features/diagram-editor/diagram-utils.test.ts`

1. RED: `DiagramJson.presentation.geometryPolicy === "source-exact"`와 source bounds가 clone/save/parse round-trip에서 보존되는 테스트를 추가한다.
2. RED: `DiagramEdge.route`의 SVG path, source/target point, waypoint, label position, arrow angle과 `DiagramEdge.zIndex`가 clone/save/parse round-trip에서 보존되는 테스트를 추가한다.
3. `DiagramJson`에 optional presentation contract를 추가하고, `DiagramEdge`에 optional authored route와 z-index contract를 추가한다. 기존 DiagramJson에는 필드가 없어도 동일하게 동작해야 한다.
4. Project draft와 Terraform route의 중복 strict Zod schema 양쪽에 같은 optional field를 추가한다.
5. `cloneDiagram`이 variables뿐 아니라 presentation과 authored route의 nested 값을 deep clone하도록 보완한다.
6. 기존 request fixture가 byte-equivalent payload로 통과하는지 확인한다.

## Task 3-1. capture audit에서 확인된 source-exact 계약 gap 닫기

**Files**

- Modify: `packages/types/src/brainboard-templates/source-types.ts`
- Modify: `packages/types/src/brainboard-templates/source-contract.test.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/routes/project-draft-schemas.ts`
- Modify: `apps/api/src/routes/project-draft-schemas.test.ts`
- Modify: `apps/api/src/routes/terraform.ts`
- Modify: `apps/api/src/routes/terraform.test.ts`
- Modify: `apps/web/features/diagram-editor/diagram-utils.test.ts`

1. raw node의 `transform`과 parsed rotation을 source 계약에 보존하고, runtime `DiagramNode.rotation`은 optional로 추가한다. 기존 Diagram에는 field가 없어도 동일하게 동작해야 한다.
2. raw edge의 `sourcePoint`/`targetPoint`를 source 계약에 명시하고 authored route의 두 endpoint로 lossless 변환한다.
3. node rotation과 edge endpoint point가 clone/save/parse/terraform-sync round-trip에서 exact equality로 보존되는 RED test를 먼저 추가한다.
4. 실패 capture는 완전한 `BrainboardTemplateSource`로 위장하지 않고 source URL, preview URL/dimension, attempts, error를 가진 discriminated evidence variant로 모델링한다.
5. visible text가 비어 있는 11개 text node와 style이 없는 2개 shape node는 값을 발명하지 않고 unresolved evidence로 남긴다.

## Task 4. materializer와 editor normalization에서 원본 geometry 보존하기

**Files**

- Modify: `packages/types/src/template-definitions.ts`
- Modify: `apps/web/features/resource-settings/template-resource-materializer.ts`
- Modify: `apps/web/features/resource-settings/template-resource-materializer.test.ts`
- Modify: `apps/web/features/diagram-editor/resource-node-geometry.ts`
- Modify: `apps/web/features/diagram-editor/resource-node-geometry.test.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`
- Modify: `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`

1. RED: source-exact 일반 Resource 60×60, container 1180×700, 음수/비-grid 좌표, explicit z-index가 materialization과 editor 초기화 뒤에도 그대로인지 검증한다.
2. `TemplateResourceDefinition`에 optional `terraformResourceName`, `fileName`, `zIndex`를 추가하고, presentation node에도 optional z-index를 추가한다. 기존 여섯 개는 기존 fallback을 사용한다.
3. materializer가 source-exact이면 catalog icon/identity/parameter default는 재사용하되 authored size와 z-index를 덮어쓰지 않게 한다.
4. `normalizeDiagramResourceNodeGeometry`는 source-exact Diagram의 size/position/parent를 migration 대상으로 취급하지 않는다.
5. editor의 초기 state, prop 교체, preview, `applyDiagramJson` 네 경로가 같은 정책을 사용하도록 테스트한다.
6. 기존 catalog-normalized 여섯 개의 size와 area behavior 회귀 테스트를 함께 실행한다.

## Task 5. 원본 edge path, port, z-order 렌더링하기

**Files**

- Modify: `apps/web/features/diagram-editor/types.ts`
- Modify: `apps/web/features/diagram-editor/flow-mappers.ts`
- Modify: `apps/web/features/diagram-editor/flow-mappers.test.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEdgeView.tsx`
- Create: `apps/web/features/diagram-editor/authored-edge-path.ts`
- Create: `apps/web/features/diagram-editor/authored-edge-path.test.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEdgeView.test.tsx`
- Modify: `apps/web/features/diagram-editor/diagram-utils.ts`
- Modify: `apps/web/features/diagram-editor/diagram-utils.test.ts`

1. RED: authored route가 있으면 stored handle이 obstacle router에 의해 교체되지 않고, source SVG path가 semantic/halo/interaction path에 동일하게 쓰이는지 검증한다.
2. RED: authored route가 없는 기존 edge는 현재 smoothstep/step/straight와 obstacle-safe routing을 그대로 사용하는지 검증한다.
3. source-exact node는 authored z-index를 clamp하거나 area/resource base로 재작성하지 않게 하되, 기존 node는 현재 containment layer 규칙을 유지한다.
4. authored edge DOM order를 edge z-index에 반영하고, 선택 상태만 접근성·selection overlay에 필요한 최소 delta를 적용한다.
5. node를 원본 endpoint 밖으로 이동한 경우에는 stale SVG path를 쓰지 않고 authored waypoint를 새 endpoint에 연결하는 deterministic fallback을 구현한다.
6. 연결 node의 drag/resize가 끝나거나 edge type을 수정하면 `clearAuthoredRoutesForNodeIds`로 absolute authored route를 제거한다. 색상·굵기 같은 style-only 변경은 route를 유지한다.
7. source-exact 보드에서는 React Flow의 자동 선택 elevation이 원본 z-order를 바꾸지 않게 명시적으로 끄고, 기존 보드는 현재 selection layer를 유지한다.

## Task 5-1. source viewBox를 최초 viewport에 한 번 적용하기

**Files**

- Modify: `apps/web/features/diagram-editor/board-viewport.ts`
- Modify: `apps/web/features/diagram-editor/board-viewport.test.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`
- Modify: `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`

1. RED: source viewBox와 실제 unobscured board frame으로 계산한 viewport가 padding 0에서 원본 bounds를 정확히 포함하는지 검증한다.
2. source-exact Template을 최초 적용할 때만 `sourceViewBox`를 fit하고 계산된 `DiagramJson.viewport`를 저장한 뒤 `initialViewportPending`을 false로 바꾼다.
3. reload 이후에는 사용자가 마지막으로 저장한 viewport를 복원하며 source viewBox fit을 반복하지 않는다.
4. 매우 큰 source viewBox에만 필요한 최소 zoom 범위를 조건부로 허용하고, 기존 보드의 minZoom 0.25와 zoom UI 계약은 그대로 둔다.

## Task 6. Brainboard capture를 반복 가능한 evidence로 만들기

**Files**

- Create: `scripts/brainboard-capture/normalize-capture.mjs`
- Create: `scripts/brainboard-capture/validate-capture.mjs`
- Create: `scripts/brainboard-capture/README.md`
- Create: `docs/gg/feat-infrastructure-template/brainboard-capture-status.json`

1. Chrome의 로그인 session에서 AWS filter와 author를 확인하고 manifest의 다운로드 순으로 처리한다.
2. 각 Template에서 detail metadata를 기록하고 `Use template` → `Create architecture`까지만 실행한다.
3. Design SVG에서 viewBox, ordered node group, transform/rect/title/type/parent, ordered connector path와 arrow transform을 추출한다.
4. Code pane의 모든 `.tf`와 `terraform.tfvars`를 수집한다. `Plan`과 `Deploy`는 클릭하지 않는다.
5. normalize script는 browser JSON을 source type의 결정적 순서와 숫자 형식으로 바꾸며 의미를 추정하지 않는다.
6. status file에는 `captured/materialized/verified/failed`, clone board URL, 마지막 오류를 Template별로 기록한다.
7. 한 항목이 실패해도 `failed`를 기록한 뒤 다음 항목을 계속한다.
8. raw evidence는 immutable input으로 취급한다. 더 작은 rectangle을 parent로 가리키는 link만, child를 완전히 감싸는 가장 작은 strictly-larger candidate로 교체하고 tie는 override 없이는 실패시킨다.
9. raw parent cycle, semantic duplicate edge, nonzero rotation, 빈 text/style, visual-only node, one-address/multi-visual alias를 validation report에 별도 경고로 남긴다.
10. Terraform node/address 대응은 title/name exact match, type별 단일 후보, HCL reference/value, containment, edge topology, reviewed override 순으로 해결하고 배열 index끼리 대응하지 않는다.
11. Terraform expression은 plain string으로 낮추지 않는다. variable/local/index/function/interpolation/heredoc을 구분하는 tagged expression 계약을 먼저 추가하고, block file name과 includeInWorkspace를 원본 그대로 보존한다.

## Task 7. captured 23개 fixture와 failed 1개 evidence를 다운로드 순으로 추가하기

**Files**

- Create: `packages/types/src/brainboard-templates/sources/training-aws-onboarding.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-kubernetes-native-cnis.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-vpc-subnets-security-groups-2az.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-serverless-cdn.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-ec2-vpc-subnet.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-asg-lb-vpc-subnets.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-jenkins-ec2.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-rest-api-documentdb.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-network-landing-zone.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-three-tier-database.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-bastion.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-instance-db-multiple-networks.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-load-balancer-target-group.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-s3-api-gateway.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-costs-monitoring.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-ecs-fargate.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-multi-account-management.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-elastic-beanstalk.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-rds.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-fsx.ts`
- Create: `packages/types/src/brainboard-templates/sources/cross-account-aws-s3.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-iam-users.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-dashcam-video-pipeline.ts`
- Create: `packages/types/src/brainboard-templates/sources/aws-secure-s3-bucket.ts`

1. clone에 성공한 23개만 deployable `BrainboardTemplateSource`로 만들고 validator를 통과시킨다.
2. `09fd3420…`은 preview/attempt/error만 가진 failed evidence로 등록하며 diagram/Terraform 값을 추측하지 않는다.
3. exported catalog order는 manifest의 24개 다운로드 순서를 유지하되 deployable source registry와 evidence registry를 구분한다.
- Modify: `packages/types/src/brainboard-templates/source-contract.test.ts`

1. 먼저 이미 수집한 Training/EKS 두 fixture를 넣고 source validator를 통과시킨다.
2. 나머지는 manifest 순서로 4개씩 여섯 batch에 추가한다. 각 batch마다 개별 source validation과 SHA-256을 통과시킨 뒤 다음 batch로 간다.
3. 원본에서 표현을 읽지 못한 필드는 추측해 채우지 않고 해당 Template을 `failed`로 남긴 뒤 재수집한다.
4. 최종 RED/GREEN은 `captured` 24개, node/edge dangling reference 0, Terraform source hash mismatch 0이다.

## Task 8. shared Resource catalog 지원 범위 완성하기

**Files**

- Modify as needed: `packages/types/src/resource-definitions.ts`
- Modify as needed: `packages/types/src/resource-definitions/*.ts`
- Modify as needed: `apps/web/features/resource-settings/catalog.ts`
- Modify: `packages/types/src/resource-definitions.test.ts`
- Modify: `apps/web/features/resource-settings/catalog.test.ts`
- Run generated check: `scripts/generate-terraform-aws-catalog.mjs`

1. RED: 24개 fixture가 요구하는 모든 `(blockType, resourceType)`가 shared ResourceDefinition과 Web catalog item에서 정확히 하나씩 발견되는지 검증한다.
2. 누락된 type만 shared definition에 추가하고 기존 component를 중복 생성하지 않는다.
3. 각 추가 type에 parameter defaults, Terraform preview/sync capability, icon/catalog identity를 등록한다.
4. fallback tile 또는 silently skipped node가 0인지 검증한다.
5. Verification:

```bash
pnpm catalog:check
pnpm --filter @sketchcatch/api exec tsx --test ../../packages/types/src/resource-definitions.test.ts
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/catalog.test.ts
```

## Task 9. source adapter와 registry 연결하기

**Files**

- Create: `packages/types/src/brainboard-templates/adapter.ts`
- Create: `packages/types/src/brainboard-templates/registry.ts`
- Create: `packages/types/src/brainboard-templates/adapter.test.ts`
- Modify: `packages/types/src/template-definitions.ts`
- Modify: `packages/types/src/index.ts`

1. RED: Training/EKS에서 원본 logical name, fileName, values/reference, ordered node/edge, parent, viewport, z-index, authored route가 deterministic하게 변환되는지 검증한다.
2. adapter는 source node ID→Diagram node ID map을 한 번 만든 뒤 parent와 edge endpoint를 resolve한다.
3. source `resourceName`과 `fileName`을 우선하고, 기존 여섯 개에만 기존 normalized name/`main.tf` fallback을 사용한다.
4. `@ref:<source-id>.<attribute>`와 `@address:<source-id>`를 원본 logical name이 반영된 Terraform address로 변환한다.
5. registry는 `verified` 24개만 노출하며 unsupported/malformed fixture를 throw하거나 상태 보고에 남긴다. node를 자동 누락하지 않는다.
6. `templateDefinitions`는 기존 여섯 개 뒤에 manifest 순서의 신규 24개를 붙이고, `TEMPLATE_IDS`와 정확히 같은 순서를 갖게 한다.

## Task 10. 초기 Terraform file seed와 semantic parity 연결하기

**Files**

- Modify: `apps/web/features/resource-settings/template-library.ts`
- Modify: `apps/web/features/resource-settings/template-library.test.ts`
- Modify: `apps/web/app/workspace/new/workspace-start-client.tsx`
- Modify: `apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx`
- Modify: `apps/web/features/workspace/api.ts`
- Modify: `apps/web/features/workspace/api.test.ts`
- Modify: `packages/types/src/terraform-provider-files.ts`
- Modify: `packages/types/src/terraform-provider-files.test.ts`
- Create: `apps/api/src/services/terraform/brainboard-template-terraform-contract.test.ts`

1. `BoardTemplate`에 optional initial `terraformFiles`를 추가하고 clone/apply/start 경로에서 deep clone한다.
2. Workspace 생성 시 source fixture의 `includeInWorkspace: true` 파일을 초기 draft와 함께 저장한다. `terraform.tfvars`의 clone UUID와 Brainboard backend 주석은 저장하지 않는다.
3. source provider file이 있으면 generic provider file을 중복 삽입하지 않게 한다.
4. RED: source address set = adapted Diagram address set = generated Terraform address set인지 24개 각각 검증한다.
5. RED: 각 fixture의 핵심 값, nested block, resource reference가 generated Terraform에서 의미상 같은지 검증하고 unresolved `@ref:`/`@address:`가 0인지 확인한다.
6. renderer가 지원하지 않는 안전한 expression을 발견하면 명시적 Terraform expression value 계약과 renderer test를 먼저 추가한다. fixture 값을 문자열로 낮춰 테스트를 맞추지 않는다.

## Task 11. gallery 30개와 thumbnail 완성하기

**Files**

- Modify: `apps/web/features/resource-settings/template-library.ts`
- Modify: `apps/web/features/resource-settings/template-library.test.ts`
- Modify: `apps/web/features/resource-settings/template-thumbnail-manifest.ts`
- Modify: `apps/web/features/resource-settings/template-thumbnail-manifest.test.ts`
- Create: `apps/web/public/template-thumbnails/v1/brainboard-*.webp` 24개
- Modify: `apps/web/app/templates/templates-client.test.ts`
- Modify: `apps/web/app/workspace/new/workspace-start-client.test.ts`

1. RED: gallery가 기존 여섯 개와 신규 24개 entry를 합쳐 정확히 30개를 반환하고, 신규 순서는 download 내림차순인지 검증한다.
2. 별도 `빈 보드로 시작` action이 card count에 포함되지 않는지 검증한다.
3. 기존 여섯 thumbnail hash map을 고정한 채 신규 24개 hash를 합쳐 전체 `Record<TemplateId, TemplateThumbnailAsset>`를 만든다.
4. 각 신규 board를 실제 DiagramEditor에서 1280×720 WebP로 capture하고 manifest에 SHA-256 diagram hash를 기록한다.
5. 두 gallery surface와 Workspace picker에서 30개 card, 검색/tag/resource sort가 동작하는지 검증한다. captured 23개는 apply 가능해야 하고, failed 1개는 preview-only/사용 불가 상태와 이유를 명시하며 apply/deploy 경로에 들어가지 않아야 한다.

## Task 12. 원본 대조 QA, 전체 검증, 완료 기록

**Files**

- Create: `docs/gg/feat-infrastructure-template/020_Brainboard24개템플릿QA결과_gg.md`
- Modify: `docs/gg/006_문서구조_gg.md`
- Modify: `docs/gg/feat-infrastructure-template/brainboard-capture-status.json`

1. Brainboard 원본과 SketchCatch board를 동일한 source bounds로 나란히 capture한다.
2. Template별로 node count/type/address, center/size/parent/z-order, edge count/endpoint/port/path, Terraform address/key reference를 대조한다.
3. 좌표·크기·edge endpoint는 exact equality, 렌더러 차이가 있는 곡선은 fixture SVG path와 runtime path의 동일성을 검사한다.
4. status를 24개 모두 `verified` 또는 구체적인 `failed` 이유로 닫는다. 실패를 성공으로 집계하지 않는다.
5. 전체 검증:

```bash
env PATH=/Users/lgg/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin pnpm harness:check
pnpm catalog:check
pnpm templates:validate
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

6. 최종 보고에는 이슈 #381/branch, 기존 6 회귀, 신규 24 상태, gallery 30 증거, 실패 목록과 이유, 실행한 검증 결과를 포함한다.

## 커밋 단위

1. `Test: 템플릿 ID 경계와 Brainboard source 계약 추가`
2. `Feat: source-exact 템플릿 geometry 보존`
3. `Feat: Brainboard 템플릿 원본 fixture 추가` — capture batch별 분할 가능
4. `Feat: Brainboard 템플릿 Terraform seed와 registry 연결`
5. `Feat: Brainboard 템플릿 24개 갤러리 등록`
6. `Test: Brainboard 템플릿 시각 및 Terraform QA 보강`
7. `Docs: Brainboard 템플릿 24개 QA 결과 기록`
