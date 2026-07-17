# Module Catalog Board Captures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthetic Module SVG with ten real Board captures, simplify Module cards, and open Dashboard-selected Templates directly with project naming beside the start action.

**Architecture:** A deterministic Module-to-Diagram adapter feeds a development-only `DiagramEditor` capture route and a versioned static asset manifest. The catalog consumes a small user-facing presentation model plus `BoardThumbnailImage`. Template entry uses one pure initial-view resolver while preserving the existing project creation and draft pipeline.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, React Flow, `html-to-image`, Node test runner with `tsx`, headless Chrome.

## Global Constraints

- Render only each Module's own Resource, Area, and Edge; never reuse a representative Template capture.
- Captures are 1280 × 720 WebP using `BOARD_THUMBNAIL_CAPTURE_CONTRACT` version 1.
- Preserve AWS, VPC, RDS, ECS, S3, API, and Auto Scaling terminology; translate only explanatory copy.
- Do not expose Terraform types, raw relationship labels, internal Resource names, knowledge version, or empty input/output sections.
- Preserve Template ID/version, session restoration, project creation, and initial Board draft behavior.
- Do not stage or modify unrelated dirty-worktree files.
- Write and observe failing tests before production changes; commit each independently reviewable task.

---

### Task 1: Direct Dashboard Template Entry

**Files:**
- Modify: `apps/web/app/workspace/new/workspace-start-template-flow.test.ts`
- Modify: `apps/web/app/workspace/new/workspace-start-template-flow.ts`
- Create: `apps/web/features/workspace/workspace-start-template-entry.test.ts`
- Modify: `apps/web/app/workspace/new/workspace-start-client.tsx`
- Modify: `apps/web/app/workspace/new/workspace-start.module.css`

**Interfaces:**
- Produces: `resolveWorkspaceStartTemplateView(startKind, template): "catalog" | "detail" | null`
- Preserves: `createTemplateProjectDraft()` and `handleContinue("template", template)`

- [ ] **Step 1: Write failing initial-view tests**

Add cases that require a valid selected Template to open `detail`, an absent/unavailable Template to open `catalog`, and non-Template entry to return `null`.

```ts
assert.equal(resolveWorkspaceStartTemplateView("template", template), "detail");
assert.equal(resolveWorkspaceStartTemplateView("template", null), "catalog");
assert.equal(resolveWorkspaceStartTemplateView("ai", template), null);
```

- [ ] **Step 2: Write the failing UI contract test**

Read the client, Dashboard link, and CSS sources. Assert that the Dashboard href carries `mode=template` and encoded `template.id`; the initial view resolver receives `initialStartKind` and `initialTemplate`; `TemplateDetail` orders `detailHeading`, `ProjectNameField`, start button, then `detailStats`; desktop grid areas are `"preview content"` and mobile areas are `"content" "preview"`.

- [ ] **Step 3: Run RED tests**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test app/workspace/new/workspace-start-template-flow.test.ts features/workspace/workspace-start-template-entry.test.ts
```

Expected: FAIL because `resolveWorkspaceStartTemplateView` and the detailed name field do not exist.

- [ ] **Step 4: Implement the pure resolver**

```ts
export type WorkspaceStartTemplateView = "catalog" | "detail" | null;

export function resolveWorkspaceStartTemplateView(
  startKind: WorkspaceStartKind | undefined,
  template: AvailableBoardTemplate | null
): WorkspaceStartTemplateView {
  if (startKind !== "template") return null;
  return template ? "detail" : "catalog";
}
```

Use it for the initial `templateStartView` state.

- [ ] **Step 5: Put project naming beside the action**

Pass `title`, `projectNameError`, `projectNameInputRef`, and the shared title-change handler to `TemplateDetail`. Render `ProjectNameField` immediately after the heading inside `detailActionArea`, followed by inline error and the start button. Keep stats and tags after the action area. Put `detailContent` before `detailPreviewFrame` in DOM order and use CSS grid areas to preserve desktop left/right placement.

- [ ] **Step 6: Run GREEN tests and existing Template regression**

```bash
pnpm --filter @sketchcatch/web exec tsx --test app/workspace/new/workspace-start-template-flow.test.ts features/workspace/workspace-start-template-entry.test.ts
```

Expected: all tests PASS, including existing ID/version and initial draft cases.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/workspace/new/workspace-start-template-flow.test.ts apps/web/app/workspace/new/workspace-start-template-flow.ts apps/web/features/workspace/workspace-start-template-entry.test.ts apps/web/app/workspace/new/workspace-start-client.tsx apps/web/app/workspace/new/workspace-start.module.css
git commit -m "Fix: open selected Template details directly"
```

---

### Task 2: User-Facing Module Presentation

**Files:**
- Modify: `apps/web/features/resource-settings/module-catalog-preview.test.ts`
- Modify: `apps/web/features/resource-settings/module-catalog-preview.ts`

**Interfaces:**
- Produces: `createModuleCatalogPreview(moduleDefinition): ModuleCatalogPreview`
- `ModuleCatalogPreview` contains only `title`, `description`, `provider`, `resourceCount`, `relationshipCount`, and `resourceSummary`.

- [ ] **Step 1: Replace old preview tests with failing user-copy tests**

Assert exact copy for all ten Module IDs, `provider === "AWS"`, accurate Resource/relationship counts, at most three catalog display names, and an `외 N개` suffix when more display-name kinds exist. Assert serialized output contains neither `aws_` Terraform types nor `architecture-board-knowledge`.

```ts
assert.deepEqual(
  createModuleCatalogPreview(relationalDataLayer),
  {
    title: "RDS 데이터베이스",
    description: "RDS와 DB Subnet, Security Group을 함께 추가합니다.",
    provider: "AWS",
    resourceCount: 8,
    relationshipCount: 3,
    resourceSummary: "Security Group · RDS Instance · Subnet 외 2개"
  }
);
```

- [ ] **Step 2: Run RED test**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-preview.test.ts
```

Expected: FAIL because the current model exposes coordinates, raw types, inputs, outputs, and version.

- [ ] **Step 3: Implement the minimal presentation model**

Add the ten reviewed title/description pairs. Resolve each Resource through `metadata.presentationCatalogItemId` first, then match `resourceCatalog` by Terraform block type and Resource type. Deduplicate display names, retain the first three, and append `외 N개` for additional kinds. Fall back to the Node label only when the shared Catalog has no match.

- [ ] **Step 4: Run GREEN test**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-preview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/resource-settings/module-catalog-preview.test.ts apps/web/features/resource-settings/module-catalog-preview.ts
git commit -m "Feat: add user-facing Module summaries"
```

---

### Task 3: Deterministic Module Capture Route

**Files:**
- Create: `apps/web/features/resource-settings/module-thumbnail-diagram.test.ts`
- Create: `apps/web/features/resource-settings/module-thumbnail-diagram.ts`
- Create: `apps/web/app/dev/module-thumbnail/page.tsx`
- Create: `apps/web/app/dev/module-thumbnail/module-thumbnail-capture-client.tsx`
- Create: `apps/web/app/dev/module-thumbnail/module-thumbnail.module.css`

**Interfaces:**
- Produces: `createModuleThumbnailDiagram(moduleId: string): DiagramJson | null`
- Produces: `serializeModuleThumbnailDiagram(diagram: DiagramJson): string`
- Capture client emits `<img data-module-thumbnail-ready="true" src="data:image/webp;base64,...">` after using `captureActualBoardElement()`.

- [ ] **Step 1: Write failing deterministic Diagram tests**

For every current Module, assert two calls are deeply equal, every source Node/Area/Edge is present, the fixed `expandedAt` is stable, and unknown IDs return `null`. Assert the stable serialization is invariant to object-key insertion order.

- [ ] **Step 2: Write failing route contract tests**

Read route sources and assert production uses `notFound()`, invalid IDs return `notFound()`, `DiagramEditor` uses `mode="viewer"`, and capture uses `captureActualBoardElement` plus the ready-image marker.

- [ ] **Step 3: Run RED tests**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-thumbnail-diagram.test.ts
```

Expected: FAIL because the adapter and route are absent.

- [ ] **Step 4: Implement deterministic materialization**

Use a cloned empty Diagram and `materializeCuratedModulePattern({ diagram, pattern, expandedAt: "2000-01-01T00:00:00.000Z" })`. Stable serialization recursively sorts object keys while preserving array order.

- [ ] **Step 5: Implement the dev-only capture route**

Render the deterministic Diagram in a 1280 × 720 viewer. On `onBoardReady`, await `document.fonts.ready`, all Board images, and two animation frames; call `captureActualBoardElement`; convert the returned WebP Blob to a data URL; then replace the staging viewer with the exact 1280 × 720 ready image. Revoke no object URL because a data URL is used.

- [ ] **Step 6: Run GREEN tests and typecheck**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-thumbnail-diagram.test.ts
pnpm --filter @sketchcatch/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/resource-settings/module-thumbnail-diagram.test.ts apps/web/features/resource-settings/module-thumbnail-diagram.ts apps/web/app/dev/module-thumbnail
git commit -m "Feat: add deterministic Module capture route"
```

---

### Task 4: Versioned WebP Assets and Manifest

**Files:**
- Create: `scripts/generate-module-thumbnails.ts`
- Modify: `package.json`
- Create: `apps/web/features/resource-settings/module-thumbnail-manifest.ts`
- Create: `apps/web/features/resource-settings/module-thumbnail-manifest.test.ts`
- Create: `apps/web/public/module-thumbnails/v1/*.webp` (10 files)

**Interfaces:**
- Produces: `MODULE_THUMBNAIL_ASSETS` and `getModuleThumbnailAsset(moduleId)`.
- Generator consumes a running local Web server through `MODULE_THUMBNAIL_BASE_URL` (default `http://127.0.0.1:3000`) and headless Chrome.

- [ ] **Step 1: Write failing manifest tests**

Assert manifest IDs exactly equal the ten current Module IDs; every entry has capture version 1 and `sha256:<64 hex>`; each file exists and starts with `RIFF` plus `WEBP`; and SHA-256 of `serializeModuleThumbnailDiagram(createModuleThumbnailDiagram(id))` equals `diagramHash`.

- [ ] **Step 2: Run RED test**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-thumbnail-manifest.test.ts
```

Expected: FAIL because manifest and assets are absent.

- [ ] **Step 3: Implement the manifest and generator**

The generator runs installed Chrome with `--headless=new`, `--dump-dom`, `--force-device-scale-factor=1`, and a bounded virtual-time budget for each `/dev/module-thumbnail?moduleId=...` URL. Extract the ready image's `data:image/webp;base64,...`, validate `RIFF/WEBP`, and write it to `apps/web/public/module-thumbnails/v1/{id}.webp`. Reject missing ready markers and non-WebP payloads.

- [ ] **Step 4: Generate all ten captures**

Start the Web dev server, then run:

```bash
pnpm module-thumbnails:generate
```

Expected: ten named WebP files, each reported as written.

- [ ] **Step 5: Calculate and record Diagram hashes with `apply_patch`**

Use the deterministic serializer and Node `createHash("sha256")`, then place exact `sha256:<hex>` values in the manifest.

- [ ] **Step 6: Run GREEN manifest test**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-thumbnail-manifest.test.ts
```

Expected: PASS for all ten IDs, files, headers, versions, and hashes.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-module-thumbnails.ts package.json apps/web/features/resource-settings/module-thumbnail-manifest.ts apps/web/features/resource-settings/module-thumbnail-manifest.test.ts apps/web/public/module-thumbnails/v1
git commit -m "Feat: add Module Board capture assets"
```

---

### Task 5: One-Glance Module Cards

**Files:**
- Modify: `apps/web/features/resource-settings/module-catalog-preview.test.ts`
- Modify: `apps/web/features/resource-settings/index.tsx`
- Modify: `apps/web/features/resource-settings/module-catalog-preview.module.css`

**Interfaces:**
- Consumes: `createModuleCatalogPreview()` and `getModuleThumbnailAsset()`.
- Produces: a flat Module card containing capture, copy, summary, and add action.

- [ ] **Step 1: Write the failing card contract test**

Assert `ModuleCatalogCard` renders `BoardThumbnailImage`, reviewed title/description, `AWS · Resource N개 · 연결 N개`, `주요 구성`, and `보드에 추가`. Assert source contains no `<details>`, `ModuleCatalogTopology`, Module SVG, raw type `<code>`, input/output/version headings, or `slice(0, 1)`.

- [ ] **Step 2: Run RED test**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-preview.test.ts
```

Expected: FAIL against the current details/SVG UI.

- [ ] **Step 3: Implement the flat card**

Use an `<article>`, `BoardThumbnailImage`, a compact text block, two summary lines, and one full-width button. If a manifest entry is absent, pass `src={null}` so the shared Board fallback renders while the add action stays usable. Remove topology/list/section components and their CSS.

- [ ] **Step 4: Run GREEN card tests**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-preview.test.ts features/resource-settings/module-catalog-view.test.ts features/resource-settings/module-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/resource-settings/module-catalog-preview.test.ts apps/web/features/resource-settings/index.tsx apps/web/features/resource-settings/module-catalog-preview.module.css
git commit -m "Refactor: simplify Module catalog cards"
```

---

### Task 6: Visual and Full Regression Verification

**Files:**
- Modify only if a verified capture/card defect requires a focused correction.

- [ ] **Step 1: Inspect all ten WebP captures**

Build a temporary contact sheet outside the repository or inspect each asset directly. Confirm actual AWS icons and labels are readable, every Module fits inside 16:9, no editor chrome is present, and no capture is blank, clipped, or duplicated from a full Template.

- [ ] **Step 2: Exercise the Dashboard Template entry in a browser**

Confirm a low-page Dashboard Template action opens that exact detail, name input and start action are visible together, blank submit focuses the inline field, and a valid name creates a project whose initial Board matches the chosen Template.

- [ ] **Step 3: Run focused regression**

```bash
pnpm --filter @sketchcatch/web exec tsx --test app/workspace/new/workspace-start-template-flow.test.ts features/workspace/workspace-start-template-entry.test.ts features/resource-settings/module-catalog-preview.test.ts features/resource-settings/module-thumbnail-diagram.test.ts features/resource-settings/module-thumbnail-manifest.test.ts features/resource-settings/module-catalog-view.test.ts features/resource-settings/module-catalog.test.ts
```

Expected: all PASS, zero failures.

- [ ] **Step 4: Run repository gates**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: every command exits 0. Restore only build-generated `apps/web/next-env.d.ts` drift if it occurs; preserve all unrelated worktree changes.

- [ ] **Step 5: Audit scope and commits**

Run `git diff --check`, inspect every goal commit, verify no unrelated dirty file is staged, and compare every requirement in the design spec with current source, assets, runtime evidence, and test coverage.
