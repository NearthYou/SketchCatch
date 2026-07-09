# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- The current branch is `Refactor/jh/273-uiux-개편`.
- `/dashboard`, `/dashboard/projects`, `/dashboard/projects/[projectId]`, `/dashboard/projects/[projectId]/settings`, `/dashboard/templates`, `/dashboard/costs`, and `/dashboard/settings` now render the new `DESIGN.md`-based dashboard surface.
- Workspace visual QA and cleanup pass 3 is complete: Terraform, Issues, full-screen Deployment console, active panel mode controls, AI panel/chat, and right-panel surfaces now use the `DESIGN.md` neutral workspace tokens and black primary actions in the final overrides.
- `/mypage` remains an intentionally blank page from earlier work. `/login` currently renders a centered `DESIGN.md`-based login panel.
- The old top-level dashboard tab route pages under `/projects`, `/templates`, `/costs`, and `/settings` remain removed.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @sketchcatch/web test`, the focused dashboard route test, and the focused workspace right-panel layout test pass with the bundled Node runtime path.
- Playwright Chrome visual QA passed with mock auth/API responses for `/workspace?diagramFixture=conventions&projectName=Visual%20QA`; temporary screenshots were inspected and then removed from `output/playwright/`.

## Changes This Session

- Replaced the blank dashboard route implementations with a new shared `DesignDashboardPage` component.
- Added the new dashboard surface in `apps/web/features/dashboard/design-dashboard.tsx` with overview, projects, project detail, project settings, templates, costs, and workspace settings views.
- Added dashboard route coverage that asserts each `/dashboard/*` page uses the new surface, avoids the legacy dashboard shell/client components, and follows `DESIGN.md` dashboard CSS tokens.
- Verified desktop and mobile rendering in the browser. The dashboard has no document horizontal overflow, no legacy shell, and the primary black CTA computes to white text after the contrast fix.
- Added a final `DESIGN.md workspace internal panel pass` override to `apps/web/features/workspace/workspace.module.css`.
- Added workspace right-panel regression coverage that locks the final visible internal panel overrides away from legacy Blueprint/Brainboard tokens.
- Verified the focused workspace layout test and the full web feature test suite after the internal panel pass.
- Fixed pass 3 browser QA findings where legacy high-specificity selectors kept active Resource/Terraform icons gray and could wash out the active Issues button during hover.
- Extended `DESIGN.md` token overrides to the full-screen Deployment console expanded overlay/shell/header/body classes.
- Renamed old workspace CSS block comments to explicit legacy compatibility layer comments and added tests that require the final `DESIGN.md` pass to follow them.
- Verified resource default, Terraform, Issues, and full-screen Deployment states in Playwright with no login redirect, no page horizontal overflow, no inspected control/text overflow, and no console/page errors.

## Broken Or Unverified

- The dashboard content is currently static representative product data; API/RDS-backed dashboard data is not connected in this pass.
- Workspace visual QA used mocked auth/API responses, not a real signed-in browser session or real backend data.
- Older legacy CSS declarations remain earlier in the large workspace CSS module; the final override controls the tested visible surfaces, and comments/tests now make the legacy layering explicit.
- Default shell still lacks `node`; use the bundled runtime path for pnpm scripts.
- Many unrelated dirty files remain from prior work and were not reverted.

## Best Next Action

- Either consolidate the older workspace CSS compatibility declarations in a dedicated cleanup pass, or continue with the next scoped workspace visual pass.
