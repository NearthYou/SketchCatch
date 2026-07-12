# Template Catalog Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Template nodes from the Workspace resource catalog and show readable, icon-based previews for every Template.

**Architecture:** A web-only materializer bridges Template DiagramJson data to `resourceCatalog` and the existing drag-payload node factory. Template construction uses strict catalog resolution; existing project drafts use tolerant icon hydration. A pure gallery preview model selects and lays out a bounded visible subset before the React SVG renders it.

**Tech Stack:** TypeScript, Next.js/React, SVG, Node test runner, existing Workspace resource catalog.

## Global Constraints

- Preserve the user-owned dirty files outside this task.
- Do not add dependencies or modify shared types merely to reach the frontend catalog.
- Keep Template-specific Terraform parameters, IDs, edges, positions, and deliberate area geometry.
- Reuse `resourceCatalog` and `createDiagramNodeFromPayload`; do not hardcode AWS asset paths in Template code.
- Unknown nodes in legacy drafts remain unchanged; missing Template catalog entries fail with their Terraform identity.

---

### Task 1: Catalog-backed Template node materialization

**Files:**
- Create: `apps/web/features/resource-settings/template-resource-materializer.ts`
- Test: `apps/web/features/resource-settings/template-resource-materializer.test.ts`
- Modify: `apps/web/features/resource-settings/template-library.ts`

**Interfaces:**
- Consumes: `DiagramJson`, `DiagramNode`, `resourceCatalog`, and `createDiagramNodeFromPayload`.
- Produces: `materializeTemplateDiagram(diagram: DiagramJson): DiagramJson` and `hydrateCatalogResourceNodes(diagram: DiagramJson): DiagramJson`.

- [ ] **Step 1: Write the failing materializer tests**

```ts
test("materializes an S3 Template node from its palette ResourceItem", () => {
  const diagram = materializeTemplateDiagram(makeDiagram("aws_s3_bucket"));
  assert.equal(diagram.nodes[0]?.iconUrl, findCatalog("aws_s3_bucket").iconUrl);
  assert.equal(diagram.nodes[0]?.kind, "resource");
});

test("reports an unavailable Template resource instead of drawing a fallback", () => {
  assert.throws(() => materializeTemplateDiagram(makeDiagram("aws_not_available")), /resource\/aws_not_available/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-resource-materializer.test.ts`

Expected: FAIL because the materializer module does not exist.

- [ ] **Step 3: Implement the pure materializer**

```ts
export function materializeTemplateDiagram(diagram: DiagramJson): DiagramJson {
  return { ...diagram, nodes: diagram.nodes.map((node, index) => materializeNode(node, diagram.nodes.slice(0, index), true)) };
}

export function hydrateCatalogResourceNodes(diagram: DiagramJson): DiagramJson {
  return { ...diagram, nodes: diagram.nodes.map((node, index) => materializeNode(node, diagram.nodes.slice(0, index), false)) };
}
```

Resolve the catalog item by `(terraformBlockType ?? "resource", resourceType ?? type)`, invoke `createDiagramNodeFromPayload`, preserve the Template's stable fields, merge Template parameters over catalog defaults, and retain original area dimensions only when they exceed the palette area size.

- [ ] **Step 4: Route both Template sources through strict materialization**

```ts
export function listBoardTemplates(): readonly BoardTemplate[] {
  return boardTemplates.map((template) => ({
    ...template,
    diagramJson: materializeTemplateDiagram(cloneDiagramJson(template.diagramJson))
  }));
}

export function buildBoardTemplateDiagram(...) {
  return definition ? materializeTemplateDiagram(buildTemplateDiagramJson(definition.id, input)) : undefined;
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts`

Expected: PASS.

### Task 2: Existing Workspace draft icon hydration

**Files:**
- Modify: `apps/web/app/workspace/workspace-project-client.tsx`
- Test: `apps/web/app/workspace/workspace-project-client.test.ts` (or existing source-contract test if this client has no behavioral test seam)

**Interfaces:**
- Consumes: `hydrateCatalogResourceNodes`.
- Produces: a hydrated `initialDiagram` for the Workspace editor without changing non-catalog legacy nodes.

- [ ] **Step 1: Write the failing hydration test**

```ts
test("workspace draft loading hydrates catalog resource icons before setting initialDiagram", () => {
  assert.match(source, /hydrateCatalogResourceNodes\(restoreSavedDiagram/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --dir apps/web exec tsx --test app/workspace/workspace-project-client.test.ts`

Expected: FAIL because the loaded diagram is passed through unchanged.

- [ ] **Step 3: Hydrate the selected draft before it is stored or rendered**

```ts
const selectedDiagram = hydrateCatalogResourceNodes(
  restoreSavedDiagram(loaded.diagramJson, fallbackDiagram)
);
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --dir apps/web exec tsx --test app/workspace/workspace-project-client.test.ts`

Expected: PASS.

### Task 3: Icon-based, bounded gallery preview

**Files:**
- Create: `apps/web/components/templates/template-preview-model.ts`
- Test: `apps/web/components/templates/template-preview-model.test.ts`
- Modify: `apps/web/components/templates/TemplateGallery.tsx`
- Modify: `apps/web/components/templates/TemplateGallery.module.css`

**Interfaces:**
- Consumes: a materialized `DiagramJson` and `isRenderableDiagramNode`.
- Produces: `createTemplatePreviewModel(diagramJson)` with visible nodes, visible edges, area bounds, and an overflow count.

- [ ] **Step 1: Write the failing preview-model tests**

```ts
test("keeps icon-bearing nodes and removes collapsed helper resources", () => {
  const preview = createTemplatePreviewModel(denseDiagram);
  assert.ok(preview.nodes.every((node) => node.iconUrl));
  assert.equal(preview.nodes.some((node) => node.type === "aws_route_table_association"), false);
});

test("caps a dense preview and reports its omitted resource count", () => {
  const preview = createTemplatePreviewModel(denseDiagram);
  assert.ok(preview.nodes.length <= 8);
  assert.ok(preview.omittedNodeCount > 0);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --dir apps/web exec tsx --test components/templates/template-preview-model.test.ts`

Expected: FAIL because the preview model does not exist.

- [ ] **Step 3: Implement the bounded SVG preview model**

```ts
export function createTemplatePreviewModel(diagram: DiagramJson): TemplatePreviewModel {
  const renderableNodes = diagram.nodes.filter(isRenderableDiagramNode);
  const nodes = selectPrimaryNodes(renderableNodes, diagram.edges, 8);
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes: projectPreviewNodes(nodes),
    edges: diagram.edges.filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
    omittedNodeCount: diagram.nodes.length - nodes.length
  };
}
```

Primary-node selection must retain areas, prefer higher-degree resources, then restore source order. Coordinates are projected from the selected nodes' bounds so their icon tiles do not shrink into unreadable text chips.

- [ ] **Step 4: Replace raw label spans with SVG area frames and image tiles**

```tsx
<svg className={styles.previewSvg} viewBox="0 0 100 60">
  {model.edges.map(renderEdge)}
  {model.nodes.map(renderAreaFrame)}
  {model.nodes.filter((node) => !node.isArea).map(renderResourceIcon)}
</svg>
```

Use `<image href={node.iconUrl}>` for resources. Do not render raw resource labels in the diagram. If `omittedNodeCount > 0`, render a single `+N` badge outside the architecture geometry.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `pnpm --dir apps/web exec tsx --test components/templates/template-preview-model.test.ts features/resource-settings/template-library.test.ts`

Expected: PASS.

### Task 4: Full verification and visual review

**Files:**
- Modify: `agent-progress.md` only if required by the repository harness and without replacing unrelated entries.

- [ ] **Step 1: Run focused web tests**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts components/templates/template-preview-model.test.ts`

Expected: PASS.

- [ ] **Step 2: Run workspace and type checks**

Run: `pnpm harness:check && pnpm lint && pnpm typecheck && pnpm build`

Expected: all commands exit 0; report any existing unrelated failure exactly.

- [ ] **Step 3: Review the browser result**

Open `/workspace/new?mode=template&templateId=template-3tier` and `/dashboard/templates`. Verify icon tiles replace the raw chips, all four cards retain clear hierarchy, and the live-observation card shows a bounded summary rather than colliding labels.

- [ ] **Step 4: Commit only task-owned files**

```bash
git add apps/web/features/resource-settings/template-resource-materializer.ts \
  apps/web/features/resource-settings/template-resource-materializer.test.ts \
  apps/web/features/resource-settings/template-library.ts \
  apps/web/app/workspace/workspace-project-client.tsx \
  apps/web/components/templates/template-preview-model.ts \
  apps/web/components/templates/template-preview-model.test.ts \
  apps/web/components/templates/TemplateGallery.tsx \
  apps/web/components/templates/TemplateGallery.module.css \
  docs/superpowers/specs/2026-07-12-template-catalog-preview-design.md \
  docs/superpowers/plans/2026-07-12-template-catalog-preview.md
git commit -m "fix: 템플릿 리소스 카탈로그와 미리보기 정렬"
```

## Plan Self-Review

- Spec coverage: Tasks 1 and 2 cover catalog-backed Template creation and saved-draft hydration; Task 3 covers the unusable screenshot preview; Task 4 verifies both behavior and appearance.
- Placeholder scan: no unassigned implementation or validation steps remain.
- Type consistency: the materializer exports named functions consumed by the library and Workspace; the preview model is consumed only by TemplateGallery.
