# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- The new-project screen shows local AWS, multicolor Google Cloud, and Azure brand icons and uses a wider, larger start-method layout with single-line desktop copy.
- Workspace start cards keep every desktop title on one line, use subdued description typography, and place the AWS Role badge in the Reverse Engineering title row.

## Session Record

### 2026-07-23 - Rebuild Repository analysis and Template preview UI

- Split `/workspace/repository` into a focused pre-analysis form and a completed result with compact Repository metadata, mapped evidence, real Template thumbnails, and a Preview-first 28/72 layout.
- Candidate arrows change only the local Preview index. Explicit Template acceptance is required before Board creation, and new recommendation results reset to the first candidate.
- Preserved public/private recovery, follow-up questions, AI new-design entry, recommendation order and confidence, runtime Secret handoff, Board persistence, Analysis Record provenance, and Project Draft revision contracts.
- Added responsive CSS, compact actions, one accessible live candidate announcement, pending/completed status, keyboard-native navigation, and neutral thumbnail/evidence fallbacks.
- Fixed final-review regressions: changing the Repository URL now clears its stale branch, Repository TSX render tests run in the default Web suite, connected analyses fall back to safe `aiHandoff.evidence`, generation locks configuration changes, and deployment-type changes no longer remount the result or lose focus.
- Browser-verified loading, success, failure recovery, candidate navigation, explicit Template use, AI new-design navigation, thumbnail fallback, keyboard focus, and form reset. The result has no console errors or horizontal overflow at 1440×900 and 390×844.
- Added the shared 64px SketchCatch topbar with a return-to-start-mode link, widened the Repository canvas to 1440px, and enlarged the form, result metadata, and Preview-first layout for presentation use. Repository-focused tests, lint, typecheck, production build, and diff checks pass. A fresh unauthenticated local-browser session reached the login guard, so live visual QA still requires an authenticated local session.
- Verified 42 Repository tests and 28 recommendation/handoff tests. Harness, root lint, root typecheck, production build, diff checks, and 25 sandbox E2E tests pass.
- The untouched full Web baseline remains at 1,219/1,227 and the untouched API baseline remains at 1,523/1,557. Root `pnpm test` stops in `test:core`; Terraform tests also require a newer Terraform than local v1.6.6 for `mock_provider` and `override_resource`.

### 2026-07-23 - Clear Repository Analysis result UI

- Removed the old Repository result presentation layer: CSS module, architecture preview, cards, candidate list, visual wrappers, icon wrappers, and old full-width action layout.
- Kept the existing analysis APIs, public/private recovery, recommendation order and IDs, Board creation, Analysis Record persistence, Project Draft revision, navigation, and AI new-design entry.
- Replaced the route surface with minimal semantic HTML: one heading, labeled URL form, native branch and Template selects, status/alert regions, and existing actions.
- Preserved the fetched branch list as a native select after public analysis; users do not need to know branch names manually.
- Verified: Repository route tests 12/12, related analysis/recommendation/handoff tests 36/36, root harness, lint, typecheck, and production build pass.
- Full Web and root test runs remain red only in untouched visual/API fixture tests outside this change. The baseline document records the exact boundary.

### 2026-07-23 - Repository UI boundaries

- No Repository UI follow-up is required before commit. The remaining failing suites are outside this diff and should be repaired separately.
- Do not restore the deleted legacy result cards or change the preserved Repository Analysis, recommendation, Board creation, AI, auth, or route contracts.

### Other 2026-07-23 updates

- 2026-07-23: Removed the legacy `template-live-observation` demo fixture from the user-facing Template Gallery while retaining it for legacy Draft and Live Observation contract verification. Web typecheck and harness check pass; the focused compiler-heavy review test exceeded its 60-second execution limit.
- 2026-07-23: Simplified the shared Template Gallery controls by removing Tag and sort selectors, retaining recommended order, and placing a compact search field on the right with full-width mobile behavior. Verified with the focused gallery regression test, Web typecheck, scoped diff review, and harness check.
- 2026-07-23: Replaced the landing preview footer with a production-style product footer containing the SketchCatch identity, provider-neutral IaC service description, product-section navigation, Login entry, copyright, and responsive mobile layout. Verified with the focused landing regression test, Web typecheck, scoped diff review, and harness check.
- 2026-07-23: Localized the landing navigation, removed the duplicate product-tour action, and routed every landing start CTA through Login so Signup is entered only from the Login page. Verified with the focused landing-flow regression test, Web typecheck, scoped diff review, and harness check.
- 2026-07-23: Added user-scoped Settings caches for AWS, GitHub, and AWS CodeConnections. Cached connection details now survive tab remounts for 30 minutes, stay fresh for 5 minutes, and explicit refresh updates every connection source. Verified with the focused cache regression test, Web typecheck, scoped diff review, and harness check.
- 2026-07-23: Aligned the empty Cost Usage refresh action with the shared dashboard secondary-button UI, typography, icon, and busy state. Verified by scoped diff review and harness check.
- 2026-07-23: Removed the redundant empty-project `새 설계 시작` CTA from both project-list implementations while preserving the top-level `새 프로젝트` action. Verified by scoped diff review and harness check.
- 2026-07-23: Enlarged the `/workspace/new` content area, start cards, titles, descriptions, and icons; added local cloud-provider brand assets and responsive single-column fallback. The focused start-screen test passes 2/2, and lint, typecheck, and production build pass.
- 2026-07-23: Refined the `/workspace/new` start-method cards to match the selected compact UI direction. Added a focused regression test. Verified with the focused test, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.

### 2026-07-23 - Defer Repository Project creation until Board confirmation

- Issue #542 now opens the Repository analysis route with only the draft project name; entering the route or navigating back does not call Project creation.
- Public Repository analysis works without a persisted Project. The Project is created only inside the confirmed Board save path, and a failed first draft save triggers best-effort deletion of that newly created empty Project.
- Existing Project revision checks and Repository provenance retries continue to use the persisted Project ID; successful first saves invalidate Dashboard Project queries.
- The 32 focused new-project/Repository regressions, root lint, root typecheck, root build, diff check, and harness check pass.

### 2026-07-22 - Make Live Observation traffic dense, dramatic, and load-testable

- Preserved the existing Focused Flow nodes, geometry, and routes while raising the visible request cap from five to 24, merging rapid single-event SSE snapshots into one sustained dense burst, and retaining exact overflow accounting.
- Stable particle identities preserve in-flight travel during continuous 5 RPS snapshots: each request replaces only the oldest capped particle instead of restarting the full path.
- Rolling warning/high/critical pressure now raises the existing motion vocabulary from flow to busy/surge. Busy/surge add bounded trail, glow, particle-size rhythm, and critical atmosphere effects; reduced-motion still disables the added ambient animation.
- A standalone HTML preview was reopened with repaired Unicode copy and 9, 24, 250, and 900 request presets.
- The external audience-live-check branch adds two explicit, cancellable profiles that share the real check-in and observation-receipt path with manual audience traffic: 24 requests for the AI warning and 900 requests at no more than 5 RPS for Fargate scale-out verification. Controls require the presenter query flag, 900 requests require confirmation, stale runs cannot overwrite current state, and attempted/succeeded/observed/failed counts remain distinct.
- The external app passes all 58 tests, production build, typecheck, changed-file Biome checks, and diff checks. No bot profile, cloud load, deployment, Terraform action, or AWS mutation was executed.
- Nine focused traffic/reconnect tests, root lint, root typecheck, and the direct Web production build pass.
- The final root pnpm build passed all five packages; the direct Web build also completed all 23 routes after the final particle-identity fix.

### 2026-07-22 - Reset Live Observation retry backoff after recovery

- Added a deterministic fetch/timer regression that reproduced the user-visible delay: three recovered stream cycles still waited `1, 2, 4` units because the lifetime retry counter never reset.
- Routed both SSE and fallback snapshots through one success handler that resets the counter while preserving exponential backoff for genuinely consecutive failures. The regression now observes `1, 1, 1`.
- Twenty-six focused Live Observation tests, focused and root typecheck, root lint, direct Web production build, diff checks, and the final harness check pass.
- Root `pnpm build` was attempted twice but Turbo produced no output and did not terminate; both verified build process trees were stopped. The changed Web package itself compiled and generated all routes successfully.
- AWS read-only evidence could not be refreshed because this session has no configured credentials. No dependency, lockfile, migration, cloud mutation, production deployment, push, or Git/CI/CD handoff was performed.

## Known Risk

- Authenticated browser visual smoke testing for `/workspace/new` was not available in the clean browser session; the route redirected to login. Source-level regression coverage and the production build are green.
- The manifest-contract repair and audience receipt flow are production-verified, but provider-confirmed scale-out remains a separate blocked acceptance item.
- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` was saved by the stale Web process and must be re-analyzed/regenerated or replaced after the Web restart.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite is 1,205/1,213. Eight unrelated baseline contracts fail across generated architecture knowledge, node/thumbnail presentation, typography audits, CI/CD styling, and Live Observation capacity layout.
- Provider-confirmed scale-out remains unaccepted because the production acceptance traffic intentionally covered session, receipt, SSE, and heartbeat continuity rather than a load-triggered capacity change.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Re-run the local new-project Repository flow against the restarted Web server and confirm the generated Board contains the runtime Secret chain.
2. Use a separately approved load cycle if provider-confirmed Live Observation scale-out must be accepted; no DB migration is required.
3. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.
