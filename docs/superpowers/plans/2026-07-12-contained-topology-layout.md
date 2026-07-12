# Contained Topology Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Template start as a compact, containment-aware Workspace topology and project that same topology in the Gallery.

**Architecture:** Add a pure Template-only topology arranger after strict catalog materialization. It derives only defensible area parents from Terraform references, recursively lays out area children in directed flow lanes, fits area bounds, and leaves tolerant saved-draft hydration untouched. Existing AI/Reverse Workspace conversion keeps its established containment-aware adapter layout.

**Tech Stack:** TypeScript, Next.js, Node test runner, shared `DiagramJson` types.

## Global Constraints

- Reuse `resourceCatalog` and `createDiagramNodeFromPayload`; do not invent resource assets.
- Preserve user-saved draft coordinates and all diagram identifiers, Terraform parameters, and edges.
- Do not add dependencies or change lockfiles.
- Use only explicit metadata or resolvable Terraform references for containment.

---

### Task 1: Build the pure Template topology arranger

**Files:**

- Create: `apps/web/features/resource-settings/template-topology-layout.ts`
- Test: `apps/web/features/resource-settings/template-topology-layout.test.ts`

**Interfaces:**

- Produces `arrangeTemplateTopology(diagram: DiagramJson): DiagramJson`.
- The result must preserve node/edge identity and Terraform values.

- [ ] **Step 1: Write the failing containment test**

```ts
test("arrangeTemplateTopology keeps resolvable API resources inside their VPC", () => {
  const arranged = arrangeTemplateTopology(makeVpcApiDiagram());
  assertContains(arranged, "vpc", "ec2");
  assertContains(arranged, "vpc", "rds");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-topology-layout.test.ts`

Expected: FAIL because the arranger does not exist.

- [ ] **Step 3: Implement the arranger**

```ts
export function arrangeTemplateTopology(diagram: DiagramJson): DiagramJson {
  const nodesWithParents = inferResolvableAreaParents(diagram.nodes);
  const positionedNodes = layoutAreaTree(nodesWithParents, diagram.edges);
  return { ...diagram, nodes: applyTopologyLayerOrder(positionedNodes) };
}
```

`inferResolvableAreaParents` must prefer existing parent metadata, resolve `subnetId`, `vpcId`, `routeTableId`, and `autoscalingGroupName`, and leave ambiguous references at root. `layoutAreaTree` must process innermost areas first, order direct siblings by edge lane then stable source position/id, and fit areas around direct children.

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-topology-layout.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add apps/web/features/resource-settings/template-topology-layout.ts apps/web/features/resource-settings/template-topology-layout.test.ts
git commit -m "Feat: 템플릿 포함관계 레이아웃 추가"
```

### Task 2: Apply topology to every new Template board

**Files:**

- Modify: `apps/web/features/resource-settings/template-resource-materializer.ts`
- Modify: `apps/web/features/resource-settings/template-resource-materializer.test.ts`
- Modify: `apps/web/features/resource-settings/template-library.test.ts`

**Interfaces:**

- Strict `materializeTemplateDiagram` consumes `arrangeTemplateTopology`.
- Tolerant `hydrateCatalogResourceNodes` retains saved positions.

- [ ] **Step 1: Write the failing integration test**

```ts
test("strict materialization arranges every built-in template without moving tolerant drafts", () => {
  for (const template of listBoardTemplates()) assertNoOverlappingSiblings(template.diagramJson);
  assert.deepEqual(hydrateCatalogResourceNodes(savedDraft).nodes[0]?.position, savedDraft.nodes[0]?.position);
});
```

- [ ] **Step 2: Run the integration tests and verify they fail**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts`

Expected: FAIL because strict materialization does not invoke the arranger.

- [ ] **Step 3: Apply layout only in strict materialization**

```ts
export function materializeTemplateDiagram(diagram: DiagramJson): DiagramJson {
  return arrangeTemplateTopology(materializeCatalogResourceNodes(diagram, "strict"));
}

export function hydrateCatalogResourceNodes(diagram: DiagramJson): DiagramJson {
  return materializeCatalogResourceNodes(diagram, "tolerant");
}
```

- [ ] **Step 4: Run the integration tests and verify they pass**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add apps/web/features/resource-settings/template-resource-materializer.ts apps/web/features/resource-settings/template-resource-materializer.test.ts apps/web/features/resource-settings/template-library.test.ts
git commit -m "Feat: 모든 템플릿 Workspace 배치 정돈"
```

### Task 3: Keep Gallery projection contained

**Files:**

- Modify: `apps/web/components/templates/template-preview-model.test.ts`
- Modify: `apps/web/components/templates/TemplateGallery.tsx` only if area-frame ordering needs correction.

- [ ] **Step 1: Write a failing projection test**

```ts
test("template preview projects contained resources inside their area frame", () => {
  const model = createTemplatePreviewModel(listBoardTemplates().find(isApiTemplate)!.diagramJson);
  assertProjectedContainment(model, "template-api-vpc", "template-api-ec2");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --dir apps/web exec tsx --test components/templates/template-preview-model.test.ts`

Expected: FAIL until the projected area frame and resource coordinates share the same bounds.

- [ ] **Step 3: Keep the smallest correct renderer adjustment**

Area frames stay behind edges and resource tiles; visible-only edges and label-free icon tiles remain unchanged.

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --dir apps/web exec tsx --test components/templates/template-preview-model.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add apps/web/components/templates/template-preview-model.test.ts apps/web/components/templates/TemplateGallery.tsx
git commit -m "Fix: 템플릿 미리보기 포함관계 유지"
```

### Task 4: Verify affected creation paths

- [ ] **Step 1: Run the focused suite**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-topology-layout.test.ts features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts components/templates/template-preview-model.test.ts`

Expected: PASS.

- [ ] **Step 2: Run shared-worktree checks**

Run: `pnpm harness:check` and `pnpm --filter @sketchcatch/web lint`

Expected: PASS; report unrelated shared-worktree failures without modifying unrelated files.

- [ ] **Step 3: Inspect every built-in Template output**

Run: `pnpm --dir apps/web exec tsx -e 'import { listBoardTemplates } from "./features/resource-settings/template-library"; console.log(listBoardTemplates().map((template) => ({ id: template.id, nodes: template.diagramJson.nodes.length })))'`

Expected: each Template returns materialized, contained DiagramJson.
