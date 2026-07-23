# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

## Session Record

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

## Known Risk

- The manifest-contract repair and audience receipt flow are production-verified, but provider-confirmed scale-out remains a separate blocked acceptance item.
- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` was saved by the stale Web process and must be re-analyzed/regenerated or replaced after the Web restart.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite remains at 1,121/1,125 because four architecture-board/compiler tests outside the CI/CD workstream fail; the 102-test focused CI/CD subset is green.
- Provider-confirmed scale-out remains unaccepted because the production acceptance traffic intentionally covered session, receipt, SSE, and heartbeat continuity rather than a load-triggered capacity change.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Re-run the local new-project Repository flow against the restarted Web server and confirm the generated Board contains the runtime Secret chain.
2. Use a separately approved load cycle if provider-confirmed Live Observation scale-out must be accepted; no DB migration is required.
3. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.
