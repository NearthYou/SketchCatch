# AWS Template 구현 계획

> **For agentic workers:** 승인된 `008_AWS템플릿구현설계_gg.md`를 기준으로 작업한다. 각 단계는 failing test → 실패 확인 → 최소 구현 → 통과 확인 순서로 진행한다.

**Goal:** 여섯 AWS Template을 공통 `TemplateDefinition`에서 생성하고, 기본값으로 Terraform Preview·Pre-Deployment Check·Direct Deployment·cleanup까지 연결한다.

**Architecture:** Template 정의와 Resource identity는 shared `packages/types`에서 관리한다. Web은 같은 정의로 Template 카탈로그와 `DiagramJson`을 만들고, API는 기존 Infrastructure Graph/Terraform renderer와 배포 안전 게이트를 재사용한다. EKS는 AWS infra와 Kubernetes workload provider 경계를 명시하고 하나의 논리적 Deployment 안에서 단계별 실행 시간을 기록한다.

**Tech Stack:** TypeScript, Next.js, React, Fastify, Drizzle, Terraform, AWS provider, Kubernetes provider, node:test/tsx, Chrome extension browser QA.

## Global Constraints

- 현재 `docs/gg/feat-infrastructure-template/007_AWS템플릿패턴_gg.md`의 여섯 패턴을 모두 지원한다.
- 없는 Resource는 임시 보드 노드로 숨기지 않고 shared definition, catalog, parameter, Terraform generator, validation, 테스트까지 추가한다.
- 실제 AWS apply/destroy는 verified AWS connection, plan, approval, log masking, cleanup 흐름 안에서만 수행한다.
- Chrome에서 실제 배포 버튼을 사용한 결과만 live deployment 성공 증거로 기록한다.
- TypeScript에서 `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, non-null assertion을 사용하지 않는다.
- 기존 unrelated dirty work는 staging하거나 되돌리지 않는다.

---

### Task 1: Shared TemplateDefinition 계약과 여섯 Template registry

**Files:**
- Create: `packages/types/src/template-definitions.ts`
- Create: `packages/types/src/template-definitions.test.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/package.json` if subpath export is needed

**Produces:**
- `TemplateId` union for the six patterns
- readonly `TemplateDefinition`, `TemplateResourceDefinition`, `TemplateRelationship`, `TemplateParameterDefinition`
- `templateDefinitions` registry
- `getTemplateDefinitionById(id)` lookup
- `buildTemplateDiagramJson(templateId, input)` contract for deterministic board output

- [ ] **Step 1: Write the failing test**

  Assert that the registry contains exactly six IDs, every definition has at least one Resource and relationship metadata, and `buildTemplateDiagramJson` returns stable IDs and non-empty Terraform parameters for every definition.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `pnpm --filter @sketchcatch/types exec tsx --test src/template-definitions.test.ts`
  Expected: FAIL because the registry and builder do not exist.

- [ ] **Step 3: Implement the smallest shared contract and registry**

  Keep metadata and graph construction in the shared package. Make generated names deterministic from `projectSlug`, `templateId`, and `shortId`; do not read browser storage or environment variables from the shared builder.

- [ ] **Step 4: Run the focused test and typecheck**

  Run: `pnpm --filter @sketchcatch/types exec tsx --test src/template-definitions.test.ts` and `pnpm --filter @sketchcatch/types typecheck`
  Expected: PASS with six definitions and deterministic output.

---

### Task 2: Missing ResourceDefinition, provider identity, catalog, and parameter support

**Files:**
- Create: `packages/types/src/resource-definitions.test.ts` if the shared resource contract lacks direct coverage
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/resource-definitions.ts`
- Modify: `apps/web/features/resource-settings/catalog.ts`
- Modify: `apps/web/features/parameter-input/catalog.generated.ts` or its generator input, following the existing generation path
- Modify: `apps/api/src/services/terraform/terraform-nested-blocks.ts`
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.ts`
- Modify: `apps/api/src/services/terraform/terraform-to-diagram.ts`
- Modify: `apps/api/src/services/terraform/terraform-diagnostics.ts`
- Modify: `apps/api/src/deployments/terraform-artifact-safety.ts`
- Test: `apps/api/src/services/terraform/resource-definitions-source-shape.test.ts`
- Test: `apps/api/src/services/terraform/terraform-preview.test.ts`
- Test: `apps/api/src/services/terraform/terraform-to-diagram.test.ts`

**Produces:**
- All AWS Resource identities needed by the six definitions have `terraformPreview` and `terraformSync` support.
- `CloudProvider` and ResourceDefinition can represent Kubernetes provider resources without pretending they are AWS Resources.
- Terraform references and nested blocks support the generated EKS workload shape.
- Artifact safety accepts only the approved AWS/Kubernetes provider sources and still rejects credentials and arbitrary providers.

- [ ] **Step 1: Write failing coverage for every required Terraform resource identity**

  Build a table-driven test from the six definitions and assert that each Resource resolves through `getResourceDefinitionByTerraform`, has preview/sync capabilities, and has a catalog entry.

- [ ] **Step 2: Run the focused resource coverage and record missing identities**

  Run: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/resource-definitions-source-shape.test.ts src/services/terraform/terraform-preview.test.ts`
  Expected: FAIL listing the first unsupported resource identities instead of silently dropping them.

- [ ] **Step 3: Add only the missing identities and provider-aware Terraform rendering**

  Add `kubernetes_namespace`, `kubernetes_deployment`, and `kubernetes_service` with explicit provider identity. Add the minimum nested blocks required for `metadata`, `spec`, `container`, `selector`, and `port`. Expand reference parsing for `kubernetes_*` and keep all provider sources allowlisted.

- [ ] **Step 4: Run Terraform unit tests and source-shape checks**

  Run: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/resource-definitions-source-shape.test.ts src/services/terraform/terraform-preview.test.ts src/services/terraform/terraform-to-diagram.test.ts src/deployments/terraform-artifact-safety.test.ts`
  Expected: PASS without weakening existing AWS safety tests.

---

### Task 3: Replace the browser-only template fixtures with the shared registry

**Files:**
- Modify: `apps/web/features/resource-settings/template-library.ts`
- Modify: `apps/web/features/resource-settings/template-library.test.ts`
- Modify: `apps/web/features/resource-settings/index.tsx`
- Modify: `apps/web/app/templates/templates-client.tsx`
- Modify: `apps/web/app/templates/templates-client.test.ts`

**Produces:**
- Six Template cards using `TemplateDefinition` metadata.
- One clone-safe `DiagramJson` builder for the dashboard page and Architecture Board modal.
- Existing overwrite backup behavior preserved.
- User-facing cards show supported providers, resource count, deployment readiness, and cost/security notes.

- [ ] **Step 1: Write failing web tests**

  Assert six cards, unique IDs, non-empty nodes and edges where the pattern has relationships, provider labels, and clone isolation between two calls to `listBoardTemplates`.

- [ ] **Step 2: Run the focused web tests and verify failure**

  Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/template-library.test.ts app/templates/templates-client.test.ts`
  Expected: FAIL because the current library still contains only three hand-authored fixtures.

- [ ] **Step 3: Wire the shared registry into the library and surfaces**

  Keep `applyTemplateToDiagramWithBackup` unchanged at its boundary, but make its `BoardTemplate` values come from `buildTemplateDiagramJson`. Remove only obsolete fixture data; do not remove the existing backup flow.

- [ ] **Step 4: Run focused web tests and typecheck**

  Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/template-library.test.ts app/templates/templates-client.test.ts` and `pnpm --filter @sketchcatch/web typecheck`
  Expected: PASS with six usable templates.

---

### Task 4: Generate and validate Terraform Preview for all six patterns

**Files:**
- Create: `apps/api/src/services/terraform/template-terraform-preview.test.ts`
- Modify: `apps/api/src/services/terraform/terraform-preview.ts` only if provider/header or staged artifact support is required
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.ts` only for proven template cases
- Modify: `apps/api/src/services/terraform/infrastructure-graph.ts` only for proven provider/relationship cases
- Modify: `docs/gg/feat-infrastructure-template/007_AWS템플릿패턴_gg.md` with final supported Resource identity notes when implementation changes the document's current status

**Produces:**
- Every template produces deterministic Terraform blocks with references rather than placeholder strings.
- Static, serverless, network, ECS, and EKS default outputs pass the repository's Terraform diagnostics and safety checks.
- Unsupported or missing required values fail with an actionable diagnostic before Deployment.

- [ ] **Step 1: Write one fixture assertion per Template**

  Assert required block addresses, key references, least-privilege defaults, and provider declarations. EKS must assert the AWS infra/workload boundary and staged metadata rather than pretending one provider owns both.

- [ ] **Step 2: Run the test and verify missing renderer behavior**

  Run: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/template-terraform-preview.test.ts`
  Expected: FAIL for each unsupported block or invalid reference.

- [ ] **Step 3: Implement renderer fixes only for failing fixture requirements**

  Reuse existing nested-block and reference rendering helpers. Do not add a second Terraform renderer or hide missing nodes from the Infrastructure Graph.

- [ ] **Step 4: Run preview, diagnostics, and safety checks**

  Run: `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/template-terraform-preview.test.ts src/services/terraform/terraform-diagnostics.test.ts src/deployments/terraform-artifact-safety.test.ts`
  Expected: PASS.

---

### Task 5: Connect Template selection to a real Workspace and Deployment setup

**Files:**
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`
- Modify: `apps/web/features/workspace/ResourceWorkspacePanel.tsx` or the nearest existing template entry surface identified by the current callsite
- Modify: `apps/web/features/workspace/api.ts` only if deployment setup needs template metadata
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`
- Modify: `apps/web/features/workspace/deployment-actions.ts`
- Test: relevant existing workspace and deployment tests, plus new focused tests beside changed pure helpers

**Produces:**
- A user can select any of the six Template definitions, apply it to a new or existing board with backup, preview Terraform, run Pre-Deployment Check, approve, and start Direct Deployment.
- Deployment setup uses the existing verified AWS connection gate and does not call AWS SDK or Terraform from the browser.
- EKS displays its staged deployment requirement before the user approves.

- [ ] **Step 1: Write failing interaction/state tests**

  Cover six template selection, backup before replacement, disabled deployment when the connection or Terraform diagnostics are invalid, and visible staged EKS warning.

- [ ] **Step 2: Run focused tests and verify failure**

  Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-actions.test.ts features/resource-settings/template-library.test.ts`
  Expected: FAIL on the new six-template and staged-deployment cases.

- [ ] **Step 3: Implement the smallest wiring changes**

  Preserve existing deployment approval and cleanup boundaries. Add only the state needed to route a selected Template into the current Workspace and DeploymentPanel.

- [ ] **Step 4: Run focused tests, lint, and typecheck**

  Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-actions.test.ts features/resource-settings/template-library.test.ts`, `pnpm --filter @sketchcatch/web lint`, and `pnpm --filter @sketchcatch/web typecheck`
  Expected: PASS.

---

### Task 6: Record and show Deployment Duration

**Files:**
- Create: `apps/web/features/workspace/deployment-duration.ts`
- Create: `apps/web/features/workspace/deployment-duration.test.ts`
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`
- Modify: `packages/types/src/index.ts` only if the existing Deployment contract cannot expose the required stage timing
- Modify: `apps/api/src/deployments/deployment-service.ts` only if server-side stage timestamps are not already sufficient

**Produces:**
- `formatDeploymentDuration(startedAt, completedAt, now?)` with deterministic seconds/minutes formatting.
- Success and failure screens show elapsed time; EKS shows total and stage durations when available.
- Chrome QA can record click-to-terminal duration without relying on a fixed sleep.

- [ ] **Step 1: Write failing duration tests**

  Cover null timestamps, sub-minute values, minute/second boundaries, success, failure, and an in-progress deployment using an injected `now` value.

- [ ] **Step 2: Run the focused test and verify failure**

  Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-duration.test.ts`
  Expected: FAIL because the formatter does not exist.

- [ ] **Step 3: Implement pure duration formatting and panel display**

  Use existing `startedAt`, `completedAt`, `failedAt`, and `updatedAt` fields before expanding the API contract. The UI must say whether the displayed time is in progress, succeeded, or failed.

- [ ] **Step 4: Run focused tests and workspace checks**

  Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-duration.test.ts features/workspace/deployment-actions.test.ts`, `pnpm --filter @sketchcatch/web lint`, and `pnpm --filter @sketchcatch/web typecheck`
  Expected: PASS.

---

### Task 7: Live Chrome QA, cleanup, and gg verification record

**Files:**
- Create after live runs: `docs/gg/feat-infrastructure-template/010_AWS템플릿배포검증기록_gg.md`
- Modify: `docs/gg/feat-infrastructure-template/007_AWS템플릿패턴_gg.md` with verified status and measured durations

- [ ] **Step 1: Run repository checks before live work**

  Run: `pnpm harness:check`, `pnpm catalog:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

- [ ] **Step 2: Start the local app and connect Chrome**

  Use the existing Chrome extension session. If the SketchCatch tab or verified AWS connection is missing, stop and tell the user immediately.

- [ ] **Step 3: Drive each Template through the real surface**

  For each of six patterns: select Template, inspect board, preview Terraform, run check, approve, click deploy, observe terminal state, capture exact elapsed time, inspect resources/outputs, create destroy plan, destroy, and record cleanup result. Do not use fixed sleeps as success criteria.

- [ ] **Step 4: Run visual QA and inspect console**

  Verify the Template catalog, Workspace, DeploymentPanel, duration state, failure state, and EKS staged state at 375px, 768px, and 1280px using the existing `DESIGN.md` tokens. Read browser console logs and fix any error or warning caused by this change.

- [ ] **Step 5: Write the verification record**

  Record each pattern's account-independent identifier, start/end timestamps, total duration, stage durations, status, cleanup result, and any remaining risk. Never record credentials, tokens, or account secrets.

---

## Final checks

After all tasks:

```bash
pnpm harness:check
pnpm catalog:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Completion requires all six Template paths to pass focused tests and Chrome live QA. A build or unit test pass without a real deployment/cleanup observation is not sufficient.
