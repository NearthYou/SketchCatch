# InfrastructureGraph 중심 Workspace 동기화 v1 Implementation Plan

## 마일스톤

1. **계약 고정**
   - shared type에 Terraform block identity, sync request/response, proposal 타입을 추가한다.
   - `fileName`은 identity가 아니라 source 위치 정보라는 정책을 코드와 테스트에 고정한다.

2. **Preview 경로 정리**
   - `DiagramJson -> InfrastructureGraph` projection helper를 만든다.
   - Terraform Preview renderer가 `DiagramJson`을 직접 읽지 않고 `InfrastructureGraph`를 통해 HCL을 만들게 한다.
   - 같은 입력에서 같은 Terraform Preview가 반복 생성되는지 검증한다.

3. **지원 리소스 값 구조 정렬**
   - Terraform Preview 렌더링은 기존 VPC/EC2/S3 계열 리소스 지원을 유지한다.
   - Terraform editor 구조 변경 proposal 범위는 `aws_vpc`, `aws_subnet`, `aws_security_group`, `aws_instance`, `aws_s3_bucket`, `data.aws_ami`로 고정한다.
   - `data.aws_ami.filter` nested block을 parser와 renderer에서 같은 구조로 다루게 한다.
   - 기본 parameter skeleton은 안전한 draft 값만 유지한다.

4. **파라미터 UI 단순화**
   - Advanced Parameters UI를 제거한다.
   - 기존 optional parameter 값은 삭제하지 않고 `parameters.values`에 남아 있으면 보존한다.
   - Metadata와 Main parameters 입력 흐름은 유지한다.

5. **Terraform 역동기화 proposal화**
   - Terraform editor의 변경을 바로 diagram에 적용하지 않는다.
   - Terraform-only block은 `create_candidate`, Diagram-only node는 `delete_candidate`, 명확한 이름 변경은 `rename_candidate`로 반환한다.
   - parser error, unsupported block, duplicate identity가 있으면 자동 반영하지 않는다.

6. **Frontend 승인 흐름 연결**
   - proposal이 있으면 `TerraformCodePanel`에서 즉시 `applyDiagramJson`을 호출하지 않는다.
   - 사용자가 승인한 proposal만 canvas node 생성/삭제/이름 변경에 반영한다.
   - create proposal은 자동 edge를 만들지 않는다.

7. **최종 문서화와 검증**
   - `docs/data-models.md`, AI 작업 지시서, 사람용 설명 문서를 실제 구현 결과에 맞춘다.
   - `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행하고 결과를 기록한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `DiagramJson`, 파라미터 패널, Terraform Preview, Terraform editor 역동기화가 같은 Terraform identity와 값 구조를 사용하도록 정리한다.

**Architecture:** `DiagramJson`은 계속 화면/저장의 원천이고, `InfrastructureGraph`는 Terraform 생성과 동기화를 위한 read-only projection으로 사용한다. Terraform Preview는 `DiagramJson -> InfrastructureGraph -> Terraform` 경로로 만들고, Terraform editor에서 들어온 변경은 proposal로 분리해 사용자 승인 후 `DiagramJson`에 반영한다.

**Tech Stack:** TypeScript, Node test runner, Fastify, React/Next.js, existing Terraform HCL string renderer, `@sketchcatch/types`.

---

## 결정된 정책

- Terraform Preview 렌더링은 기존 지원 범위인 `resource.aws_vpc`, `resource.aws_subnet`, `resource.aws_internet_gateway`, `resource.aws_route_table`, `resource.aws_route_table_association`, `resource.aws_security_group`, `resource.aws_security_group_rule`, `resource.aws_instance`, `resource.aws_s3_bucket`, `data.aws_ami`를 유지한다.
- Terraform editor에서 새로 발견한 구조 변경 proposal 범위는 `resource.aws_vpc`, `resource.aws_subnet`, `resource.aws_security_group`, `resource.aws_instance`, `resource.aws_s3_bucket`, `data.aws_ami`로 제한한다.
- 이미 Diagram과 Terraform identity가 일치하는 기존 block은 parser가 안전하게 읽을 수 있으면 값 동기화 대상으로 유지한다.
- 전체 AWS catalog 지원, 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 이번 범위가 아니다.
- Terraform block identity는 `terraformBlockType/resourceType/resourceName`으로 판단한다.
- `fileName`은 identity가 아니라 source 위치 정보다.
- `InfrastructureGraph`는 DB 저장 원본이나 React state 원본이 아니다.
- Advanced Parameters는 내부 정책이 없으므로 UI에서 제거한다.
- Advanced Parameters 제거 범위는 UI 제거만이다. 기존 `parameters.values`에 저장된 optional 값은 삭제하지 않고 Terraform Preview 렌더링에서도 보존한다.
- Terraform code에서 새 리소스를 발견해도 자동으로 canvas에 추가하지 않는다. proposal을 만들고 사용자가 승인한 것만 반영한다.
- `docs/jh/기타` 문서는 git ignore 대상일 수 있으므로 해당 폴더 문서를 커밋할 때는 `git add -f`를 사용한다.

## 주요 파일 책임

- `packages/types/src/index.ts`
  - Terraform sync request/response 타입, proposal 타입, block identity 관련 타입을 둔다.
- `apps/api/src/services/terraform/infrastructure-graph.ts`
  - `DiagramJson`을 `InfrastructureGraph`로 투영하는 순수 helper를 둔다.
- `apps/api/src/services/terraform/diagram-to-terraform.ts`
  - Terraform Preview HCL 문자열을 만든다. 내부 입력은 `InfrastructureGraphNode` 중심으로 바꾼다.
- `apps/api/src/services/terraform/terraform-to-diagram.ts`
  - Terraform code를 parse하고, 기존 diagram과 비교해 값 갱신 결과와 proposal을 만든다.
- `apps/api/src/routes/terraform.ts`
  - `/terraform/generate`, `/terraform/sync-to-diagram` Zod schema와 응답 계약을 검증한다.
- `apps/web/features/diagram-editor/diagram-utils.ts`
  - 새 diagram node의 안전한 기본 parameter skeleton과 clone/rename 보존 정책을 담당한다.
- `apps/web/features/parameter-input/ParameterInputPanel.tsx`
  - Metadata와 Main parameters만 노출한다. Advanced Parameters UI는 제거한다.
- `apps/web/features/workspace/TerraformCodePanel.tsx`
  - Terraform editor 저장/동기화 흐름을 담당한다. proposal이 있으면 자동 적용하지 않는다.
- `apps/web/features/workspace/api.ts`
  - frontend에서 sync request를 API로 전달한다.

## Commit Plan

### Commit 1: Types 계약 추가

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] `TerraformBlockIdentity` 타입을 추가한다.

```ts
export type TerraformBlockIdentity = {
  terraformBlockType: TerraformBlockType;
  resourceType: string;
  resourceName: string;
};
```

- [ ] Terraform sync proposal 타입을 추가한다.

```ts
export type TerraformDiagramChangeProposal =
  | {
      kind: "create_candidate";
      identity: TerraformBlockIdentity;
      sourceFileName?: string | undefined;
      line?: number | undefined;
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
      nodeId: string;
      resourceAddress: string;
    };
```

- [ ] multi-file sync 입력 타입을 optional로 추가한다.

```ts
export type TerraformSyncFileInput = {
  fileName: string;
  terraformCode: string;
};

export type TerraformSyncToDiagramRequest = {
  diagramJson: DiagramJson;
  terraformCode: string;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
};

export type TerraformSyncToDiagramResponse = {
  diagramJson: DiagramJson;
  diagnostics: TerraformDiagnostic[];
  proposals?: TerraformDiagramChangeProposal[] | undefined;
};
```

- [ ] TypeScript compile 기준으로 기존 호출부가 깨지지 않게 `terraformCode`와 `proposals?`는 backward-compatible하게 둔다.

Run:

```bash
pnpm typecheck
```

Expected:

```txt
No type errors from package contract changes.
```

Commit:

```bash
git add packages/types/src/index.ts
git commit -m "Feat: Terraform 동기화 proposal 타입 추가"
```

### Commit 2: Terraform block identity helper 추가

**Files:**
- Create: `apps/api/src/services/terraform/terraform-identity.ts`
- Create: `apps/api/src/services/terraform/terraform-identity.test.ts`

- [ ] identity 문자열 helper를 추가한다.

```ts
import type { TerraformBlockIdentity } from "@sketchcatch/types";

export function createTerraformBlockAddress(identity: TerraformBlockIdentity): string {
  const prefix = identity.terraformBlockType === "data" ? "data." : "";
  return `${prefix}${identity.resourceType}.${identity.resourceName}`;
}

export function createTerraformBlockIdentityKey(identity: TerraformBlockIdentity): string {
  return `${identity.terraformBlockType}/${identity.resourceType}/${identity.resourceName}`;
}
```

- [ ] `resource.aws_ami.ubuntu`와 `data.aws_ami.ubuntu`가 다른 key가 되는 테스트를 작성한다.
- [ ] `fileName`이 달라도 같은 block identity면 같은 key가 되는 테스트를 작성한다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-identity.test.ts
```

Expected:

```txt
identity helper tests pass.
```

Commit:

```bash
git add apps/api/src/services/terraform/terraform-identity.ts apps/api/src/services/terraform/terraform-identity.test.ts
git commit -m "Feat: Terraform block identity helper 추가"
```

### Commit 3: InfrastructureGraph projection 추가

**Files:**
- Create: `apps/api/src/services/terraform/infrastructure-graph.ts`
- Create: `apps/api/src/services/terraform/infrastructure-graph.test.ts`

- [ ] `buildInfrastructureGraphFromDiagramJson(diagramJson: DiagramJson): InfrastructureGraph`를 추가한다.
- [ ] `node.kind !== "resource"`, `parameters` 없는 node, 지원 범위 밖 resource는 graph에서 제외한다.
- [ ] `parameters.invalid === true`인 node는 Preview skeleton 유지를 위해 제외하지 않는다.
- [ ] graph edge는 graph에 포함된 node끼리의 edge만 유지한다.
- [ ] duplicate identity diagnostic이 필요한 경우 다음 commit에서 처리할 수 있도록 projection helper는 순수하게 node/edge projection만 담당한다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts
```

Expected:

```txt
InfrastructureGraph projection tests pass.
```

Commit:

```bash
git add apps/api/src/services/terraform/infrastructure-graph.ts apps/api/src/services/terraform/infrastructure-graph.test.ts
git commit -m "Feat: DiagramJson InfrastructureGraph projection 추가"
```

### Commit 4: Terraform Preview renderer를 graph 기준으로 전환

**Files:**
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.ts`
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.test.ts`

- [ ] `generateTerraformFromDiagramJson` 내부를 아래 흐름으로 바꾼다.

```txt
DiagramJson
-> buildInfrastructureGraphFromDiagramJson
-> renderTerraformFromInfrastructureGraph
```

- [ ] block header는 `node.iac.terraformBlockType`, `node.iac.resourceType`, `node.iac.resourceName`으로 만든다.
- [ ] body는 `node.config`만 사용한다.
- [ ] 기존 formatting, camelCase-to-snake_case, Terraform reference 무따옴표 출력은 유지한다.
- [ ] 같은 `DiagramJson`을 두 번 넣으면 같은 문자열이 나오는 테스트를 추가한다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts
```

Expected:

```txt
Terraform Preview renderer tests pass.
```

Commit:

```bash
git add apps/api/src/services/terraform/diagram-to-terraform.ts apps/api/src/services/terraform/diagram-to-terraform.test.ts
git commit -m "Feat: InfrastructureGraph 기반 Terraform Preview 생성"
```

### Commit 5: `data.aws_ami` filter 구조 정렬

**Files:**
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.ts`
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.ts`
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.test.ts`
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.test.ts`

- [ ] renderer nested block allowlist에 `aws_ami: new Set(["filter"])`를 추가한다.
- [ ] parser nested block allowlist에도 `aws_ami: new Set(["filter"])`를 추가한다.
- [ ] `filter { name = "..."; values = [...] }`가 `values.filter` 배열로 round-trip 되는 테스트를 추가한다.
- [ ] `data.aws_ami`는 `terraformBlockType: "data"`를 유지한다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts
```

Expected:

```txt
data.aws_ami filter render/sync tests pass.
```

Commit:

```bash
git add apps/api/src/services/terraform/diagram-to-terraform.ts apps/api/src/services/terraform/terraform-to-diagram.ts apps/api/src/services/terraform/diagram-to-terraform.test.ts apps/api/src/services/terraform/terraform-to-diagram.test.ts
git commit -m "Feat: AMI data source filter 동기화 지원"
```

### Commit 6: 기본 parameter skeleton 정책 고정

**Files:**
- Modify: `apps/web/features/diagram-editor/diagram-utils.ts`
- Modify: `apps/web/features/diagram-editor/diagram-utils.test.ts`

- [ ] 현재 있는 `createDefaultParameterValues` 정책을 테스트로 고정한다.
- [ ] `aws_vpc`, `aws_subnet`, `aws_security_group`, `aws_instance`, `aws_s3_bucket`만 기본 skeleton을 가진다.
- [ ] fake reference, public ingress, 임의 S3 bucket name이 자동 생성되지 않는 테스트를 유지한다.
- [ ] nested `tags`, `egress`가 deep clone 되는 테스트를 유지한다.
- [ ] `data.aws_ami` 기본값은 renderer/parser 정렬 후에도 자동 skeleton 생성 대상에 넣지 않는다.

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts
```

Expected:

```txt
diagram default parameter skeleton tests pass.
```

Commit:

```bash
git add apps/web/features/diagram-editor/diagram-utils.ts apps/web/features/diagram-editor/diagram-utils.test.ts
git commit -m "Test: 기본 파라미터 skeleton 정책 고정"
```

### Commit 7: Advanced Parameters UI 제거

**Files:**
- Modify: `apps/web/features/parameter-input/ParameterInputPanel.tsx`
- Modify: `apps/web/features/parameter-input/ParameterInputPanel.module.css`
- Modify: `apps/web/features/parameter-input/validation.test.ts`

- [ ] `ParameterInputPanel.tsx`에서 `advanced-parameters` import를 제거한다.
- [ ] `advancedParameterQuery`, `addedOptionalParameterNames`, `advancedDefinitions`, `availableAdvancedDefinitions`, `advancedPickerEmptyMessage` 계산을 제거한다.
- [ ] `addAdvancedParameter`, `removeAdvancedParameter` handler를 제거한다.
- [ ] `<section aria-label="Advanced Parameters">...</section>` 전체를 제거한다.
- [ ] `Search`, `Plus`, `Trash2` 중 Advanced UI에서만 쓰던 icon import를 제거한다.
- [ ] CSS에서 Advanced UI에서만 쓰는 selector를 제거하되 Main/Metadata 스타일은 건드리지 않는다.
- [ ] 기존 optional 값은 `mergeNodeParameters`, `validateParameters`, Terraform renderer가 계속 보존하도록 값 삭제 로직을 추가하지 않는다.
- [ ] 기존 optional value가 있는 node를 저장해도 해당 key가 사라지지 않는 테스트를 추가한다.

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/parameter-input/validation.test.ts
pnpm typecheck
```

Expected:

```txt
Advanced Parameters UI references are removed and typecheck passes.
```

Commit:

```bash
git add apps/web/features/parameter-input/ParameterInputPanel.tsx apps/web/features/parameter-input/ParameterInputPanel.module.css apps/web/features/parameter-input/validation.test.ts
git commit -m "Feat: Advanced Parameters UI 제거"
```

### Commit 8: Terraform sync request schema 확장

**Files:**
- Modify: `apps/api/src/routes/terraform.ts`
- Modify: `apps/api/src/routes/terraform.test.ts`
- Modify: `apps/web/features/workspace/api.ts`

- [ ] `/terraform/sync-to-diagram` request schema에 optional `terraformFiles`를 추가한다.
- [ ] `terraformFiles`가 있으면 API service에 파일 목록을 전달하고, 없으면 기존 `terraformCode`를 사용한다.
- [ ] frontend `syncTerraformToDiagram` 함수 input에 optional `terraformFiles`를 추가한다.
- [ ] 기존 호출부는 `terraformCode`만 보내도 계속 동작해야 한다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/routes/terraform.test.ts
pnpm typecheck
```

Expected:

```txt
sync-to-diagram route accepts legacy and multi-file requests.
```

Commit:

```bash
git add apps/api/src/routes/terraform.ts apps/api/src/routes/terraform.test.ts apps/web/features/workspace/api.ts
git commit -m "Feat: Terraform sync multi-file 입력 추가"
```

### Commit 9: Terraform parser source metadata 추가

**Files:**
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.ts`
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.test.ts`

- [ ] parser 내부 입력을 `{ fileName, terraformCode }[]`로 정규화한다.
- [ ] `ParsedBlock`에 `sourceFileName`, `line`을 유지한다.
- [ ] diagnostic/proposal에는 가능한 경우 `line`, `resourceAddress`, source file 정보를 담는다.
- [ ] 기존 단일 문자열 호출은 내부에서 `main.tf` 또는 기존 기본 파일명으로 정규화한다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts
```

Expected:

```txt
Terraform parser keeps source metadata and legacy behavior.
```

Commit:

```bash
git add apps/api/src/services/terraform/terraform-to-diagram.ts apps/api/src/services/terraform/terraform-to-diagram.test.ts
git commit -m "Feat: Terraform parser source metadata 보존"
```

### Commit 10: 기존 리소스 값 동기화 안정화

**Files:**
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.ts`
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.test.ts`

- [ ] Diagram node map을 address 문자열이 아니라 `TerraformBlockIdentity` key 기준으로 만든다.
- [ ] 같은 identity가 여러 diagram node에 있으면 `terraform.sync.duplicate_diagram_identity` error diagnostic을 반환한다.
- [ ] parser error, unsupported block, duplicate Terraform address가 있으면 `diagramJson`을 원본 그대로 반환한다.
- [ ] matched block은 기존 node의 `parameters.values`만 갱신한다.
- [ ] `resourceName`, `resourceType`, `terraformBlockType`, `fileName`은 matched value sync에서 덮어쓰지 않는다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts
```

Expected:

```txt
Matched Terraform blocks update values only and no-mutation diagnostics are enforced.
```

Commit:

```bash
git add apps/api/src/services/terraform/terraform-to-diagram.ts apps/api/src/services/terraform/terraform-to-diagram.test.ts
git commit -m "Fix: Terraform sync matched 값 갱신 안정화"
```

### Commit 11: create proposal 생성

**Files:**
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.ts`
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.test.ts`

- [ ] Terraform에만 있는 proposal 지원 block은 `create_candidate` proposal로 반환한다.
- [ ] proposal의 `parameters.values`에는 Terraform parser가 읽은 값을 그대로 넣는다.
- [ ] unsupported resource는 proposal이 아니라 diagnostic으로 둔다.
- [ ] proposal이 있어도 `diagramJson`에는 matched value sync 결과만 담고, 새 node는 자동 생성하지 않는다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts
```

Expected:

```txt
Terraform-only supported blocks return create proposals without mutating DiagramJson nodes.
```

Commit:

```bash
git add apps/api/src/services/terraform/terraform-to-diagram.ts apps/api/src/services/terraform/terraform-to-diagram.test.ts
git commit -m "Feat: Terraform 리소스 생성 proposal 추가"
```

### Commit 12: delete/rename proposal 생성

**Files:**
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.ts`
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.test.ts`

- [ ] Diagram에만 있는 proposal 지원 node는 `delete_candidate` proposal로 반환한다.
- [ ] 같은 `terraformBlockType/resourceType/normalized values` 그룹에서 diagram-only 1개와 terraform-only 1개가 정확히 한 쌍일 때만 `rename_candidate`를 반환한다.
- [ ] type 변경은 rename으로 처리하지 않고 delete/create proposal로 둔다.
- [ ] proposal이 있어도 사용자 승인 전에는 DiagramJson에서 node를 삭제하거나 이름 변경하지 않는다.

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-to-diagram.test.ts
```

Expected:

```txt
Delete and deterministic rename proposals are returned safely.
```

Commit:

```bash
git add apps/api/src/services/terraform/terraform-to-diagram.ts apps/api/src/services/terraform/terraform-to-diagram.test.ts
git commit -m "Feat: Terraform 삭제와 이름 변경 proposal 추가"
```

### Commit 13: Workspace proposal apply helper 추가

**Files:**
- Create: `apps/web/features/workspace/terraform-sync-proposals.ts`
- Create: `apps/web/features/workspace/terraform-sync-proposals.test.ts`

- [ ] `applyTerraformSyncProposals(diagramJson, proposals, approvedProposalIds)` 순수 helper를 만든다.
- [ ] create 승인 시 새 resource node를 추가한다.
- [ ] delete 승인 시 node와 연결된 edge를 제거한다.
- [ ] rename 승인 시 `parameters.resourceName`과 label을 갱신한다.
- [ ] 승인하지 않은 proposal은 반영하지 않는다.
- [ ] create node는 자동 edge를 만들지 않는다.

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts
```

Expected:

```txt
Proposal apply helper tests pass.
```

Commit:

```bash
git add apps/web/features/workspace/terraform-sync-proposals.ts apps/web/features/workspace/terraform-sync-proposals.test.ts
git commit -m "Feat: Terraform sync proposal 적용 helper 추가"
```

### Commit 14: TerraformCodePanel 승인 흐름 연결

**Files:**
- Modify: `apps/web/features/workspace/TerraformCodePanel.tsx`
- Modify: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Modify if needed: `apps/web/features/workspace/terraform-panel-utils.ts`

- [ ] `syncTerraformCodeToDiagram`에서 `syncResult.proposals?.length`가 1개 이상이면 `context.applyDiagramJson`을 즉시 호출하지 않는다.
- [ ] proposal 목록을 panel state에 보관한다.
- [ ] 사용자가 승인한 proposal만 `applyTerraformSyncProposals`로 반영한다.
- [ ] diagnostic error가 있으면 기존처럼 저장 실패로 처리한다.
- [ ] proposal이 없으면 기존처럼 matched value sync 결과를 자동 적용한다.

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-sync-proposals.test.ts
pnpm typecheck
```

Expected:

```txt
Terraform panel no longer auto-applies proposal changes.
```

Commit:

```bash
git add apps/web/features/workspace/TerraformCodePanel.tsx apps/web/features/workspace/workspace-right-panel-layout.test.ts apps/web/features/workspace/terraform-panel-utils.ts
git commit -m "Feat: Terraform sync proposal 승인 흐름 연결"
```

### Commit 15: 문서와 최종 검증

**Files:**
- Modify: `docs/data-models.md`
- Modify: `docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md`
- Modify: `docs/jh/기타/009_InfrastructureGraphWorkspace동기화v1_사람용설명_JH.md`
- Modify: `agent-progress.md`
- Modify if needed: `session-handoff.md`

- [ ] `docs/data-models.md`에 proposal response, block identity, Advanced Parameters UI 제거 정책을 짧게 기록한다.
- [ ] AI 작업 지시서와 사람용 설명 문서를 실제 구현 결과에 맞게 갱신한다.
- [ ] `agent-progress.md`에 실행한 검증과 남은 리스크를 기록한다.
- [ ] 다음 세션이 이어받아야 할 미완성이 있으면 `session-handoff.md`를 갱신한다.

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected:

```txt
All required checks pass.
```

Commit:

```bash
git add docs/data-models.md agent-progress.md session-handoff.md
git add -f docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md docs/jh/기타/009_InfrastructureGraphWorkspace동기화v1_사람용설명_JH.md
git commit -m "Docs: InfrastructureGraph 동기화 v1 계약 정리"
```

## Acceptance Criteria

- 같은 `DiagramJson`에서 Terraform Preview가 반복 생성된다.
- Terraform Preview 생성 경로가 내부적으로 `InfrastructureGraph`를 거친다.
- Main parameters와 Metadata 입력은 유지된다.
- Advanced Parameters UI는 보이지 않는다.
- 기존 optional parameter 값은 저장/동기화 과정에서 임의로 삭제되지 않는다.
- Terraform code에만 있는 proposal 지원 리소스는 create proposal로 제안된다.
- Diagram에만 있는 proposal 지원 리소스는 delete proposal로 제안된다.
- 명확한 이름 변경은 rename proposal로 제안된다.
- proposal 승인 전에는 diagram node/edge가 바뀌지 않는다.
- parser error, unsupported block, duplicate identity가 있으면 자동 반영하지 않는다.

## 질문이 필요한 경우

구현 중 아래 상황이 나오면 임의로 결정하지 말고 사용자에게 질문한다.

- v1 지원 리소스 목록을 넘어서는 AWS resource를 포함해야 하는 경우
- Advanced Parameters를 UI만 숨길지, 저장/렌더링까지 차단할지 다시 바꾸려는 경우
- Terraform code에서 자동 edge 생성까지 하려는 경우
- 실제 Terraform apply/destroy 또는 cloud mutation이 필요해지는 경우
- `InfrastructureGraph`를 DB 저장 원본으로 승격해야 하는 경우
