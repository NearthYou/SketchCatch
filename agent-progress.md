# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- `Fix/jh/490-배포` includes the latest `origin/dev` and the Direct Deployment Plan response, durable worker preparation, failure reconciliation, approval transition, and build-readiness fixes.
- The reported CloudWatch Logs failure is a DNS lookup failure from the local macOS `local_process` worker; production uses an ECS/Fargate one-off worker with configured public egress.
- Focused API checks pass 106/106 and focused Web checks pass 56/56. Root harness, lint, typecheck, build, and diff checks pass.
- No DB migration, dependency change, Terraform Apply/Destroy, or AWS mutation is owned by this workstream.

## Session Record

### 2026-07-19 - Address PR #497 CloudFront review feedback

- Removed the redundant `/api/*` ordered cache behavior because the default CloudFront behavior already forwards every method with zero TTL and full request forwarding.
- Preserved the HTTPS `api_base_url` by recognizing a default behavior that allows all API write methods as an API-capable CloudFront entry point; static GET-only distributions remain excluded.
- Focused API and Template checks pass 65/65. Final harness, lint, typecheck, build, and diff checks are recorded by the merge finishing run; no cloud mutation or deployment occurred.

### 2026-07-19 - Merge latest dev into PR #497

- Merged `origin/dev` at `75c46ce7` into `fix/sw/495-live-observation-template`, preserving the Live Observation Template, reopened approval dialog fix, and combined Live Observation Design Analysis while accepting the latest shared UI and deployment-target work.
- Resolved two documentation conflicts by retaining both workstreams and archived older progress records to restore the harness size limits.
- Focused checks pass 60/60. Root harness, lint, typecheck, build, and diff checks pass; no AWS mutation, Terraform execution, Deployment, traffic generation, dependency change, or DB migration was performed.

### 2026-07-19 - Combine Design Analysis with Live Observation

- Removed the standalone Workspace right-panel Design Analysis mode and placed the same current-Board analysis at the bottom of the Live Observation modal.
- Preserved the explicit read-only analysis action and all runtime observation, Deployment selection, QR, and session controls without AWS or traffic mutation.
- Focused checks pass 33/33. Web and root lint/typecheck/build, harness, diff checks, browser rendering/order QA, and independent standards/spec review pass with no findings.

### 2026-07-19 - Restore Design Analysis in the active Workspace

- Added a dedicated Workspace right-panel view that runs Design Simulation and the deterministic Pre-Deployment Check against the current Board without mutating infrastructure.
- The result presents bottlenecks, failure scenarios, security findings, estimated cost, and combined improvement recommendations; stale Board results are marked for rerun, and Live Observation remains a separate runtime-evidence view.
- Focused checks pass 4/4. Web lint/typecheck, Web production build, root lint/typecheck, harness, and diff checks pass. HTTPS 3000 and API 4000 both remain healthy; no AWS mutation, Terraform execution, dependency, migration, push, or PR occurred.

### 2026-07-19 - Make the ECS Template Live Observation-ready

- Added a CloudFront HTTPS entry point in front of the ECS Fargate Template ALB while retaining the bounded request-based Service Auto Scaling contract (`min=1`, `max=3`, `ALBRequestCountPerTarget=10`). The authored presentation now keeps User, CloudFront, and ALB on the primary traffic path and contains all scaling resources inside Definition / Ops.
- Added Template graph and rendered Terraform regressions for the CloudFront origin, HTTPS redirect, public Outputs, and scaling blocks. Focused Type/API tests, Terraform init/validate, lint, typecheck, and build pass.
- In the approved non-production account `614935468487` / `ap-northeast-2`, the refreshed local project Plan passed at `+36 ~0 -0` and remains unapproved. No AWS Apply, load generation, or Destroy was performed in this step.
- The full test command reaches the Types suite and retains one unrelated baseline Git/CI readiness assertion failure (`null !== 0`); all Template contract failures introduced by the intentional graph change are resolved.

### 2026-07-19 - Merge latest dev into PR #491

- Merged `origin/dev` at `2ae411aa`, preserving the branch presentation typography while accepting the current AWS connection state model and removal of the AI choice-selected label.
- Resolved five textual conflicts and repaired two semantic typography regressions introduced by auto-merged Workspace CSS. Imported migration `0053` and deployment safety changes remain unchanged from `dev`.
- Conflict-focused Web tests pass 31/31, deployment API tests pass 166/166, migration compatibility and Terraform formatting pass, and the full harness lint/typecheck/build sequence passes. No AWS mutation, Terraform execution, or deployment occurred.

### 2026-07-19 - Resolve Live Observation PR feedback

- Lazily mounts the full React Flow Architecture map only while its controlled disclosure is open, preventing zero-sized hidden-container viewport initialization. Added a focused source-contract regression.
- Declined two defensive optional-chaining suggestions because the shared v2 contract requires both `latestObservation.payload` and `payload.capacity`; only their quantitative members are nullable.
- Focused Web checks pass 11/11, and root harness, lint, typecheck, build, and diff checks pass. PR #491 remains based on the existing `fix/ys/479-uiux-수정` branch; no AWS mutation or DB migration occurred.

### 2026-07-19 - Restore the focused Live Observation traffic presentation

- Traced the regression to `8f0c7b54`, which replaced the focused linear traffic renderer with the full immutable Architecture map. Restored the focused path as the default while retaining the full map in a collapsed disclosure and preserving all v2 session, Output URL, and AWS verification gates.
- Fresh public-request or CloudWatch ALB evidence now triggers bounded particles, and v2 `running/desired/max` evidence renders Fargate Task slots as RUNNING/STARTING/AVAILABLE. The ECS Fargate Template adds bounded Service Auto Scaling at 1-3 Tasks with an intentionally low 10 requests-per-target target; Terraform init/validate passes.
- Focused regressions pass 31/31, the ECS Template passes Terraform init/validate, and root harness, lint, typecheck, build, and diff checks pass. Authenticated local browser QA opens the modal; the local test Workspace had no Deployment Architecture, so final visual replay with real capacity remains pending a newly approved sandbox Deployment. No AWS mutation, traffic generation, Deployment, dependency, migration, commit, or push occurred.

### 2026-07-19 - Verify Live Observation traffic in the approved AWS sandbox

- Used only approved non-production account `614935468487` in `ap-northeast-2`; the production-denylisted account was never used. Applied the exact approved 34-create Terraform Plan, verified CloudFront HTTPS, ALB, and ECS 1/1 healthy, and preserved the shared control bucket and fixed execution Role.
- Fixed the Live Observation STS failure caused by a 65-character `RoleSessionName` by shortening the session prefix. The focused snapshot-provider suite passes 6/6, and a fresh session reached `available` with zero errors and fixed Fargate capacity 1/1/1.
- Ran the bounded traffic plan with 3 manual audience requests plus 957 automatic HTTPS GET requests: 60 at 1 RPS and 897 at 5 RPS. All 960 requests returned 200, 5xx remained zero, CloudWatch peaked at 300 target 2xx responses per minute, and ALB p95 peaked at 1.734 ms.
- The exact 34-address Destroy Plan matched the saved Deployment state with no additions or omissions. Destroy started within 30 minutes of Apply success and finished `34 destroyed`; API resources/outputs are zero, tagged `liveobs-7cccab4b` inventory is empty, application IAM Roles are absent, and the ECS service/cluster are `INACTIVE` with zero tasks.
- `pnpm harness:check`, focused tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. The repository was externally switched to `codex/docs-progressive-delivery-journey` during the run, so the one-line fix remains uncommitted there; `apps/web/next-env.d.ts` matches the tracked content again. No secret was printed, no production mutation occurred, and no commit or push was performed.

### 2026-07-19 - Harden Direct Deployment Apply recovery boundaries

- Bound approved Plans to the exact Terraform state baseline (deployment, object key, lineage hash, and serial) and added migration `0053`; Apply blocks stale state before AWS credentials or mutation.
- Fenced no-change release and post-Apply persistence, preserved partial/cancelled outcomes, added graceful worker cancellation with a 120-second ECS stop timeout, checkpointed state before optional result persistence, and classified release failures as `application_release`.
- Focused Plan/Apply/worker regressions pass 65/65. Migration compatibility, infrastructure structure, Terraform formatting, lint, typecheck, build, harness, and diff checks pass. The full suite was intentionally skipped; no cloud mutation or deployment was performed.

### 2026-07-19 - Document Direct Deployment Apply audit improvements

- Added a Korean implementation plan under `docs/jh/07.19` for five Apply audit findings: Plan/Apply state identity drift, no-change release fencing/outcome handling, ECS worker cancellation, post-Apply evidence persistence, and application release failure-stage classification.
- The plan defines safety invariants, implementation slices, focused regressions, completion criteria, and deployment stop conditions without changing runtime behavior.
- Harness and diff checks pass. No API contract, DB migration, dependency, Terraform execution, AWS mutation, deployment, Git handoff, commit, or push was performed.

### 2026-07-19 - Restore detailed Direct Deployment preparation errors

- Routed foreground deployment action failures through the existing preparation-aware error formatter so save, Terraform preparation, architecture snapshot, and artifact upload failures retain their specific safe guidance.
- Added a caller-level regression that failed against the generic fallback and passed after reconnecting the formatter; focused Direct Deployment checks pass 31/31.
- Harness, lint, typecheck, production build, and diff checks pass. No API contract, DB migration, dependency, AWS mutation, Terraform execution, deployment, commit, or push was performed.

### 2026-07-19 - Address PR #485 review findings

- Fixed the chat suggestion selection fallback and guarded clarification response shape checks before using the in operator.
- Focused Web tests pass 7/7; harness, lint, typecheck, build, and diff checks pass.
- No database migration, cloud mutation, deployment, or dependency change was made.


### 2026-07-19 - Isolate the desktop AI Orbit from the conversation

- Rendered all three desktop Orbit layers as circles and constrained the decorative canvas to the space right of the active conversation panel.
- Preserved the existing mobile ellipse geometry, Orbit motion and convergence, and final Preview behavior.
- The 43 Workspace AI checks, root lint/typecheck/build, harness, and diff checks pass. Browser measurements at 1024x768 and 1440x900 show circular rings outside the conversation boundary; 390x844 retains the existing mobile scales with no console warnings or errors.
- The broader `pnpm test` remains red outside this change: API application integration checks cannot start in the isolated environment, and the existing Resource Catalog contracts fail three assertions before later Web tests are cancelled. None of those failing files changed here.

### 2026-07-19 - Separate AWS OAuth status from Repository verification

- Changed an `AVAILABLE` AWS CodeConnection from a permanent Repository warning to a connected success state that explains project save/validation performs the actual checkout verification.
- Preserved AWS Connector permission management, status refresh, and disconnect actions while renaming the presentation helper so it no longer models project Repository access.
- TDD focused checks pass 14/14; harness, lint, typecheck, build, and diff checks pass. The Web suite remains at the existing 914/917 because of three unrelated Resource Catalog contract failures; the root suite additionally retains the existing artifact heartbeat cancellation. Independent standards/spec review reported no findings.
- No API, shared contract, DB migration, dependency, AWS mutation, Terraform execution, deployment, or push was performed.

### 2026-07-19 - Keep GitOps build environments stable across application commits

- Removed the per-release `confirmedCommitSha` from the reusable Project Build Environment fingerprint while retaining exact commit checkout and resolved-SHA verification.
- GitOps release verification now accepts legacy commit-scoped fingerprints only after the explicit stored CodeBuild identity checks and live AWS contract verification remain in place.
- TDD regressions passed 2/2 after reproducing both failures; the focused release/build-environment suite passes 41/41. Harness, lint, typecheck, build, and diff checks pass. A scoped sub-agent review reported no Critical, Important, or Minor findings.
- The first full build retry encountered the earlier parallel Next.js build lock; the existing process completed and the subsequent single build exited successfully. No deployment rerun, AWS mutation, DB migration ownership, dependency, lockfile, commit, or push was performed.

### 2026-07-19 - Make Direct Deployment preparation and UI transitions race-safe

- Made identical saved-snapshot prepare requests reuse one active unapproved Deployment with migration `0052`; the key includes the target fingerprint, and Destroy Plan records are explicitly excluded from reuse.
- Separated foreground action failures from background snapshot/detail refresh, prevented polling from clearing action errors or selecting a later phase, and kept save, Pre-Deployment Check, and Plan behind one action up to explicit approval.
- Focused API route checks pass 69/69, focused Web checks pass 53/53, and CodeBuild race checks pass 40/40. Harness, migration compatibility, lint, typecheck, production build, and diff checks pass. The broad Web suite had 912/917 before two stale source-contract tests were fixed; the three remaining failures are unrelated Resource Catalog contracts. No AWS mutation, Terraform Apply/Destroy, or production deployment was performed.

### 2026-07-19 - Use the current Board source automatically for Deployment

- Resolved Web conflicts with the current branch as the design authority and `dev` as the API/backend authority.
- Preserved both sides where compatible, including the new Board auto-organize comparison state, deployment history structure, AI Orbit behavior, and current branch typography and compact result presentation.
- Retained the imported `dev` API and migration changes without editing their implementation.
- Verification passed: focused auto-organize and deployment regressions 25/25, the broader focused merge set 91/92 before its single stale typography assertion was corrected, Pretendard typography audit 4/4, harness, lint, typecheck, production build, and diff check.

### 2026-07-19 - Self-host the supplied Pretendard variable font

- Replaced the package-backed Pretendard dynamic subset with the supplied Pretendard 1.3.9 variable WOFF2 and bundled its license.
- Authenticated browser QA previously covered 26 public and signed-in views; all 7,153 visible HTML elements resolved to `Pretendard, sans-serif` with zero exceptions.
- Focused typography audit, runtime font response, lint, typecheck, production build, and diff checks previously passed.

### 2026-07-19 - Preserve current Board deployment provenance

- Generic Deploy opens Direct Deployment for the selected project, while explicit CI/CD entry remains separate.
- CI/CD uses Board-provenance Repository, monitoring, and readiness data without substituting an unrelated active Repository.
- The redundant Delivery source card was removed while permission and readiness gates remain intact.

### 2026-07-19 - Preserve deployment and AWS connection safety changes

- Pre-deployment safety details start collapsed and remain keyboard accessible.
- General AWS connection deletion excludes GitHub CodeConnection; the dedicated GitHub build disconnect remains its only deletion path.
- Reverse Engineering scan history remains preserved when an AWS connection is deleted through the imported `dev` migration and API changes.

### 2026-07-19 - Tighten Workspace AI conversation spacing

- Expanded the desktop transcript, suggestion, composer, and composer metadata widths so the conversation panel uses its available space consistently.
- Let the selected-option trail extend to an 18px right inset, and size its heading column to its content instead of reserving a wide empty column. The existing mobile layout remains unchanged.
- Browser checks pass at 390×844, 1024×768, 1440×900, and 1920×900 with no horizontal overflow or console errors. Workspace AI tests pass 43/43; harness, lint, typecheck, build, and diff checks pass.

### 2026-07-19 - Distinguish daily traffic from concurrent users

- Traffic clarification matching now interprets daily visitors and concurrent users as separate dimensions before numeric option matching.
- `일일 500명` maps to the medium option while `동시 접속자 500명` remains large; `스프링부트 썼어` reuses the existing complex business logic option instead of creating a custom option.
- Focused Web/API regressions and the harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Advance AI diagram generation progress sooner

- Reduced the staged diagram-generation interval from 3 seconds to 1.5 seconds and added a final draft preparation stage.
- The first visible transition now occurs after 1.5 seconds, and the progress card continues through five stages while the AI response is pending.
- The focused Web status regression and harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Remove the selected text from AI Start choices

- Removed the visible `선택됨` suffix from selected `/workspace/ai` answer buttons while retaining `aria-pressed` and selected-button styling.
- Removed the unused label style and added a source regression for the route-specific transcript.
- The focused Web regression and harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Keep AI Start progress moving across card remounts

- Moved `/workspace/ai` diagram-generation step ownership from the conditional progress card into the persistent conversation transcript.
- The card now receives a controlled step, so rerenders or remounts cannot reset the visible progress to requirement analysis; the shared Workspace dock retains its local fallback timer.
- The focused Web regression and harness are recorded by the finishing verification run. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Ask Amazon Q to resolve unsatisfied architecture requirements

- Replaced the terminal requirements-unsatisfied 422 path with a dedicated Amazon Q conflict-diagnosis request after generation and repair both fail validation.
- Amazon Q receives the original requirement, accepted answers, decision space, normalized requirement, and exact validation issues; its question and preserve-versus-relax choices are returned unchanged through the existing clarification flow.
- The focused API regression and API typecheck pass. No database migration, deployment, cloud mutation, or push was performed.

### 2026-07-19 - Route conflict diagnosis through the real Amazon Q provider

- Fixed the production Amazon Q Business provider, which previously ignored the conflict prompt and always returned another locally generated canonical plan, causing the replacement HTTP 502.
- Conflict requests now call Amazon Q Business ChatSync with the exact validation failures and user requirement. JSON and plain-text/numbered Q answers both become the existing clarification question and choices without server-side trade-off selection.
- Workspace AI draft failures now keep full diagnostics in the browser console and show one short transcript message instead of duplicated developer diagnostics.
- Focused API provider/parser and Web presentation regressions pass; API/Web typechecks pass. No database migration, deployment, cloud mutation, or push was performed.
