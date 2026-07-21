# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `codex/fix-error-progress-completion` includes `origin/dev` through `d189cda3` and keeps the compact Workspace AI Terraform error-analysis gauge visible through an explicit successful 100% completion state.
- The parked JH Workspace changes are restored on `dev`: Deployment uses the shorter `배포` label and intrinsic action width, Settings omits redundant CodeBuild authorization copy, and Project Draft loading uses the server draft whenever one exists without rendering the removed local-recovery chooser.
- Terraform reverse sync accepts references to its allowlisted utility resources, so generated Runtime Secret values such as `random_password.check_in_signing.result` round-trip without a false manual-edit warning.
- The Direct Deployment branch includes `origin/dev` through `fce1d6c0`, removes duplicate deployment summaries, and keeps selected history details within the active filter. Eighty-six focused Web tests and the root harness, lint, typecheck, and build checks pass.
- The legacy `practice` Deployment profile is removed; `demo_web_service` is the default live profile, and imported migration `0054` rewrites legacy rows before removing the enum value.
- Live Observation renders bounded traffic motion, a task-count-responsive Fargate fleet, and collapsed operational analysis without development-only traffic or Task preview controls.
- Delayed first CloudWatch points retain request and capacity evidence, and stopped sessions no longer continue the countdown.
- The approved sandbox traffic run sent exactly 963 requests with 963 HTTP 200 responses. The failed observation acceptance triggered approved cleanup, and the `liveobs-7cccab4b` AWS resource set was verified absent.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with cleared state and current-plan pointers.
- Repository ECS delivery carries runtime Secret names through analysis. Both strict AI and Fixed Template drafts now generate `CHECK_IN_SIGNING_SECRET` during approved Apply, map the same Secrets Manager ARN into the IAM policy and every Task, and leave `INSTANCE_ID` unset for hostname-based observation.
- Public ECS/Web release verification accepts both the legacy `sessionId` check-in response and the stateless signed `sessionToken` response while retaining the required 201 status and ISO expiry check.
- Windows subprocess, local environment isolation, generated architecture knowledge, resource catalog, typography, and Workspace source-contract regressions are repaired.
- Sixty focused Repository runtime-Secret, deployment-action, and failure-visibility regressions pass; the final post-review 50-test subset also passes. `pnpm lint` and `pnpm typecheck` pass. Root `pnpm build` reported all five tasks successful before the known Turbo exit hang. The full Web suite passes 1,090 of 1,098 tests; its eight failures are outside the changed runtime-Secret paths. Root `pnpm test` still exposes ten unrelated API baseline failures and one lease-heartbeat cancellation; its one Repository source-contract failure was corrected and passes focused verification.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

- 2026-07-21: Completed the first CI/CD UI distillation pass: removed duplicate readiness chrome, embedded automatic target evidence, consolidated refresh ownership in the header, and fixed refresh-generation races. Forty-one focused Web tests plus root harness, lint, typecheck, and build passed. No API, DB migration, cloud mutation, or Git handoff change was made.
- 2026-07-21: Rebuilt the CI/CD workspace as a compact server-readiness status board plus one continuous accordion for Delivery, GitOps monitoring, deployment target, automatic setup, PR handoff, and Pipeline. Current actions open the relevant local section, PR creation keeps its existing approval gates, and Pipeline state is scoped to the selected handoff. Verification: 35 focused Web contract tests, root harness, lint, typecheck, and build passed. No DB migration, cloud mutation, or Git handoff was performed.

## Known Risk

- The local browser reached the authenticated Workspace gate, but no reusable login session was available; the CI/CD route was therefore not visually captured with live project data in this session.

- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` was saved by the stale Web process and must be re-analyzed/regenerated or replaced after the Web restart.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite is not green because eight architecture-board/compiler tests outside this workstream fail; the runtime-Secret regression subset is green.
- End-to-end Live Observation animation and provider-confirmed scale-out remain unaccepted because the active UI session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Open an authenticated project CI/CD screen and visually confirm the compact status board and accordion with real readiness, handoff, and Pipeline data.
2. Re-run the local new-project Repository flow against the restarted Web server and confirm the generated Board contains the runtime Secret chain.
3. Deploy `dev` through the normal reviewed workflow when a production release is approved; no DB migration is required for these changes.
4. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.
