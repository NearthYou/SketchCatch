# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Terraform issue resolution now uses the diagnostic's source file instead of combined multi-file HCL, preserves a required closing brace when removing trailing tokens, and does not synthesize unsafe line deletions.
- Terraform issue resolution no longer waits for an external AI provider; Terraform Agent Review still requires a successful Amazon Q Business response and shows four staged progress messages while waiting.
- Terraform Agent Review now turns Amazon Q's grounded conclusion into a compact labeled summary and six concrete Well-Architected checks, each with an explicit issue/current assessment and verification action.
- Branch `codex/fix-live-observation-redis-readiness` adds runtime-owned Redis ingress from the current ECS API and worker security groups to the external Runtime Cache security group, with fail-closed Terraform preconditions.
- PR #423 is open. Apply run `29387480668` successfully created and state-verified the two API/worker Redis ingress rules; post-apply review run `29387561447` reported no infrastructure changes.
- The complete runtime plan also contains unrelated drift (`5 add, 7 change, 2 destroy`), so it must not be applied as the incident repair.
- Production bootstrap now returns the expected `404 LIVE_OBSERVATION_COLLECTOR_NOT_FOUND` instead of `503`, proving the collector can reach Runtime Cache and distinguish a missing session.
- Production request `req-c2` was a local Git/CI/CD precondition conflict, not a duplicate GitHub resource: the target repository had no SketchCatch branch or PR, and project `0bdf56aa-68b7-4382-b37f-31d8996136c1` had no `project_deployment_targets` row.
- The CI/CD console now loads the project deployment target, blocks PR creation before POST when confirmation or the ECS output URL is missing, and links directly to project target settings.
- GitOps target conflicts expose stable precondition codes; mapped conflicts retain actionable Korean guidance and unknown conflicts use a neutral state-conflict message instead of the misleading duplicate-information message.
- `origin/dev` was fetched and merged into this branch on 2026-07-15; incoming dev state includes the fail-closed three-stage sandbox orchestration contract, standalone AWS SAM and CodeDeploy application units, application-local static install roots, generated artifact cleanup, Web clarity/accessibility, dashboard copy, ECS deployment speed, and Brainboard Template updates.
- This branch still carries the Repository ECS frontend diagram readability fix, including good-reference layout criteria, strict template preservation, support-lane separation, and saved DiagramJson restore normalization.
- Static, Lambda, EC2/ASG, rollback drills, QR public session, and Web Push provider delivery remain incomplete and must not be reported as passing.
- Incoming cleanup evidence records no remaining cost-bearing Issue #378 resources; no Terraform Apply/Destroy, deployment, Git handoff, or cloud mutation was performed during this code-integration pass.
- Repository Analysis now keeps evidence-anchored template priorities stable, provides detailed Korean recommendation copy and questions, and requires an inline project CI/CD connection before Architecture Draft creation.
- Branch `fix/ys/414-github-연동-로직-수정` keeps GitHub App repository authorization separate from GitHub OAuth login.
- The production infrastructure plan overlays `GIT_APP_CLIENT_ID` and the `GIT_APP_CLIENT_SECRET` ARN onto the existing runtime tfvars without replacing unrelated settings.
- The workflow rejects malformed Client IDs and Secret ARNs from another AWS region or account.
- `scripts/check-production-infra.mjs` guards the four GitHub App runtime wiring markers.

## Session Record

### 2026-07-17 - Add compact Direct Deployment execution progress

- Added a thin progress bar directly above Deployment Settings for Terraform Plan, Apply, Destroy Plan, and Destroy runs.
- Progress uses persisted deployment stages, elapsed stage time, Terraform log activity, Plan resource counts, and per-resource completion logs; it stays below 100% until the server records completion.
- Removed the requested shine animation. The bar uses only a smooth width transition and respects reduced-motion preferences.
- Verification: focused progress tests pass 6/6; workspace `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. Authenticated Chrome confirmed the existing Direct Deployment layout remains intact.
- No Terraform Plan, Apply, Destroy, deployment mutation, or cloud mutation was executed. The active visual state is covered by unit tests rather than a live cloud run.

### 2026-07-17 - Prevent false Terraform init timeouts during Deployment

- Confirmed in authenticated Chrome that the current Direct Deployment failed at initialization with `Terraform init timed out`.
- Deployment init, Plan, Apply, Destroy Plan, and Destroy now give `terraform init` the existing 15-minute deployment execution ceiling while preserving cancellation; startup cache warmup and non-deployment commands keep the 60-second default.
- Regression coverage asserts the init timeout on Plan, Apply, Destroy Plan, and Destroy paths.
- Verification: focused deployment service tests pass 32/32; workspace `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

### 2026-07-17 - Stream Direct Deployment logs while Terraform is running

- Authenticated Chrome reproduced zero visible log lines during Apply followed by 227 lines appearing only after success.
- Terraform runner output is now framed into complete lines, persisted in small live batches for Init, Plan, Apply, Destroy Plan, and Destroy, and deduplicated against the final buffered output.
- The log disclosure prefers the current deployment while a newer run differs from the selected successful history version.
- Verification: focused API live-output and deployment tests pass 33/33; focused Web history, flow, and progress tests pass 24/24. Full workspace checks are recorded before handoff.

### 2026-07-17 - Flush short Terraform output during long-running steps

- Confirmed the live writer withheld stdout until a five-line batch, leaving long-running init/apply phases with zero visible logs until completion.
- Added a 500ms flush for partial live batches and a focused regression test for fewer-than-five output lines.
- Verification: focused API Terraform/live-log tests pass 34/34; lint and typecheck pass. The full build was started but stopped after the user requested no further excessive verification.

### 2026-07-16 - Remove local herry612 project and AWS connection records

- Deleted all 26 local project records owned by `herry612` with their associated SketchCatch artifacts and deployment history; no active AWS resources were tracked by the deleted projects.
- Deleted all 6 AWS connection metadata records owned by the same user. The user account itself was retained.
- Verification query reports zero remaining projects and zero remaining AWS connections for `herry612`; project artifact cleanup reported zero failures.

### 2026-07-16 - Preserve actionable AWS connection failures during Deployment

- Direct Deployment credential preparation now preserves specific STS permission-denied and expired-caller errors instead of replacing them with the generic AWS Role connection failure.
- Focused runtime credential tests pass 2/2, targeted ESLint passes, and API typecheck passes.
- Local browser reproduction confirmed the configured SSO profile is valid but the stored execution Role rejects AssumeRole; legacy local caller profiles are invalid, so successful local Deployment still requires an approved Role trust/permission repair or renewed caller credentials.

### 2026-07-16 - Keep unchanged draft checkpoints from invalidating Deployment

- Project draft saves now return the existing draft without changing its revision or project timestamp when the diagram and Terraform files are unchanged.
- This prevents an automatic no-op checkpoint from making a completed Deployment look modified and incorrectly showing the save-required validation state.
- Verification: focused project draft and route tests passed 8/8; API lint, API typecheck, and `pnpm harness:check` passed.

### 2026-07-16 - Keep the final Apply control beside the latest result

- Removed the duplicate Deploy review entry point in Stage 3.
- The approved snapshot details stay in the main panel while Cancel and the final Deploy action now appear only above the latest deployment result.
- Verification: focused three-stage deployment tests passed 14/14; targeted Web lint and Web typecheck passed.

### 2026-07-16 - Restore the most recently completed Deployment step

- A persisted Plan now resumes Direct Deployment at Approval after the panel is reopened, even though the in-memory preflight state has reset.
- Recent deployment results now show the most recently completed step, including Plan creation, Plan approval, deployment execution, and cleanup execution.
- Verification: focused deployment console, presentation, and three-stage tests passed 39/39; targeted Web lint and Web typecheck passed.

### 2026-07-16 - Wire production GitHub App runtime inputs

- Added fail-closed GitHub Environment input validation and runtime tfvars overlay to the production infrastructure plan.
- Added static production-infrastructure markers for the GitHub App Client ID and Client Secret ARN wiring.
- Verification: `node scripts/check-production-infra.mjs`, `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` pass.
- Full `pnpm test` remains non-green only on the three pre-existing three-tier Template position, security-scope, and parent contract failures in `packages/types`.
- No workflow dispatch, Terraform apply, cloud mutation, push, or production deployment was performed.

### 2026-07-16 - Explain approved Plan revalidation after draft changes

- Direct Deployment now distinguishes a first validation from revalidation required after an approved Plan's prepared draft diverges.
- The workflow remains safely at validation for a changed draft, while the status, heading, and action explicitly say that the earlier approval must be revalidated.
- Verification: focused deployment console tests passed 31/31; targeted Web lint, Web typecheck, and `pnpm harness:check` passed.

### 2026-07-16 - Make AI parameter patch previews reviewable before apply

- Parameter-only AI patches no longer paint a diagram preview. The fixed confirmation surface now lists each target resource and exact before/after parameter value beside the explicit Apply action.
- CloudFront Origin Access Control signing-behavior requests now compile to `signingBehavior: always -> never` instead of adding an internal natural-language placeholder parameter.
- Verification: focused API and Web patch-preview tests pass; targeted API/Web lint and typecheck pass; Chrome confirmed the exact value and enabled Apply control without applying the proposed change.

## Next Action

- Review and merge `codex/fix-production-amazon-q-runtime`; run the production ECS deployment only after explicit approval.
- Review and apply the approved production Terraform change, then re-run the signed-in production browser loop to confirm the AWS Console launch link is rendered.
- Continue notification work separately from the completed repository diagram commit.
- Run local API DB migrations before testing deployment notifications locally.

### 2026-07-15 - Move Terraform Agent Review into AI Chat and harden Amazon Q delivery

- Moved the Agent Review action out of the Terraform toolbar and into a persistent footer in the AI Chat Agent Review tab; requests now use the latest complete Terraform file snapshot.
- Added the existing staged progress experience to the footer action state and kept the action available for retry after success or failure.
- Replaced the short-lived generic Next rewrite with a 115-second dedicated proxy route, forwarded request IDs, accepted sufficiently detailed three-sentence or longer Amazon Q reviews, normalized provider headings/newlines into one paragraph, and allowed longer valid conclusions.
- Added high-signal Terraform settings to the compact Amazon Q evidence payload so the review can distinguish configured controls from unverifiable ones.
- Chrome verification confirmed the only Agent Review button is at the bottom of AI Chat, staged progress is visible, and the full two-file Terraform review returns an Amazon Q result.

### 2026-07-15 - Make Agent Review status readable and retries real

- Agent Review now shows all six Well-Architected criteria with white, yellow, or red cards for normal, needs-review, or serious results; the summary is rebuilt from the clearest strengths and highest-priority problems, raw Terraform attributes are translated into plain Korean, and each card consistently presents `Problem / Required action` or `Strength / Confirmed setting` before omitting technical details and the trailing next-step section.
- Amazon Q must return an explicit severity marker for each ordered pillar, failed or invalid provider responses are no longer cached, and 503 messages distinguish authentication, timeout, rate-limit, configuration, invalid-response, and provider failures.
- The remaining 503 cause was a 2,006-character fenced Amazon Q JSON response truncated before valid JSON completion. Amazon Q output is now bounded to compact six-pillar highlights and a three-sentence conclusion, while useful plain text, partial JSON, and truncated fenced JSON are normalized with deterministic guidance instead of discarded.
- Verification: focused Web presentation tests passed 9/9, focused provider/validation tests passed 6/6, AWS STS and Q application read checks passed, `pnpm harness:check` passed, and a signed-in Chrome run returned a real Amazon Q review with a labeled summary, six concrete severity-colored criteria, no trailing next step, and no 503.

### 2026-07-16 - Repair Direct Deployment history and lifecycle controls

- Restored versioned successful deployment history, retained Destroy after reload, and kept Save and validate beside Destroy only when the draft has changed.
- Confirmed redeployments reuse the Terraform execution workspace so Plan/Apply performs incremental create, update, and delete operations.
- Made History select a single successful version, default to the latest successful deployment, and exclude failed attempts from deployable versions.
- Removed the idle Cancel action while preserving cancellation for running validation, Plan, Apply, and Destroy work.
- Rebuilt Deployment History around a version picker and selected-version summary card, aligned the non-sticky recent result with settings, moved compact horizontal actions above it, removed repeated disclosure headings, and matched History chrome to surrounding cards.
- Verification: focused Direct Deployment Web tests passed 13/13; Web typecheck and diff checks passed. Signed-in Chrome confirmed aligned columns, 157px/139px nowrap actions, and the subdued History card. No cloud deployment or destroy was executed.
- Push the branch only after explicit approval, then run the production runtime complete review-only plan and inspect it for unrelated updates or destroys before any apply.
