# Palette-backed Template/Module Resources Implementation Plan

> Design: `docs/superpowers/specs/2026-07-16-palette-backed-template-module-resources-design.md`

## 1. Contract tests

- Extend `catalog.test.ts` so every Resource identity used by available Templates and Curated Modules resolves to one enabled catalog item with an existing icon asset and deployable shared definition.
- Extend `module-catalog.test.ts` so expansion produces Palette-backed icons/defaults, removes orphaned `workspace-seed` authority, and preserves authored geometry, relationships, containment and provenance.
- Add API schema tests proving `moduleSource` round-trips through project-draft and Terraform request parsing.

## 2. Shared materialization

- Expose a small catalog materialization interface from `template-resource-materializer.ts` with explicit geometry and `workspace-seed` policies.
- Keep Template source-file authority unchanged.
- Materialize every Curated Module fragment through that interface before ID/name/reference remapping, using Palette defaults for source-authoritative nodes whose source files are absent.

## 3. Palette completeness

- Enable every catalog Resource used by shipped Templates/Modules.
- Keep exact AWS asset paths and assert every file exists; do not introduce generic icons or runtime fallback mappings.
- Regenerate Architecture Board knowledge only if the source contract changes.

## 4. API and deployment boundary

- Add the shared `moduleSource` shape to both strict API metadata schemas.
- Add a deterministic deployability check that expands each Module and generates Terraform from it.
- Validate all shipped Template Terraform inputs and all generated Module Terraform roots with Terraform CLI when provider initialization is available.

## 5. Regression and handoff

- Run focused Web/API/Types tests, architecture knowledge checks, lint and typecheck.
- Run the complete Template/Module validation commands, inspect the diff, and commit without staging the unrelated `apps/web/next-env.d.ts` change.
