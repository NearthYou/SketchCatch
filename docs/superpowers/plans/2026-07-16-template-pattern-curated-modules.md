# Template Pattern Curated Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Template Board의 실제 관계·containment·상대 geometry·edge routing으로 조립되는 기능별·용도별 Curated Module을 만들고 동일 지식을 Architecture Board Compiler 후보 생성에 사용한다.

**Architecture:** Template fixture를 읽는 생성 단계가 versioned Module Pattern Knowledge를 만들고, 브라우저의 catalog/materializer와 Compiler는 생성 artifact만 소비한다. Module 추가는 순수한 DiagramJson remap/translate이며 현재 Board에 따른 재사용 판단을 하지 않는다.

**Tech Stack:** TypeScript, React 19, Next.js 16, Node test runner via `tsx --test`, existing DiagramJson and Architecture Board Compiler.

## Global Constraints

- 관계 정확성 → containment → Template 상대 geometry → 시각 품질 순서를 지킨다.
- 접기·펼치기는 구현하지 않는다.
- 기존 5개 임시 Module 정의는 호환 대상으로 유지하지 않는다.
- 다른 작업자의 미커밋 파일을 수정하거나 커밋하지 않는다.
- 모든 behavior change는 실패하는 테스트를 먼저 확인한다.

---

### Task 1: Generated Module Pattern Knowledge

**Files:**

- Modify: `apps/web/features/architecture-board-compiler/architecture-board-knowledge-contract.ts`
- Create: `apps/web/features/architecture-board-compiler/architecture-board-module-pattern-source.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-knowledge-source-generator.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-knowledge.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-knowledge.generated.ts`
- Test: `apps/web/features/architecture-board-compiler/architecture-board-module-pattern-artifact.test.ts`

**Interfaces:**

- Produces: `ArchitectureBoardModulePattern`, `ArchitectureBoardKnowledgeArtifact.modulePatterns`
- Consumes: repository Template diagrams and available Brainboard diagrams in the existing generator only

- [x] Write a failing artifact test proving both `functional` and `purpose` lenses exist, every edge/parent resolves, coordinates are normalized, provenance exists, and generated output equals source generation.
- [x] Run the focused test and confirm failure because `modulePatterns` does not exist.
- [x] Implement deterministic pattern seeds, candidate extraction, structural fingerprints, representative selection, geometry/route normalization, and artifact serialization.
- [x] Regenerate `architecture-board-knowledge.generated.ts` and pass artifact tests plus `architecture-board-knowledge:check`.
- [x] Commit only Task 1 files.

### Task 2: Full Diagram Fragment Materialization

**Files:**

- Replace: `apps/web/features/resource-settings/module-catalog.ts`
- Test: `apps/web/features/resource-settings/module-catalog.test.ts`

**Interfaces:**

- Consumes: `architectureBoardKnowledge.modulePatterns`
- Produces: `curatedModules`, `expandCuratedModuleIntoDiagram({ diagram, moduleId })`

- [x] Write failing tests for node/edge/parent/variable remap, Terraform reference rewrite, route translation, unique repeated insertion, and preservation of the source pattern.
- [x] Run the focused test and confirm the old node-only expansion fails relationship and containment assertions.
- [x] Implement a pure materializer that clones the generated pattern, assigns unique IDs/resource names, rewrites all references, translates nodes and routed points to the next Board slot, and adds provenance.
- [x] Pass materializer and artifact tests.
- [x] Commit only Task 2 files.

### Task 3: 기능별·용도별 Catalog UI

**Files:**

- Modify: `apps/web/features/resource-settings/index.tsx`
- Modify: `apps/web/features/diagram-editor/diagram-editor.module.css`
- Test: `apps/web/features/resource-settings/module-catalog-view.test.ts`
- Create: `apps/web/features/resource-settings/module-catalog-view.ts`

**Interfaces:**

- Consumes: generated `CuratedModuleDefinition.lenses`
- Produces: pure grouping/search helpers and `기능별` / `용도별` view controls

- [x] Write failing pure tests proving both views expose modules, labels are Korean user-facing copy, and the same module ID materializes identically from either view.
- [x] Implement pure grouping helpers and the two-view UI without adding collapse controls.
- [x] Pass catalog view and materializer tests.
- [x] Commit only Task 3 files.

### Task 4: Compiler Pattern Geometry Candidate

**Files:**

- Create: `apps/web/features/architecture-board-compiler/architecture-board-module-pattern-policy.ts`
- Test: `apps/web/features/architecture-board-compiler/architecture-board-module-pattern-policy.test.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-compiler.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-compiler.test.ts`

**Interfaces:**

- Produces: `applyArchitectureBoardModulePatternKnowledge(diagram, artifact)` returning a pattern-derived candidate plus matched pattern and Template provenance
- Consumes: the same `ArchitectureBoardKnowledgeArtifact.modulePatterns` used by the Module catalog

- [x] Write failing tests proving matching uses node/edge structure, applies learned relative geometry without deleting relationships, and rejects type-only false matches.
- [x] Implement deterministic structural matching and a pattern geometry candidate with remapped edge handles/routes.
- [x] Add the candidate to Compiler selection/provenance and prove it appears in candidate IDs/reference Template IDs.
- [x] Pass Compiler and Module focused tests.
- [x] Commit only Task 4 files.

### Task 5: Completion Verification

**Files:**

- Modify only if verification exposes an in-scope defect.

- [x] Run all focused Architecture Board knowledge, Compiler, Module catalog and UI tests.
- [x] Run `pnpm architecture-board-knowledge:check`.
- [x] Run `pnpm typecheck` and separate in-scope failures from unrelated dirty-worktree failures.
- [x] Run `pnpm lint` and `git diff --check`.
- [x] Audit the design document requirement-by-requirement, confirm no collapse implementation exists, and commit any final in-scope fixes.
