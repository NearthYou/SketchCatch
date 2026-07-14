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

### 2026-07-14 - Hide the Project Board capture clone from the live Workspace

- Isolated the fitted React Flow capture clone inside a transparent paint-tree host, so `html-to-image` can still render the clone while the live Workspace never paints a duplicate Resource layer.
- Removed the capture-source marker from the clone and the entire host after encoding, preventing nested fallback selection and leftover capture DOM.
- TDD evidence: the duplicate-layer regression failed first, the focused capture suite passed 13/13, and the complete Web suite passed 1,237/1,237. Root lint and typecheck passed; lint retains the pre-existing unused `setNow` warning in the API project.
- Chrome verification observed one transparent capture host and one real capture source during save, zero hosts after save, a single visible Resource layer, and a non-empty 1280x720 Dashboard thumbnail. Browser errors and warnings were empty.
- Root build remains blocked before Web compilation by the pre-existing missing `apps/web/.codegraph` path. No API, schema, migration, dependency, cloud, or deployment change was made.

### 2026-07-14 - Refresh a Dashboard Board thumbnail after browser-history restore

- Preserved the same thumbnail endpoint, object URL lifecycle, save control, and capture/upload flow. A Dashboard card now requests its authenticated Board image again when a browser restores the Dashboard from back-forward cache after a Workspace save.
- A request generation guard prevents an earlier in-flight thumbnail read from replacing the newer restored-page image; teardown removes the page-show listener and still revokes the active object URL.
- TDD evidence: the Dashboard restore regression first failed, then the complete Web suite passed 1,233/1,233. Harness, lint, and typecheck passed; lint retains the pre-existing unused `setNow` warning in the API project.
- Root `pnpm build` remains blocked before Web compilation by the pre-existing missing `apps/web/.codegraph` path. No migration, API, storage, cloud, deployment, or dependency change was made.

### 2026-07-14 - Capture complete Project Boards for Dashboard cards

- Replaced the current-viewport capture with an offscreen 1280x720 React Flow clone. It derives the full logical bounds of rendered Resources from the active viewport transform, applies an 8% contain margin, and removes the clone after WebP encoding.
- The user-visible Board viewport, server draft save, thumbnail upload/confirm ordering, and Dashboard card rendering remain unchanged. Existing thumbnails refresh on the next Workspace save, even when the server returns the same revision.
- TDD evidence: full-bound normalization, CSS transform parsing, fitted viewport, and capture-path regression tests passed. The complete Web suite passed 1,231/1,231; harness, root lint, and root typecheck passed.
- Root `pnpm test` has four unrelated API failures: three macOS path-separator lock-file fixture assertions and the existing EKS route-table-association orphan fixture. Root `pnpm build` remains blocked before Web compilation by the pre-existing missing `apps/web/.codegraph` path.
- Follow-up regression: an initial existing thumbnail followed by a manual save of the same revision previously skipped capture. Manual saves now set an explicit force-capture work flag; the focused lifecycle suite and complete Web suite passed 1,232/1,232.

### 2026-07-14 - Connect the Workspace Template start flow

- Split the template path into catalog and detail states while retaining the existing project creation, draft persistence, rollback, and Workspace navigation boundary. Only the detail CTA now creates a project from the selected available template.
- Project-name validation now runs before entering the template catalog and before choosing a catalog card, using the existing inline error, focus, and scroll behavior. The catalog also keeps the name input available for direct Dashboard template links.
- TDD evidence: the dedicated Workspace start suite first failed for the missing catalog validation/detail submit contract, then passed 13/13. The complete Web suite passed 1,227/1,227; Web and root lint/typecheck passed; harness and diff checks passed.
- Root build remains blocked before Web compilation by the pre-existing missing `apps/web/.codegraph` path. No migration, API contract, template definition, dependency, cloud, or deployment change was made.

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

### 2026-07-14 - Render full Board thumbnail clones inside the browser paint tree

- Fixed a real browser regression where manual Workspace saves uploaded a 1280x720 WebP that contained only the Board background. The full-Board clone had been positioned offscreen, which `html-to-image` rendered as blank.
- The clone now renders at the paint-tree origin only while it is captured, remains pointer-inert, and is removed immediately after encoding. The save endpoint, asset upload/confirm sequence, Dashboard image loader, and Board data are unchanged.
- Browser evidence: opened project `ㅜ`, clicked `지금 저장`, observed `저장됨`, then opened Dashboard Projects. The resulting card at 26. 7. 14. 오후 4:52 displayed the fitted diagram; browser error and warning logs were empty.
- Focused regression suite passed 5/5; the full Web suite passed 1,234/1,234; harness and typecheck passed. Root lint passed with the existing API `setNow` unused-argument warning. Root build remains blocked before Web compilation by the existing missing `apps/web/.codegraph` path.

### 2026-07-14 - Wait for initial Board thumbnail backfill to settle

- Existing server Projects with no Dashboard thumbnail now wait 600ms after the missing-thumbnail check before capturing. This gives initial React Flow fit and layout frames time to settle.
- Manual saves remain immediate and do not use the backfill delay. Existing thumbnails still skip capture altogether.
- TDD evidence: the initial-delay regression was RED because capture began immediately after the existence check, then GREEN after the delay. The lifecycle suite passed 10/10 and the full Web suite passed 1,236/1,236; harness and typecheck passed. Root lint retains the existing API `setNow` warning; build remains blocked by the existing missing `apps/web/.codegraph` path.
- Re-run `pnpm build` after the repository restores `apps/web/.codegraph`; root API test still needs the three Windows-path fixtures made platform-neutral before it can be green on macOS.

### 2026-07-14 - Make Dashboard Board captures readable in Project cards

- Changed the desktop Project gallery from three equal columns to two, giving Board captures sufficient horizontal space to remain legible.
- Removed the fixed 150px preview height. The existing thumbnail image's 16:9 frame now determines the full preview height, and the Project title and timestamp remain in the following card row rather than visually truncating the capture.
- TDD evidence: the new layout contract first failed against the three-column and 150px rules, then the focused suite passed 7/7. Browser verification confirmed the two-column Dashboard layout and full 16:9 preview frame above the card body.
- Full Web tests passed 1,237/1,237; root lint passed with the existing API `setNow` warning and root typecheck passed. Root build remains blocked before Web compilation by the existing missing `apps/web/.codegraph` path.
