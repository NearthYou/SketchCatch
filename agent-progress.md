# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/gg/381-brainboard-aws-templates`.
- Project Board capture storage and Workspace lifecycle changes are merged into `dev` at `186ff261`; the reviewed bounded Dashboard thumbnail refresh follow-up is uncommitted in this branch's working tree.
- Six deployable AWS Templates use compact 40px-grid authored layouts and real Resource-panel Catalog items.
- Security Group is a visual scope with explicit attachment edges, never a persisted containment parent; ASG is a regular 48px Resource.
- Template cards and large previews use actual 1280x720 ReactFlow Board WebP captures. Project cards use the latest authenticated Board DOM capture.
- Workspace Template 전체보기 renders through a body Portal below the 64px project navigator, isolates the background, and keeps keyboard focus inside the dialog.
- The complete Web suite passes 1,161/1,161 with the repository user's Node v24.18.0 runtime, including the bounded Dashboard thumbnail refresh tests.
- A real filesystem thumbnail upload/read API flow passes without AWS credentials.
- Root `pnpm test` retains three unrelated macOS failures in Windows-path lock-file fixtures; root `pnpm build` remains blocked before Web compilation by the existing missing `apps/web/.codegraph` path.
- No `apps/api/drizzle/**` migration file was created, edited, renamed, or renumbered in this workstream.

## Session Record

### 2026-07-14 - Stabilize Dashboard Project Board thumbnail refresh

- Added a small dependency-injected loader that retries missing (`404`/`null`) and transient thumbnail reads at most three times with a fixed 250ms delay; it returns explicit ready, empty, error, or cancelled results and never polls.
- Preserved status on thumbnail response errors so permanent 4xx responses stop immediately while network errors and 408, 429, or 5xx responses retry. Dashboard cards now use a small lifecycle owner that ignores stale post-dispose results and revokes generated object URLs.
- TDD evidence: missing loader, permanent-error, response-status, and lifecycle tests first failed, then the focused suite passed 60/60. The full Web suite, root lint/typecheck, migration compatibility check, and harness check passed.
- A second read-only review found no Critical or Important issues. It confirmed no synthetic preview, storage, schema, backend endpoint, or deployment scope was added.
- The real API filesystem upload/read test passed. Root test has only the three pre-existing Windows-path fixture failures; root build remains blocked by the pre-existing missing `.codegraph` directory. No API contract, schema, migration, cloud, deployment, or dependency change was made.

### 2026-07-14 - Remove redundant Template card helper copy

- Removed both explanatory `small` lines from the Workspace Template library and immediate-apply cards without replacement.
- Preserved visible names, accessible names, click behavior, and removed the now-dead Template card `small` style.
- Verified independent RED/GREEN coverage for both card variants; the focused suite passed 9/9.
- The complete Web suite, typecheck, lint, harness, and diff check passed with the repository user's Node v24.18.0 runtime. Review found no Critical, Important, or Minor issue.

### 2026-07-14 - Close Template Portal review findings

- Unified the Template 전체보기 trigger's accessible and visible functional name while keeping comparison and Board non-application as supporting copy.
- Added symmetric modal focus, Escape, Tab/Shift+Tab, body sibling `inert`, body overflow, cleanup, and visible focus-ring behavior without a new dependency.
- TDD evidence progressed through five expected RED/GREEN cycles; the final focused suite passed 10/10, including an executed fake-DOM lifecycle regression.
- Web typecheck and lint passed. The full Web suite initially exposed the bundled-Node timestamp locale mismatch, then passed 1,141/1,141 with the repository user's Node v24.18.0 runtime.
- Updated the design and implementation plan. No API, migration, cloud, deployment, or dependency change was made.

### 2026-07-14 - Move Template 전체보기 to a body Portal

- Added a dedicated modal CSS Module and rendered `TemplateLibraryModal` into `document.body`, with the overlay starting below the 64px project navigator.
- TDD evidence: the focused test failed first because `template-library-modal.module.css` did not exist, then passed 7/7 after the Portal implementation.
- Web typecheck and lint passed. The full Web suite passed 1,137/1,138; its only failure is the existing bundled-Node locale mismatch in `dashboard timestamps use the production display timezone`.
- Web build remains blocked before compilation by the existing missing `apps/web/.codegraph` path. No API, migration, cloud, deployment, or dependency change was made.

### 2026-07-13 - Integrate latest dev after PR #380 conflict detection

- Merged `origin/dev` at `99db7f61` after GitHub reported the first PR revision as conflicting.
- Kept dev's shared SelectMenu typography, compact Project card layout, cost UI, and deployment updates while retaining actual Board raster captures instead of the reintroduced synthetic SVG preview.
- Verification after conflict resolution: Web 1,137/1,137; focused capture and shared-dropdown regressions 26/26; typecheck and harness passed; lint retained one existing unused-argument warning.
- Root API tests remained 1,335/1,338 because of the same three existing Windows path-separator fixtures on macOS.

### 2026-07-13 - Implement issue #369 Workspace and Template Board UX

- Added the repository-wide migration collision reporting contract, blank-board single-flight navigation, compact Template geometry, Terraform local-name separation, and actual Board thumbnail flow.
- Removed the synthetic Template SVG preview model. Static Template captures now record the exact materialized DiagramJson hash; saved Projects upload a real ReactFlow DOM WebP after autosave.
- Browser QA confirmed all six Workspace Template entries scroll correctly, the large-preview control does not apply a Template, and Dashboard cards render raster Board captures.
- Initial verification: Web 1,125/1,125; focused Template contract 17/17; focused thumbnail API 25/25; harness, typecheck, migration compatibility, and API build passed.
- Root API tests remained 1,331/1,334 because of the three existing Windows path-separator fixtures on macOS. Lint retained one existing unused-argument warning.
- Full Web build was blocked by the existing missing `apps/web/.codegraph`; Terraform CLI validation could not start because this environment has no `terraform` binary.
- Risk: no Terraform Apply/Destroy, AWS mutation, deployment mutation, or database migration execution was performed.

## Next Action

- Commit or push the reviewed bounded thumbnail retry diff only when requested. Keep the unrelated untracked `docs/gg/feat-infrastructure-template/brainboard-captures/aws-vpc-subnets-security-groups-2az.json` outside this change.
- Re-run `pnpm build` after the repository restores `apps/web/.codegraph`; root API test still needs the three Windows-path fixtures made platform-neutral before it can be green on macOS.
