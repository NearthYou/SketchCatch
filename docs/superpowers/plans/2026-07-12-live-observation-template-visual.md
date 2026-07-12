# Live Observation Template Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Live Observation Template read as a compact traffic-and-scale story in both Workspace and Gallery.

**Architecture:** Keep all Terraform resources in DiagramJson, but exclude non-renderable helper nodes from topology spacing. Infer additional real containment references, compact empty areas, and prioritize meaningful area frames and visible flow nodes in the Gallery.

**Tech Stack:** TypeScript, Next.js, Node test runner, DiagramJson.

## Global Constraints

- Preserve all 22 Live Observation Terraform resources and their values.
- Do not add visual placeholder resources.
- Do not change saved-draft coordinates.
- Reuse existing catalog icons and visibility rules.

---

### Task 1: Layout only visible topology nodes

**Files:**
- Modify: `apps/web/features/resource-settings/template-topology-layout.ts`
- Modify: `apps/web/features/resource-settings/template-topology-layout.test.ts`

- [ ] Write a failing test proving a collapsed helper does not enlarge an area.

```ts
const arranged = arrangeTemplateTopology(makeAreaWithVisibleNodeAndHiddenHelper());
assert.deepEqual(node(arranged, "vpc").size, node(arrangedWithoutHelper, "vpc").size);
```

- [ ] Run `pnpm --dir apps/web exec tsx --test features/resource-settings/template-topology-layout.test.ts` and expect failure.
- [ ] Filter group layout candidates through `isRenderableDiagramNode`, keep hidden nodes in the returned DiagramJson, and use compact minimum sizes for empty areas.

```ts
const layoutChildIds = childIds.filter((id) => isRenderableDiagramNode(getRequiredNode(id)));
```

- [ ] Add `loadBalancerArn`, `targetGroupArn`, and `alarmActions` to resolvable reference inputs.

```ts
const references = [values.loadBalancerArn, values.targetGroupArn, values.alarmActions]
  .flatMap(flattenStringValues);
```

- [ ] Run the focused test and expect pass.

### Task 2: Clarify the Live traffic flow

**Files:**
- Modify: `apps/web/features/resource-settings/template-library.ts`
- Modify: `apps/web/features/resource-settings/template-library.test.ts`

- [ ] Write a failing test requiring the visible audience edge to start at `template-live-site` and the Template to retain 22 nodes.

```ts
assert.equal(edge(template, "template-live-site-flow").sourceNodeId, "template-live-site");
assert.equal(template.diagramJson.nodes.length, 22);
```

- [ ] Change only the visual audience edge endpoint from the hidden website helper to the visible S3 Bucket.

```ts
createTemplateEdge("template-live-site-flow", "template-live-site", "template-live-alb", "audience traffic")
```

- [ ] Assert the compact Live VPC dimensions and visible flow order.
- [ ] Run the Template library tests and expect pass.

### Task 3: Prioritize meaningful Gallery frames

**Files:**
- Modify: `apps/web/components/templates/template-preview-model.ts`
- Modify: `apps/web/components/templates/template-preview-model.test.ts`

- [ ] Write a failing test proving empty Subnet/Security Group areas do not consume the eight preview slots.

```ts
assert.ok(!preview.nodes.some((node) => node.id === "template-live-subnet-a"));
assert.ok(preview.nodes.some((node) => node.id === "template-live-alb"));
```

- [ ] Keep an area when it has a renderable descendant or participates in a visible edge; omit empty decorative frames from the preview selection only.

```ts
const previewAreaNodes = areaNodes.filter((area) =>
  hasRenderableDescendant(area.id, renderableNodes) || visibleEdgeNodeIds.has(area.id)
);
```

- [ ] Run the preview and full focused Template test suites.
- [ ] Run `pnpm harness:check`, web lint, and web typecheck.
