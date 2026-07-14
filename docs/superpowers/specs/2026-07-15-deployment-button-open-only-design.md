# Workspace Deployment Button Open-Only Design

## Purpose

The Workspace primary deployment button opens the existing deployment modal without saving the project first. This removes the button-specific save delay and failure path while preserving all other save behavior.

## User-visible behavior

- The primary button label is `배포`.
- Clicking the button immediately requests the existing deployment modal to open.
- The button does not show save-and-deploy pending feedback.
- A save failure cannot block this button because the button no longer starts a save.

## Scope and boundaries

- Keep the existing callback contract between `ProjectWorkspaceDraftManager`, `DiagramEditor`, and `WorkspaceProjectBar` to minimize the change surface.
- Change the callback implementation so it only increments `deploymentOpenRequestId`.
- Remove state and UI used only for the former save-before-open behavior.
- Preserve the separate manual save button, automatic/checkpoint saves, and saves performed inside deployment preparation.
- Do not change deployment approval, execution, API, database, or cloud behavior.

## Verification

- Update the focused source regression test to assert that the primary action opens deployment without calling `flushDraftToServer("manual")`.
- Assert the label is `배포` and the removed save-and-deploy pending/error feedback is absent.
- Run the relevant Web test, lint, and typecheck, followed by the repository-required completion checks.
