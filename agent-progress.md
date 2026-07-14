# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- The automated suite now retains 47 essential protection test files out of the previous 390: API auth/ownership, schema/migration contracts, project persistence/deletion, Terraform generation/sync, Deployment Safety Gate, approval/apply/destroy, Web deployment actions, shared types, sandbox preflight evidence, and the production Terraform route test.
- The maintained `pnpm test` protection line passes 511 checks: API 409, Web 71, shared types 8, sandbox preflight/evidence 21, and Terraform routing 2. Migration compatibility, lint, typecheck, build, harness, and diff checks pass.
- Branch: `codex/reduce-test-protection-line`; this focused test-reduction change is verified locally and not yet pushed.
- The test reduction changed no runtime code, database migration, cloud resource, or deployment state.
- Issue #378 is recorded as `blocked` and remains a separate workstream for its dedicated branch.

## Session Record

### 2026-07-15 - Reduce tests to the essential protection line

- Removed 343 non-core test files and retained 47 explicitly reviewed safety and core-workflow test files.
- Added the retained Web component test, shared type contracts, sandbox preflight/evidence test, and Terraform routing test to the normal `pnpm test` path; the lockfile changed only for the existing `tsx` test runner in `packages/types`.
- Removed stale deleted-test references from active deployment and asset documentation, and recorded the new protection-line policy in `feature_list.json` while preserving older feature evidence as historical audit records.
- Verification: reduced `pnpm test` passed 511 checks across all 47 retained files, and migration compatibility, lint, typecheck, build, harness, and diff checks passed.
- Risk: AI Architecture, GitOps runtime reconcilers, Reverse Engineering, Cost, Live Observation, notifications, detailed diagram editing, Templates, and presentation behavior no longer have their previous dedicated regression suites.

### 2026-07-14 - Production ECS deployment speed optimization

- Parallelized API/web image jobs, added ECR registry cache, digest-only releases, pre-deploy stability evidence, and per-phase timing.
- Reduced Docker build contexts with filtered workspace installs and added the same remote-cache behavior to generated ECS/Fargate CodeBuild workflows.
- Tuned and verified ALB/ECS health timing without weakening minimum healthy percent or circuit-breaker rollback.
- Completed one real production release and post-deploy health smoke; the total improved from the 7m51s baseline to 6m09s, while the 5m30s stretch target remains unmet.

### 2026-07-14 - Real Direct ECS and bounded GitOps validation

- Completed a real Direct ECS infrastructure/app release with immutable commit, digest, task revision, persisted API logs/history/notifications, CloudWatch metrics, and repeated HTTPS 200 evidence.
- Fixed practice-profile ECS resource admission, minimal CodeBuild permissions, Bash buildspec execution, and invalid GitHub expression quoting with focused regression tests.
- Created and merged real sandbox GitOps PRs, applied repository variables and verified GitHub OIDC trust, and completed one real ECS GitHub Actions deployment.
- Preserved fail-closed behavior for QR, CI persistence, and cleanup mismatches instead of marking partial evidence as complete.

### 2026-07-14 - Integrate latest dev for sandbox continuation

- Merged `origin/dev` at `847a8206` into the Issue #378 worktree and preserved the sandbox recovery behavior.
- Resolved only `agent-progress.md` and `session-handoff.md`; current Issue #378 evidence remains the active state and unrelated dev session records remain archived.
- Focused merged-path verification passed: 30 API deployment/AWS connection tests and 23 Web deployment action tests.

### 2026-07-14 - Live sandbox Direct execution and recovery hardening

- Fixed invalid StepScaling `cooldown`, preserved cleanup-capable apply/destroy failure stages after destroy-plan errors, and added one bounded re-login retry for long-running smoke requests.
- Added explicit scope evidence and a 10-second sandbox target-group deregistration delay; focused tests and Terraform safety validation pass.
- Recovered and destroyed a partial failed apply, then completed all three labeled Direct runs and verified provider cleanup.
- Did not claim application release acceptance: `application_releases` remained empty after successful application/full-stack Terraform runs.
- GitOps four-runtime, rollback, QR session, Web Push provider delivery, and final combined report remain blocked on an installed GitHub App and on the missing Direct application release execution path.

### 2026-07-14 - Project deployment sandbox E2E gate

- Added a fail-closed CLI that compares local AWS STS identity with the approved account and the sandbox API's live verified AWS Connection account/region.
- Denied production AWS/API/GitHub targets and required explicit mutation approval, cleanup ownership, and a positive budget.
- Added strict evidence correlation for Direct three-scope and GitOps four-runtime completion, CI/release/Output identity, per-runtime rollback, QR/CloudWatch, Inbox/Web Push, Destroy, and ECR/S3/CodeBuild/CloudWatch cleanup.
- Verification passed 18 focused tests, lint, typecheck, build, and harness. Live preflight later passed with the approved sandbox configuration.

### 2026-07-14 - Complete Web UI clarity and accessibility improvements

- Clarified landing and authentication actions, added accessible password and legal-dialog interactions, and unified signup readiness and availability behavior.
- Raised user-facing Web text to at least 12px, strengthened muted text contrast, and added a recursive CSS regression test that covers pixel, decimal, relative, `calc`, and `clamp` values with documented shape-exception rules.
- Cancelled availability checks as soon as username or email input changes, and announced graphical overflow counts through the Live Observation map label.
- Verified public, dashboard, workspace entry, Architecture Board, Terraform, Reverse Engineering, and Template surfaces at 1440x900 and 390x844 with a local QA account that has no AWS, GitHub, or deployment privileges.
- Verification: Web tests passed 1,205/1,205 outside the restricted runner after its `spawn EPERM`; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk: authenticated visual QA used fixture and disconnected states only; no cloud, deployment, Git handoff, or database mutation was performed.

### 2026-07-14 - Localize dashboard navigation and remove redundant overview copy

- Renamed the dashboard navigation to the requested Korean labels and reduced the top bar to the localized page title.
- Removed redundant overview eyebrows, explanatory filler, metric details, and empty project-description placeholders while preserving operational status data.
- Verified the authenticated dashboard at 1440x900 and 390x844 with no horizontal overflow, clipping, or unintended navigation wrapping.
- Verification: 10 focused dashboard tests, Web tests 1,207/1,207, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk: visual QA used a new local account with no projects or external connections; populated overview behavior is covered by focused source and data tests.

### 2026-07-14 - Simplify dashboard page headings

- Replaced redundant English eyebrows and introduction copy on Templates, Costs, Projects, and Settings with the requested Korean page titles.
- Verified all four authenticated routes at 1440x900 and 390x844 with no horizontal overflow, clipping, or unintended wrapping.
- Verification: 17 focused tests and Web tests 1,211/1,211 passed; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check` passed.
- Risk: visual QA used an account without external connections; no API, database, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-14 - Merge latest dev into the Brainboard AWS Template branch

- Merged `origin/dev` at `e322afd2` into `feature/gg/381-brainboard-aws-templates` before PR completion without dropping either workstream.
- Preserved the branch's 24 Brainboard source fixtures, source-exact Board geometry, Terraform authority and refresh rules, repository Template ID boundary, Template start flow, Project Board thumbnails, Dashboard card improvements, and Workspace navigation fixes.
- Preserved dev's Repository AI, deployment/release, Live Observation, notification, authentication, and sandbox E2E updates.
- Verification passed: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm migration:compatibility:check`, 114 focused API tests, 1,266 Web tests, 60 Brainboard type/source-contract tests, 37 capture tests, and `git diff --check`.
- Known environment limit: `pnpm catalog:check` and `pnpm templates:validate` cannot run Terraform because this machine has no Terraform executable (`spawn terraform ENOENT`). No Terraform Apply, Destroy, or AWS mutation was performed.
- Final build result: `pnpm build` stops before Web compilation because the ignored `apps/web/.codegraph` symlink targets a missing user-local path. Type/API/UI builds started successfully; this is the documented pre-existing local blocker.
- Applied both PR #393 Workspace Template color-token reviews after merging `origin/dev` at `e322afd2`; harness, lint, typecheck, 14 focused Web tests, and diff checks pass.
- Next: commit and push, resolve both review threads, wait for CI, and merge PR #393.

## Next Action

- No continuation is required for the completed test reduction after this branch is reviewed.
- Resume Issue #378 only on its dedicated branch after its recorded blockers can be addressed.
- Add future automated coverage only through an explicit update to the essential protection-line policy.
