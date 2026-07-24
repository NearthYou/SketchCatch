# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- The new-project screen shows local AWS, multicolor Google Cloud, and Azure brand icons and uses a wider, larger start-method layout with single-line desktop copy.
- Workspace start cards keep every desktop title on one line, use subdued description typography, and place the AWS Role badge in the Reverse Engineering title row.
- Live Observation keeps up to three problem records stable per session, omits raw logs and the chronological timeline, and shows actual versus expected Task capacity with sustained traffic motion.
- High-traffic motion uses four stable particle lanes and compositor-only transforms instead of request-key churn and layout-bound `left` animation.
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

### 2026-07-24 - Smooth high-traffic Live Observation motion

- Added a red-capable performance contract that reproduced 12 particles per connector and layout-bound `left` keyframes.
- Reduced rendered particles to four fixed lanes per connector while preserving the exact request total in the burst meter.
- Reused lane identities at the cap and moved particles with infinite `translate3d` animation plus `will-change: transform, opacity`.
- Neutralized busy/surge particle size and blur overrides so traffic intensity no longer changes layout geometry.
- Browser verification found no console issues or layout regression; connector and node frames continued changing across a 1.15-second sample.
- Verification: 133 scoped Live Observation tests, root lint, root typecheck, root build task completion, diff checks, and harness check pass. The known Turbo post-success runner hang still required termination.
- No migration, dependency, cloud traffic, deployment, or external mutation was performed.
### 2026-07-24 - Stabilize and clarify Live Observation

- Removed the traffic-surge banner, raw log groups, and chronological incident timeline from the rendered observation UI.
- Added a session-scoped signal ledger so observed problems remain visible while matching evidence refreshes; a new observation session resets the ledger.
- Prioritized readability with a single-column record list, clearer telemetry cards, larger spacing, and a simplified evidence detail.
- Added provider-desired Task fallback and a 1.2-second entering state so newly running Tasks appear as expected before settling; continuous rolling traffic now keeps the flow animation active.
- Browser-verified the failure fixture: no surge banner, log disclosure, or timeline; `실행 2개 · 예상 3개` and two stable records render, and eight animated flow elements change frames.
- Verification: 132 scoped Live Observation tests, root lint, root typecheck, and the direct Web production build pass. Root `pnpm build` reported all five packages successful, then its Turbo runner stayed alive and was terminated after completion.
- No migration, dependency, cloud traffic, deployment, or external mutation was performed.

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

### 2026-07-23 - Live Observation telemetry feedback and review fixes

- Created branch `codex/live-observation-feedback` from `dev`.
- Added an always-visible telemetry summary for accepted Store requests, rolling RPS, projected requests/minute, pressure, expected/actual Task count, provider observation state, and AI analysis state.
- Made capacity projection recover Terraform reference edges before reading ECS target-tracking evidence, so expected Tasks appear even when persisted architecture edges are absent.
- Removed the rendered current-status summary and focused traffic-flow diagram. The deployment selector now labels the selected timestamp inline as `배포 시각`.
- Review fixes preserve stopped and expired lifecycle states, distinguish unavailable AWS observation from delayed data, show actual Task counts without a forecast, and reset cancelled AI analysis when its incident inputs disappear.
- Memoized telemetry isolates the one-second countdown repaint from architecture recovery work, and null snapshots now return before reference recovery.
- Deleted the unrendered focused-flow component, its diagram/particle/capacity-transition modules, focused-flow CSS, traffic-burst helpers, and obsolete tests instead of maintaining inactive animation work.
- Verification: 109 Live Observation tests, Web lint, Web typecheck, and harness checks pass. Root lint, root typecheck, and root build pass across all five packages; the Web build generated all 23 routes.
- Cross-impact verification found zero remaining TypeScript references to the 20 removed focused-flow CSS classes and no changes under API, shared types, AWS connection, Deployment, or CI/CD implementation files. AWS connection, Deployment, and CI/CD regressions pass 318/320; the two failures are unchanged stale CI/CD blue-primary contracts whose implementation files are outside this diff.
- Browser verification confirms the telemetry summary is the first dashboard content and the removed status/flow sections do not render. The local fixture still reports a pre-existing server/client Korean time-format hydration mismatch.
- No migration, dependency, cloud, traffic, or deployment mutation was performed.

### 2026-07-24 - Deploy and verify Live Observation feedback

- Pushed `codex/live-observation-feedback` at `fe570d60dd3809c4c2f9a3f64a392b5bc625d0f9` and deployed that exact SHA with GitHub Actions run `30033156323`.
- The production workflow passed lint, typecheck, build, migration compatibility, environment validation, parallel API/Web image builds, production preflight, worker registration, and ECS stabilization. Web stabilized in 220 seconds and API in 295 seconds.
- Production smoke passed: `/`, `/health`, and `/health/db` returned 200; unauthenticated `/api/projects` returned the expected 401.
- Authenticated Chrome QA confirmed the surge banner and chronological record are absent, the pre-observation Task state reads `실행 확인 중 · 예상 계산 중`, and it later settles to `실행 1개 · 예상 1개`.
- Four real audience check-ins were accepted. During the resulting high request count, connector animation remained `running` and its computed background position advanced across a 350 ms sample.
- The design judgment and next action remained visible while observing and after the test session ended. Workspace and audience pages emitted no browser console warnings or errors.
- The test observation session was ended after verification. No DB migration, dependency change, Terraform action, provider scale-out load cycle, or infrastructure mutation was performed.
### 2026-07-23 - Demo architecture editor flow

- Issue #552 removes the Application Auto Scaling target from the strict Repository ECS/Fargate fixed-template draft while retaining a policy that references the target the presenter adds manually.
- Dropping an Application Auto Scaling target now uses the existing ECS cluster and service names to fill `resource_id`, plus fixed ECS values for `scalable_dimension` and `service_namespace`; the Terraform resource name defaults to `ecs_service_requests`.
- Fixed Template Terraform names now derive from the short `templateResourceId`, resource labels remain visible when the display toggle is on at far zoom, and Terraform gutter/highlight layers synchronize in the same scroll event.
- Verified: focused API tests 2/2, focused Web tests 107/107, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` pass.
- The broader Web suite was attempted earlier and remains red in unrelated baseline tests outside this diff. No dependency, lockfile, migration, cloud mutation, or deployment change was made.
### 2026-07-24 - Merge latest dev into Live Observation feedback

- Fetched `origin/dev` through `a4b87dd6` and merged its 29 branch-only commits into `codex/live-observation-feedback` while retaining the branch's 11 commits.
- Resolved the sole content conflict in `agent-progress.md` by preserving both Live Observation and current `dev` records. Archived older session records under `docs/agent-history/2026-07.md` to restore the harness size limit.
- Post-merge verification passes: harness, root lint, root typecheck, and 121 focused Live Observation tests.
- All five production build tasks and all 24 Web routes completed successfully. The known Windows Turbo wrapper stayed alive after success and was terminated, so the wrapper process reported a non-zero exit after task completion.
- No DB migration, dependency install, cloud mutation, deployment, or traffic generation was performed.
### 2026-07-24 - Start Live Observation design judgment from provider traffic

- Reproduced the missing judgment with a deterministic snapshot where Store traffic had decayed to `0/normal` while the latest one-minute CloudWatch observation contained 540 requests. The pre-fix AI request was `null`.
- Added one effective traffic calculation that takes the fresher maximum of Store projected traffic and the provider one-minute request count, then derives pressure against the validated target-tracking request target and observed running Task count.
- Reused that result for the visible request rate, expected Task count, Design Simulation input, and modal incident trigger. Architecture loading order can no longer discard an already observed provider request spike.
- The exact regression changed from red to green. Thirty-four focused regression/contract checks and the full 124 Live Observation tests pass; root lint, root typecheck, diff checks, and harness pass.
- All five production build tasks and all 24 Web routes completed successfully. The known Windows Turbo wrapper stayed alive after success and was terminated, so the wrapper process reported a non-zero exit after task completion.
- No DB migration, dependency change, cloud traffic, deployment, or infrastructure mutation was performed.
### 2026-07-24 - Deploy provider-traffic judgment fix

- Pushed `codex/live-observation-feedback` at `a173b45c9df410e4394bed9a4fa3cfe90d882433` and deployed that exact SHA with GitHub Actions run `30062741359`.
- The production workflow passed lint, typecheck, build, migration compatibility, environment validation, parallel API/Web image builds, production preflight, worker registration, and ECS stabilization.
- Production smoke passed: `/`, `/health`, and `/health/db` returned 200; unauthenticated `/api/projects` returned the expected 401.
- No DB migration, dependency change, Terraform action, provider load cycle, or new infrastructure resource was performed.
