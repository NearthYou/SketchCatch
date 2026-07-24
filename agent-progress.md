# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

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
- 2026-07-24: Merged the latest dev branch into `fix/gg/484-settings`. A persisted AWS structure-analysis check now keeps its next action after refresh, and a blocked AWS disconnect dialog sends the user directly to that action. Focused Settings checks, harness, lint, Web typecheck, and production build pass.
- 2026-07-24: Restored AWS disconnect when an old structure-analysis helper record remains. The disconnect now blocks only active deployment state, keeps AWS-side structure-analysis settings intact, and shows the cleanup action instead of a retry-only dead end. Focused Settings tests passed 25/25, focused API tests passed 34/34, harness, lint, typecheck, and production build passed. Chrome automation could not attach to the running browser, so no live AWS deletion was executed.
- 2026-07-24: Audited the Reverse Engineering reader and permission contracts. API Gateway Stage and KMS Alias now remain in the preview when the Web UI normalizes a child selection to its parent scan family. The catalog route test covers all 68 scan selections; four Cloud Control-only aliases remain visible as manual-review resources and are not represented as Terraform-managed resources.
- Settings now offers only the Seoul region because the current connection, runtime credential, and deployment contract supports that region only. When an AWS Console shortcut cannot be created, the user can download the exact connection Template and continue approval in AWS Console instead of reaching a retry-only dead end.
- Re-ran the Reverse Engineering suite (382), Workspace start and preview suite (139), AWS connection and import-access suite (176), Settings suite (23), harness, root typecheck, and production build successfully. The root test command remains red only in unchanged AI architecture-draft and visual-baseline suites.


## Session Record
- 2026-07-23: Stabilized Template Gallery cards by moving Resource/relationship counts into a bordered summary, widening Korean descriptions with word-safe wrapping, anchoring preview actions to the card bottom, and separating the fixed modal header from the scrollable gallery. Focused regressions, root lint, root typecheck, and all five production build tasks passed; the full test command remains red in unrelated pre-existing Web baseline suites.

- 2026-07-23: Renamed the Dashboard profile route label from My Page to 개인정보 수정 and expanded its page header across the shared Dashboard content width while preserving the centered 760px form card. No test command was run at the user's explicit request.
- 2026-07-23: Fixed My Page profile updates that falsely returned an expired-verification 401 because PostgreSQL stored `users.updated_at` with microsecond precision while JavaScript `Date` compared only milliseconds. The update now locks the user row, validates the millisecond credential version inside the transaction, and advances `updated_at`; the exact local signup → verification → password update flow changed from 401 to 200. No broad test suite was run.
- 2026-07-23: Refined the Dashboard Settings submenu with the shared Pretendard font, a 2px smaller My Page label, 4px additional separation, and a reduced-motion-safe downward reveal. No test command was run at the user's explicit request.
- 2026-07-23: Aligned the My Page new-password and confirmation controls as an equal-width desktop row with shared feedback below and a single-column mobile fallback. No test command was run at the user's explicit request.
- 2026-07-23: Completed Dashboard My Page profile updates without a DB migration. Password accounts now require server-verified current-password proof in an HttpOnly cookie before a conditional nickname or optional-password update; social-only accounts can change only their nickname. Password changes revoke prior refresh/reset tokens and issue a fresh current-browser session. The focused eight-route auth checks, root lint, typecheck, build, and harness check passed before the final internal concurrency/cookie hardening; no further test run was made at the user's explicit request.

### 2026-07-23 - Make AWS connection a single user-facing flow

- Reframed Settings around one AWS connection: after the user approves the normal AWS Console step, the same connection is used for deployment and existing-infrastructure analysis.
- New connection templates now include the current bounded read catalog. Existing AWS connections and their deployment permissions are not changed by this code.
- Added a direct bounded read check for verified connections that have no older companion setup. A ready or limited result is saved without creating or requiring a separate cleanup item; missing core reads safely return to the existing Console recovery path.
- Kept old companion artifacts protected: they still block connection removal until their existing cleanup flow completes.
- Removed Role, Stack, Policy, ARN, full CloudFormation template, API diagnostics, and raw cleanup names from the normal Settings UI. A successful connection no longer keeps an extra structure-analysis card visible unless recovery, cleanup, or Reverse Engineering return is needed.
- Confirmed the current branch in a separate local Web server. The user-facing Settings page shows `AWS 연결`, `AWS 연결 확인`, and `AWS 연결 해제` rather than the former internal labels.
- Focused API tests (62), focused Settings and structure-analysis tests (36), harness, root typecheck, root build, and root test pass. Root lint passes with one pre-existing unused-variable warning in `aws-reverse-engineering-gateway.ts`.
- No database migration, AWS mutation, production deployment, push, or PR was performed.

### 2026-07-23 - Recover blocked AWS import preparation

- Confirmed the local SSO caller and the saved deployment Role can both access their expected AWS identities. The failure was not an expired SSO session.
- Added a narrow recovery path for an old import-access record that has a cleanup retry but no stored Manager or Policy identity. It only opens the existing AWS Console approval flow and never mutates AWS automatically.
- Kept incomplete cleanup and completed cleanup records blocked from recovery so known AWS artifacts cannot be skipped before deletion.
- Made the AWS connection step independent from GitHub App setup. CodeBuild still requires both GitHub and AWS connections.
- Added CloudFormation read checks to the template used by future AWS connections. Existing Roles are unchanged until their owner approves a separate AWS Console update.
- Verified the repaired Settings page in Chrome: the recovery button and AWS accordion are enabled, CodeBuild remains locked, and the page has no console errors.
- Focused Web checks and the targeted connection-service tests pass. The broader import-access service file still has one pre-existing catalog-version expectation mismatch (`11` actual versus `6` expected).

### 2026-07-23 - Simplify the Reverse Engineering start flow

- Moved the first AWS import action to the empty-board center and removed the old left-side `보드 후보 선택` guidance and duplicate right-side scan button for a new project.
- Kept the scan preview-only until the user applies it. The center action now always uses the latest advanced resource selection.
- Split scan failures into Settings recovery for AWS connection setup issues and plain retry for temporary failures. Existing saved-project scans retain the safe generic error message.
- Removed the central start-card title and description and removed the right-panel header as requested; error recovery text remains only when it is needed.
- Focused Reverse Engineering tests (27), Web typecheck, root lint, harness check, and diff check pass. API lint has one existing unused-variable warning in `aws-reverse-engineering-gateway.ts`.

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

### 2026-07-24 - Reverse Engineering completion audit

- Checked every current Reverse Engineering catalog scan route. Each supported scan selection has a dedicated reader or an explicit Cloud Control inventory route; review-only resource aliases stay review-only and are not presented as Terraform-managed resources.
- Preserved tags from EC2 query readers and RDS so imported resources keep their observed configuration and tag-based presentation frames.
- Kept scan success on the preview screen, opened the result actions for narrow screens, warned before apply when a scan is partial, and made the details modal restore keyboard focus correctly.
- Kept AWS import-access cleanup metadata until its Manager and Policy artifacts are confirmed cleaned. Connection deletion and read checks now refuse to bypass an active or completed cleanup flow.
- Focused Reverse Engineering, AWS connection, import-access, Settings, sandbox, and Terraform import-safety tests pass. Root `pnpm test` still fails in existing AI architecture-draft and Template visual-baseline tests outside this audit.
- The local Web server on port 3000 is running from this branch. The Chrome controller cannot currently attach to a user tab, so no browser-driven cloud mutation was attempted.
- Root lint is now clean. The local Terraform v1.6.6 cannot parse this repository's existing `mock_provider` and `override_resource` test blocks, so `pnpm test:terraform` is an environment-version failure rather than a Reverse Engineering assertion failure.
