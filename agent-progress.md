# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- AWS connection managed cleanup uses a single bounded AWS SDK retry layer, waits through the established IAM propagation schedule for deletion conflicts, and keeps authorization and ownership failures non-retryable.
- The new-project screen shows local AWS, multicolor Google Cloud, and Azure brand icons and uses a wider, larger start-method layout with single-line desktop copy.
- Workspace start cards keep every desktop title on one line, use subdued description typography, and place the AWS Role badge in the Reverse Engineering title row.
- Repository Template previews show a dynamic recommendation rank, use the clearer AI design action, and keep candidate navigation anchored independently of recommendation-reason length.
- Repository follow-up questions separate selected Template context, section hierarchy, individual prompts, and card-style answer choices.
- 2026-07-24: Fixed AI Architecture chat patches for Application Auto Scaling target values. Exact resource IDs and the sole matching scaling policy now resolve deterministically, nested target-tracking config shapes are preserved, supported local plans skip Bedrock latency, and no-op requests return clarification instead of fake success.
- Added synchronous submission and patch-application locks. Board patch success now appears only after Project Draft persistence returns either an explicit local-save success or a valid saved server revision; missing callbacks and failed save results no longer claim success.
- Verified the focused API suite 7/7 and Web routing/consolidation suite 17/17, including the exact ecs_service_requests target value 50 to 5 regression, provider bypass, duplicate prevention, local-save results, and resolved { ok: false } handling.
- Root lint and typecheck passed. All five package production builds passed directly; the final Turbo wrapper did not exit after completing work, so it was terminated after package-level verification.
- Root pnpm test remains red in unrelated pre-existing Web baseline tests such as Settings CodeConnection refresh, Live Observation layout contracts, and Repository start behavior. The focused suites for this workstream pass.
- No schema, dependency, shared contract, cloud resource, deployment, or migration changes were made.

## Session Record

- 2026-07-23: Stabilized Template Gallery cards by moving Resource/relationship counts into a bordered summary, widening Korean descriptions with word-safe wrapping, anchoring preview actions to the card bottom, and separating the fixed modal header from the scrollable gallery. Focused regressions, root lint, root typecheck, and all five production build tasks passed; the full test command remains red in unrelated pre-existing Web baseline suites.

- 2026-07-23: Stabilized AWS connection deletion without a migration or live AWS mutation. Managed cleanup now gives AWS SDK resource clients six bounded attempts, retries IAM `DeleteConflictException` and `ConcurrentModificationException` across the established 31.75-second propagation schedule, and treats IAM `NoSuchEntityException` as idempotent success. Added focused coverage for retry-layer ownership, IAM consistency, permanent authorization failures, missing resources, and ownership safety. The 13 focused cleanup/service/route tests, root lint, typecheck, build, harness, diff checks, and two-axis review passed. Root `pnpm test` remains blocked by the unrelated Web `ReverseEngineeringScanCriteriaForm.test.tsx` CSS-module loader failure.
- 2026-07-23: Renamed the Dashboard profile route label from My Page to 개인정보 수정 and expanded its page header across the shared Dashboard content width while preserving the centered 760px form card. No test command was run at the user's explicit request.
- 2026-07-23: Fixed My Page profile updates that falsely returned an expired-verification 401 because PostgreSQL stored `users.updated_at` with microsecond precision while JavaScript `Date` compared only milliseconds. The update now locks the user row, validates the millisecond credential version inside the transaction, and advances `updated_at`; the exact local signup → verification → password update flow changed from 401 to 200. No broad test suite was run.
- 2026-07-23: Refined the Dashboard Settings submenu with the shared Pretendard font, a 2px smaller My Page label, 4px additional separation, and a reduced-motion-safe downward reveal. No test command was run at the user's explicit request.
- 2026-07-23: Aligned the My Page new-password and confirmation controls as an equal-width desktop row with shared feedback below and a single-column mobile fallback. No test command was run at the user's explicit request.
- 2026-07-23: Completed Dashboard My Page profile updates without a DB migration. Password accounts now require server-verified current-password proof in an HttpOnly cookie before a conditional nickname or optional-password update; social-only accounts can change only their nickname. Password changes revoke prior refresh/reset tokens and issue a fresh current-browser session. The focused eight-route auth checks, root lint, typecheck, build, and harness check passed before the final internal concurrency/cookie hardening; no further test run was made at the user's explicit request.

### 2026-07-23 - Stabilize Repository Template preview controls

- Replaced the generic Template Preview eyebrow with the active candidate rank and renamed the AI design action to AI로 직접 설계.
- Top-aligned the candidate navigation with the recommendation copy so 1 / 3, 2 / 3, and 3 / 3 no longer move vertically when reason lengths differ.
- Refined the follow-up step with a subdued selected-Template summary, a larger section heading, tight Template-to-section spacing, whitespace-separated question groups, tighter prompt-to-choice spacing, and accessible card-style radio choices with clear checked, hover, and focus states.
- Browser-verified the two-question layout and selected answer state at desktop size.
- Verified 46 Repository tests, root lint, root typecheck, production build, authenticated browser navigation, scoped diff checks, and the final harness check.

### 2026-07-23 - Emphasize Repository URL analysis entry

- Added the Git branch icon to the Branch field and enlarged the pre-analysis Repository heading, labels, inputs, hint, error state, and submit action for presentation use.
- Added a decorative GitHub mark to the Repository URL label while keeping the existing Branch icon and field layout.
- Kept the completed analysis result typography and controls at their existing scale.
- Verified with 23 Repository route tests, Web lint, Web typecheck, Web production build, root harness check, and diff check.
- Root `pnpm test` still fails in pre-existing Settings, board-rendering, and API baseline suites outside this change; the Repository screen test passes inside that run.

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

### 2026-07-23 - Improve Repository follow-up question readability

- Raised the follow-up section heading, prompt, choice, and text-input sizes while preserving existing design tokens, focus states, and responsive behavior.
- Fixed the nested choice label inheriting the generic 12px metadata rule by explicitly inheriting the button typography.
- Set the public Board action to a balanced 220 by 48px desktop size, retained the mobile full-width rule, and separated it from questions with a hairline divider.
- Added 20px between questions without bullets, removed the question-stage top divider, and increased the back action to 40px with a 12px summary gap.
- Kept the previously updated GitHub issue #543 unchanged after canceling a later unsaved edit, and retained branch fix/ck/543-repository-question-ui.
- Repository-focused tests passed 29/29 after merging the latest dev branch. Web and root lint/typecheck passed. All five root build tasks and all 23 Web routes completed successfully.
- User-provided authenticated-state screenshots guided the final spacing and sizing adjustments. No credentials, cloud mutations, dependency changes, or migrations were involved.
- The latest dev Repository analysis rebuild superseded the branch-specific presentation structure during merge resolution; dev behavior and styles were retained. The merged Repository suite passes 44/44, and root lint, typecheck, build, diff, and harness checks pass.

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

### 2026-07-23 - Stop Workspace AI message-triggered Orbit flashes

- Issue #553 now keeps the Orbit reaction key stable while the conversation remains in the same stage, so user answers and assistant follow-up messages no longer restart the transient response animation.
- Preserved `DecorativeAwsOrbit`, the continuous Orbit motion, convergence, Preview transition, and all Orbit CSS animation definitions unchanged.
- Verified the regression red before implementation and green afterward. The focused Orbit suite passes 13/13, Web ESLint passes, Web `tsc --noEmit` passes, `git diff --check` passes, and the harness check passes.
- `next build --webpack` compiled successfully, then stopped on the pre-existing `apps/web/app/api/ai/architecture-draft/route.ts` export of `forwardArchitectureDraftRequest`; that route is unchanged from `dev`.

### 2026-07-24 - Delay Workspace AI generation progress until clarification completes

- Issue #553 now renders the diagram-generation progress card only after the active stream emits a server progress snapshot; ordinary loading while validating an answer or returning the next clarification remains in the conversation state.
- Each request exposes only its own `requestSnapshot`, so a prior response cannot make the next clarification request look like generation has started.
- Preserved `DecorativeAwsOrbit`, Orbit motion, convergence, Preview transition, and all Orbit CSS definitions unchanged.
- The exact regression failed before implementation and passes afterward. The focused Workspace AI and Orbit regression set passes 34/34, Web ESLint passes, and `git diff --check` passes.
- Root pnpm checks remain unavailable in the isolated junction worktree because pnpm attempts a networked reinstall. Direct Web typecheck reaches only the two pre-existing invalid Next route helper exports; no changed file is involved.

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

### 2026-07-23 - Demo architecture editor flow

- Issue #552 removes the Application Auto Scaling target from the strict Repository ECS/Fargate fixed-template draft while retaining a policy that references the target the presenter adds manually.
- Dropping an Application Auto Scaling target now uses the existing ECS cluster and service names to fill `resource_id`, plus fixed ECS values for `scalable_dimension` and `service_namespace`; the Terraform resource name defaults to `ecs_service_requests`.
- Fixed Template Terraform names now derive from the short `templateResourceId`, resource labels remain visible when the display toggle is on at far zoom, and Terraform gutter/highlight layers synchronize in the same scroll event.
- Verified: focused API tests 2/2, focused Web tests 107/107, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` pass.
- The broader Web suite was attempted earlier and remains red in unrelated baseline tests outside this diff. No dependency, lockfile, migration, cloud mutation, or deployment change was made.
