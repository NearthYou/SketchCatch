# Template Sibling Collision Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every visible sibling-resource overlap from built-in Template diagrams in both Gallery and Template Workspace while preserving containment and the Live Observation traffic flow.

**Architecture:** Add one pure post-layout collision module that uses the Board's real visual-footprint function, moves only later siblings by 40px grid increments, moves Area subtrees together, and expands parent Areas when required. Run it after topology inference and Live Observation preferred placement so every Template consumer receives the same collision-free DiagramJson.

**Tech Stack:** TypeScript, Node test runner, `tsx`, existing DiagramJson/resource visual-bound helpers.

## Global Constraints

- Compare only renderable siblings with the same resolved parent; ancestor/descendant containment is not a collision.
- Preserve Resource Catalog identities, Terraform values, edge semantics, node IDs, and existing saved non-Template Boards.
- Preserve Live Observation S3 Website → ALB → Target Group → ASG flow and 40px curated grid.
- Do not add Resource Catalog entries or image assets.

---

### Task 1: Pure sibling visual-collision resolver

**Files:**
- Create: `apps/web/features/resource-settings/template-sibling-collision-layout.ts`
- Create: `apps/web/features/resource-settings/template-sibling-collision-layout.test.ts`

**Interfaces:**
- Consumes: `DiagramJson`, `DiagramNode`, `getResourceNodeVisualBounds`, `isRenderableDiagramNode`, and `isAreaNode`.
- Produces: `resolveTemplateSiblingVisualCollisions(diagram: DiagramJson, gridSize?: number): DiagramJson`.

- [ ] **Step 1: Write the failing tests**

Add tests that create two 48px sibling nodes whose 112×82 visual footprints overlap, plus an Area containing one of those nodes. Assert the resolver removes the sibling intersection, keeps positions on the original 40px grid, moves an Area and its descendants together, and expands a parent Area enough to contain the moved child's visual bounds.

```ts
const resolved = resolveTemplateSiblingVisualCollisions(overlappingDiagram);
assert.equal(findSiblingVisualCollisions(resolved).length, 0);
assert.equal(requireNode(resolved, "later").position.y % 40, 0);
assert.deepEqual(childDelta, parentAreaDelta);
assertVisualContains(requireNode(resolved, "vpc"), requireNode(resolved, "instance"));
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/resource-settings/template-sibling-collision-layout.test.ts
```

Expected: FAIL because `template-sibling-collision-layout.ts` and its exported resolver do not exist.

- [ ] **Step 3: Implement the minimal pure resolver**

Implement deterministic grouping and placement:

```ts
export function resolveTemplateSiblingVisualCollisions(
  diagram: DiagramJson,
  gridSize = 40
): DiagramJson {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, { ...node }]));
  // Process deepest parent groups first. For each stable y/x/id ordered sibling,
  // advance y by gridSize until its visual bounds do not intersect placed siblings.
  // moveSubtree preserves Area descendants; fitParentAreas expands but never shrinks Areas.
  return { ...diagram, nodes: diagram.nodes.map((node) => nodeById.get(node.id) ?? node) };
}
```

Use strict rectangle intersection so touching edges are allowed. Bound the search by the sibling count and fail loudly if no free grid position is found rather than looping indefinitely.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 1 command again. Expected: all collision resolver tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/features/resource-settings/template-sibling-collision-layout.ts apps/web/features/resource-settings/template-sibling-collision-layout.test.ts
git commit -m "Feat: 템플릿 형제 리소스 충돌 제거기 추가"
```

### Task 2: Apply the resolver to every Template consumer

**Files:**
- Modify: `apps/web/features/resource-settings/template-topology-layout.ts`
- Create: `apps/web/features/resource-settings/template-sibling-collision-integration.test.ts`

**Interfaces:**
- Consumes: `resolveTemplateSiblingVisualCollisions(diagram, 40)` from Task 1.
- Produces: collision-free `arrangeTemplateTopology` output used unchanged by `materializeTemplateDiagram`, `listBoardTemplates`, Gallery preview, and Template Workspace.

- [ ] **Step 1: Write the built-in Template regression test**

Add a test helper that groups `isRenderableDiagramNode` results by resolved parent, ignores ancestor/descendant pairs, and calls `getResourceNodeVisualBounds`. Assert all built-in Templates have zero sibling intersections and that draft hydration retains saved coordinates.

```ts
for (const template of listBoardTemplates()) {
  assert.deepEqual(findSiblingVisualCollisions(template.diagramJson), [], template.id);
}
assert.deepEqual(hydratedDraft.nodes[0]?.position, savedDraft.nodes[0]?.position);
```

- [ ] **Step 2: Run the materializer/library tests and verify RED**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/resource-settings/template-sibling-collision-integration.test.ts
```

Expected: FAIL and report the seven current Live Observation sibling collisions.

- [ ] **Step 3: Integrate the resolver and correct preferred Live positions**

Call the resolver after topology layout and Live Observation preferred placement:

```ts
const arrangedDiagram = {
  ...diagram,
  nodes: nodes.map((node) => layout.getNode(node.id) ?? node)
};
return resolveTemplateSiblingVisualCollisions(arrangedDiagram, 40);
```

Move the five root S3 resources into two 120px-separated columns entirely left of the VPC, keep S3 Website on the ALB traffic row, and increase the three VPC vertical separations that were only 80px to at least 120px. Keep all curated coordinates and Area sizes divisible by 40.

- [ ] **Step 4: Run focused Template tests and verify GREEN**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/resource-settings/template-sibling-collision-layout.test.ts features/resource-settings/template-sibling-collision-integration.test.ts features/resource-settings/template-topology-layout.test.ts features/resource-settings/template-resource-materializer.test.ts features/resource-settings/template-library.test.ts components/templates/template-preview-model.test.ts
```

Expected: all tests PASS and the built-in collision count is zero.

- [ ] **Step 5: Run repository verification**

Run `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Expected: harness/lint/typecheck pass; build may only retain the documented pre-existing `apps/web/.codegraph` ENOENT.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/web/features/resource-settings/template-topology-layout.ts apps/web/features/resource-settings/template-sibling-collision-integration.test.ts agent-progress.md
git commit -m "Fix: 템플릿 리소스 시각 충돌 제거"
```

- [ ] **Step 7: Visual acceptance**

Open the local Templates Gallery and create the Live Observation Template in Workspace. Verify no visible resource or caption overlaps, the VPC/ASG containment remains legible, and S3 Website → ALB → Target Group → ASG reads left-to-right.
