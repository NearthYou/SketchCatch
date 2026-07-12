# Six Template Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every template UI consume the six deployable `TemplateDefinition` entries required by the AWS template design.

**Architecture:** Keep `templateDefinitions` as the visible catalog source of truth. Adapt each definition into the existing `BoardTemplate` interface, pass generated diagrams through the current catalog materializer, and align the older Repository Analysis selection contract with the same six IDs. Keep Live Observation fixtures separate from the visible deployable catalog.

**Tech Stack:** TypeScript, Next.js, Node test runner, pnpm

## Global Constraints

- Preserve unrelated work already committed on `fix/gg/qa-followup`.
- Do not maintain a second hard-coded template catalog.
- The visible catalog order and IDs must exactly match `TEMPLATE_IDS`.
- Keep existing template search, sorting, backup, materialization, and workspace-start behavior.

---

### Task 1: Connect the visible catalog to the six deployable definitions

**Files:**
- Modify: `apps/web/features/resource-settings/template-library.ts`
- Test: `apps/web/features/resource-settings/template-library.test.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/services/aiRepositoryAnalysis.ts`
- Test: `apps/api/src/services/aiRepositoryAnalysis.test.ts`
- Modify: `apps/api/src/routes/ai.ts`
- Test: `apps/api/src/routes/ai.test.ts`
- Modify: `apps/web/app/workspace/repository/repository-start-client.tsx`
- Test: `apps/web/features/resource-settings/template-resource-materializer.test.ts`
- Test: `apps/web/components/templates/template-preview-model.test.ts`

**Interfaces:**
- Consumes: `TEMPLATE_IDS`, `templateDefinitions`, and `buildTemplateDiagramJson(templateId, input)` from `@sketchcatch/types`.
- Produces: `listBoardTemplates(): readonly BoardTemplate[]` with exactly the six deployable template IDs.

- [ ] **Step 1: Write the failing catalog contract test**

```ts
test("listBoardTemplates exposes exactly the six deployable TemplateDefinitions", () => {
  const templates = listBoardTemplates();

  assert.deepEqual(templates.map((template) => template.id), [...TEMPLATE_IDS]);
  assert.ok(templates.every((template) => template.diagramJson.nodes.length > 0));
});
```

- [ ] **Step 2: Run the focused test and verify the current four-template catalog fails**

Run: `pnpm --dir apps/web exec tsx --test features/resource-settings/template-library.test.ts`

Expected: FAIL because the current IDs are the four legacy `template-*` IDs instead of `TEMPLATE_IDS`.

- [ ] **Step 3: Derive `boardTemplates` from `templateDefinitions`**

```ts
const boardTemplates: readonly BoardTemplate[] = templateDefinitions.map((definition) => ({
  id: definition.id,
  title: definition.title,
  description: definition.description,
  tags: definition.tags,
  diagramJson: buildTemplateDiagramJson(definition.id, {
    projectSlug: "sketchcatch",
    shortId: definition.id
  })
}));
```

Keep the existing `materializeTemplateDiagram` call in `listBoardTemplates` and `buildBoardTemplateDiagram`. Preserve Live Observation as an explicitly separate legacy fixture list.

- [ ] **Step 4: Update legacy-ID filter assertions to use deployable IDs**

Search and sorting tests must assert `static-web-hosting` and `three-tier-web-app` where applicable, without weakening their behavioral assertions.

- [ ] **Step 5: Align Repository Analysis with the six IDs**

Use `TEMPLATE_IDS` for API validation and client narrowing. Return deployable IDs from repository evidence analysis, and provide prompt context for every ID.

- [ ] **Step 6: Run focused tests, typecheck, and web tests**

Run:

```bash
pnpm --dir apps/web exec tsx --test features/resource-settings/template-library.test.ts
pnpm --dir apps/web typecheck
pnpm --dir apps/web test
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit only the plan and catalog changes**

```bash
git add docs/superpowers/plans/2026-07-12-six-template-catalog.md packages/types/src/index.ts apps/api/src/routes/ai.ts apps/api/src/routes/ai.test.ts apps/api/src/services/aiRepositoryAnalysis.ts apps/api/src/services/aiRepositoryAnalysis.test.ts apps/web/app/workspace/repository/repository-start-client.tsx apps/web/components/templates/template-preview-model.test.ts apps/web/features/resource-settings/template-library.ts apps/web/features/resource-settings/template-library.test.ts apps/web/features/resource-settings/template-resource-materializer.test.ts
git commit -m "Fix: 여섯 AWS 템플릿 카탈로그 연결"
```
