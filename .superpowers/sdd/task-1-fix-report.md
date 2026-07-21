# Task 1 Fix Report — Module Catalog 정렬 계약 회귀 테스트 보강

## Scope

- Added isolated ordering-contract coverage to `apps/web/features/resource-settings/module-catalog-view.test.ts`.
- Removed the two trailing EOF blank lines already reported by the requested baseline diff check:
  - `docs/superpowers/specs/2026-07-21-module-catalog-simple-first-design.md`
  - `docs/superpowers/plans/2026-07-21-module-catalog-simple-first.md`
- Did not change production logic. The comparator introduced in `beffcfe2` already satisfies the requested ordering behavior.

## Contract coverage

The new `createCatalogModule()` fixture returns `CuratedModuleDefinition` without casts or untyped mocks. It creates complete `DiagramNode` fixtures: `kind: "resource"` nodes have real Terraform parameters, and presentation areas are real `kind: "design"` nodes.

The focused tests cover:

1. exactly three resources as simple, four as non-simple, and design areas excluded;
2. simple-module-count precedence over a lower average;
3. lower average precedence when simple counts tie;
4. lower maximum precedence when average also ties;
5. full ties sorted by label then key;
6. search filtering before group scoring, including an observed group-order change;
7. title then id ordering of cards within a group.

Every group-order assertion compares the complete expected key sequence. No `findIndex()` ordering assertion remains.

## Baseline and TDD evidence

Production comparator `compareGroups()` was already present in commit `beffcfe2`, the task baseline. Therefore a behavior RED result would be artificial and was not claimed. Before edits, the requested test command was attempted in the workspace sandbox and did not execute tests because tsx could not bind its temporary IPC socket:

```text
Error: listen EPERM: operation not permitted .../tsx-501/82721.pipe
```

The same command was rerun with the required temporary-directory permission. The first new-test run then exposed a test-only `ReferenceError: countModuleResources is not defined`; this was a missing import, not a production behavior failure. After importing the real function, the focused suite was GREEN (14/14). No production code was added or changed.

## Validation

Commands run after the test import correction:

```sh
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-view.test.ts
```

Output: exit 0; `tests 14`, `pass 14`, `fail 0`.

```sh
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-view.test.ts features/resource-settings/module-catalog.test.ts
```

Output: exit 0; `tests 22`, `pass 22`, `fail 0`.

```sh
git diff --check 79a74885458cc1835922bae2ac189ea47478ae1f..HEAD
```

Initial output reported only the two requested EOF blank lines. They were removed. The command is rerun in the final verification below together with `git diff --check` for the uncommitted task files.

## Self-review

- Fixtures use actual project types; no `as any`, `unknown` casts, or untyped mock objects were introduced.
- Tests exercise public `createModuleCatalogGroups()` behavior, not private comparator implementation details.
- Ordering tests assert full group key sequences, proving that all expected groups are present.
- Production files are untouched.

## Concerns

- tsx test execution requires temporary IPC socket access outside this sandbox; validation used the approved command with that narrow permission.
- No concerns with production behavior were found.
