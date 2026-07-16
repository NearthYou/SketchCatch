# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Issue #448 is implemented on `feat/gg/448-ai-draft-progress-visualization`, based on the latest merged `dev` state in merge commit `45d7625e`.
- Only the new-project first Architecture Draft uses sequenced NDJSON full-state progress snapshots. Existing-project and Repository flows keep their JSON contracts.
- The right pane shows confirmed requirements, pending questions, a server-owned provisional graph, compact change history, pan/zoom, and server-authorized reversible exclusion. It exposes no Board mutation or apply/edit authority before the final Draft.
- Cancel, interruption, retry, exclusion/undo, clarification continuation, stale-request rejection, final diff/replacement, and compiler-failure retention preserve the last valid projection. Preparatory continuation snapshots do not blank the graph or synthesize history.
- Mobile uses `대화` / `진행 중인 초안` tabs at `<=720px`; final preview content is scroll-reachable and the 390px composer avoids the global notification control.
- Final whole-branch review is Ready with no remaining Critical, Important, or Minor findings. Focused API 79/79, focused Web 43/43, and the full Web suite 527/527 pass; harness, lint, typecheck, build, and `git diff --check` pass.

## Session Record

### 2026-07-17 - Implement live AI Draft progress preview (#448)

- Added shared progress/exclusion contracts, API snapshot streaming, strict NDJSON validation, caller abort propagation, and reverse-proxy no-buffering headers while preserving the existing JSON paths.
- Added the responsive progress pane, requirement/question summaries, provisional diagram, compact history, exclusion/undo, in-place cancel/retry, final transition diff, mobile pane tabs, and last-good projection retention.
- Direct browser QA passed at 1440x900, 1024x768, 390x844, and the 720/721 boundary: no horizontal overflow, mobile send/tab/final scrolling, desktop simultaneous panes, pan/zoom, clarification handoff, server-authorized exclusion and undo, retained retry state, final replacement, and reload non-persistence. The disposable local QA account and its active tokens were removed; `Board에 적용` was not used and no user project was created.
- Structured clarification answers now remain one confirmed `question: answer` fact, and provider-originated clarification emits a new full snapshot with the pending question before the terminal result.
- Passed focused API 79/79, focused Web 43/43, full Web 527/527, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Final whole-branch re-review is Ready with no findings.

### 2026-07-16 - Implement provider-verified Runtime Convergence v1

- Added provider-neutral shared targets, strict Zod DTOs, canonical target identity, nullable RDS release evidence, and legacy target reconstruction with fail-closed canonical/legacy consistency checks.
- Added a ten-adapter registry with current-state reads, provider/target and artifact comparison, rollout, health, rollback evidence, already-active decisions, and secret-shaped evidence rejection.
- Added adversarial regressions for cross-provider revisions, pre-provider stale target rejection, inactive ECS services, non-Fargate GitOps observations, unhealthy Lambda versions, GitOps region drift, v3 rollback evidence, and divergent handoff targets.
- Integrated Direct releases with read-only ECS/Fargate inspection, a DNS-pinned public HTTPS health probe, safe rollout fallback, and persisted convergence outcomes.
- Extended generated GitOps workflows and v3 evidence for ECS, Lambda, EC2 ASG, and Static S3/CloudFront. Mutations are skipped only after provider preflight and independently rechecked by reconcilers.
- Kept static artifact bytes target-independent by storing convergence markers on the CloudFront origin rather than in the artifact manifest.
- Added explicit coverage for all ten runtime adapters across deployable ResourceDefinitions and documented the contract, safety boundaries, compatibility behavior, and operational flow.
- No real credentials, live AWS mutation, Terraform apply/destroy, user artifact upload, or user Git/CI/CD handoff was performed.

### 2026-07-17 - Address PR #446 review feedback

- Kept missing ECS deployment configuration fail-closed, made every nested access explicit, and guarded unexpected DNS lookup result shapes before address processing.
- Converted malformed health URLs into Zod validation errors and malformed provider revision metadata into `provider_revision_unverified` rather than native runtime errors.
- Review regressions pass with the full focused runtime/resource/API set at 79/79. Harness, migration compatibility, lint, typecheck, build, and diff checks pass.

### 2026-07-16 - Implement ApplicationArtifact Registry v1

- Added all seven artifact kinds, strict v2 evidence DTOs, canonical identity, persistent Postgres claims, read-only AWS verification, and project-scoped artifact listing.
- Direct preparation reuses a verified artifact without CodeBuild; GitOps registers its already-built artifact and links verified releases while preserving v1 evidence fallback.
- RDS stores identity/metadata only. User artifact bytes stay in the user's ECR/S3 or provider storage; Redis is not a source of truth.
- Review hardening added locale-independent ordering, path normalization, whitespace-preserving build inputs, full identity checks, exact GitOps references, runtime namespace checks, lease heartbeats, and provider-computed S3 digest verification.
- No real credentials, live AWS mutation, Terraform apply/destroy, user deployment, or Git handoff were performed.

### 2026-07-16 - Address PR #438 review feedback

- Added fail-closed runtime build-input validation and normalized repeated key delimiters before secret-shape detection.
- Preferred async streaming over full-body buffering for S3 digest verification and stopped claim heartbeats immediately after renewal failure.
- Verified the four regressions red/green; focused PR 2 tests pass 59/59, and harness, lint, typecheck, and build pass.
- No migration, credential use, live AWS mutation, Terraform apply/destroy, or user deployment was added.

### 2026-07-16 - Production runtime plan drift review

- Review-only Plan 29498864502 succeeded with 3 add, 7 change, and only 2 task-definition replacement destroys. Worker Secret wiring and the Live Observation capability Secret preservation were added without exposing Secret values.
- Verification passed: harness, production infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check. Local Terraform validation/test could not initialize the uncached AWS provider within the timeout.

### 2026-07-16 - Follow up merged PR #439 review

- Scoped runtime Secret contract regexes to their Terraform set literals, selected the named worker container, and used `try(..., [])` for nullable Secret lists so unrelated markers cannot satisfy the checks.
- Passed harness, production infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check. Terraform validate/test remain blocked locally because AWS provider 6.54.0 is not cached; no Terraform or AWS mutation was performed.

### 2026-07-16 - Complete runtime Apply validator repair

- Corrected the jq resource-address escaping used by the complete runtime Apply guard and added a structural regression check for valid and invalid forms.
- Passed harness, production infrastructure structure check, Prettier, lint, typecheck, build, and diff check. Local Terraform validate/test could not initialize the AWS provider before the timeout; no Terraform apply or AWS mutation was performed.

### 2026-07-16 - Complete runtime deployment reconciliation

- Complete runtime Apply validation compares planned API and worker Secret references with Terraform state and verifies that the worker execution policy retains every existing secret reference.
- The API ECS service reconciles task definition changes while retaining autoscaling ownership of desired count.
- Synthetic jq checks passed for retained and intentionally removed Secret references; harness, structure check, formatting, lint, typecheck, build, and diff check passed.

### 2026-07-16 - Complete runtime policy and post-apply verification

- Complete runtime Apply validation reads the existing worker execution inline policy from state when Plan JSON masks prior policy data, then verifies every worker Task Definition Secret reference after Apply.
- Synthetic jq checks passed when prior permissions were retained and failed when a prior permission or Secret reference was removed; no Secret value was emitted.

### 2026-07-17 - Complete runtime post-apply task definition verification

- Plan JSON also masks the desired task definition payload, so the complete Apply guard verifies GitHub App runtime inputs in the applied API and worker task definitions from Terraform state.
- Synthetic jq checks passed with both required inputs and failed when the worker Client ID environment entry was removed.

### 2026-07-17 - Complete runtime partial-apply resume guard

- The first approved Apply partially completed the reviewed runtime plan, then stopped because the deploy role lacked ELB tag readback and task-definition deregistration authorization.
- The deploy-policy source now grants only those two missing actions, and the complete runtime guard accepts either the original full reviewed envelope or the exact residual envelope. No state operation, import, or unreviewed apply was used.
- Harness, production infrastructure structure check, Terraform formatting, lint, typecheck, and build pass. Local Terraform validate/test remain blocked by the uncached AWS provider package.

## Broken Or Unverified

- `pnpm test:core` does not terminate in the unchanged `apps/api/src/app.test.ts` logger-stream test. The isolated run passed 17 assertions with zero failures, then remained pending at `await once(stream, "finish")` and was interrupted after 31 seconds. Consequently root `pnpm test` was not continued into sandbox/Terraform suites.
- No real cloud apply, deployment, Git handoff, user project creation, or persistent QA account remains.

## Next Action

- Push and open the issue #448 PR when requested, then resolve only branch-owned review or CI findings before normal merge into `dev`.
