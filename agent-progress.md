# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `test/sw/378-complete-sandbox-e2e`; the workstream remains `in_progress` because Static, Lambda, EC2/ASG, rollback, QR, and Web Push sandbox acceptance are still unverified.
- The 2026-07-15 sandbox preflight passed against AWS account `614935468487`, the verified AWS Connection, the private fixture repository, and the approved USD 1 budget.
- Web Push now persists the successful provider HTTP status without response bodies or subscription material, and generated Destroy workflows remove Lambda, EC2/ASG, and Static versioned artifacts.
- ECS GitOps Infra run `29334708442` and chained App run `29334822683` succeeded for commit `3a12e55c13e7be1a769cfbe920b112516d8c14ce`.
- HTTPS `/health` returned 200 with the exact commit. ECR and persisted release digest `20ec77dba90b910f1a37fd1f9194b0ff4829f789d6548abf3b21262df04632e1` matched ECS task definition revision 7 and desired/running count 1/1.
- Project refresh now returns `stale=false`; Detect, Build, Artifact Publish, Plan, Apply, Deploy, and Verify are all persisted as succeeded with 1,161 masked CI log rows and no detected credential pattern.
- Application release `8025a2f3-455a-41bb-abbd-b8149105d004` and Pipeline Run `4defade1-18ca-437b-8cf6-3857b058353e` persist the GitOps SHA, digest, provider revision, Output URL, and healthy ECS evidence.
- The AWS Connection external ID was rotated in memory and verified with a fresh Operator session: the new value is accepted and the prior value is rejected. No value was printed or written to a file.
- Destroy run `29337235499` succeeded. Direct queries confirm zero VPC, active ECS cluster, ECR repository, CodeBuild project, log group, release/state bucket, OIDC provider, issue task definition, and issue IAM role. Resource Groups still has three delayed deleted-ECS tag index entries.
- After fast-forwarding to `origin/dev` at `2fe0296a`, 76 focused tests, harness, lint, typecheck, build, and diff checks pass.
- Static, Lambda, EC2/ASG, rollback drills, QR public session, and Web Push provider delivery remain incomplete and must not be reported as passing.

## Session Record

### 2026-07-15 - Move project source repository connection out of Settings

- Added `/dashboard/projects/:projectId/repository` as the dedicated project source repository surface and redirected the legacy `settings?tab=github` URL there.
- Removed repository selection and analysis from project Settings, preserved AWS deployment target and CI/CD monitoring settings, and separated global GitHub account permissions from project repository selection.
- Kept active repository details and analysis on the dedicated surface, collapsed replacement candidates by default, and required explicit confirmation before replacing an active repository.
- Verification passed: TDD red-green coverage, 127 focused Web tests, Web tests 1,333/1,333, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- Authenticated browser verification stopped at the login guard while preserving the requested return URL; no API, database, dependency, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-15 - Fix disconnected GitHub account CTA routing

- Traced the incorrect project Settings navigation to `GIT_APP_GITHUB_IDENTITY_REQUIRED` being classified by the broad `GIT_APP_*` permission-error rule.
- Classified the missing GitHub OAuth identity as an account-disconnected state, so CI/CD now renders the global `/dashboard/settings#github-account-settings-title` action while preserving project Settings for repository-level permission failures.
- Verification passed: TDD red-green regression, 17 focused CI/CD tests, Web tests 1,336/1,336, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Authenticated browser click verification was unavailable because the local Workspace redirected to login; no API, database, dependency, Git handoff, deployment, or cloud mutation was performed.

### 2026-07-15 - Fix oversized GitHub settings icons

- Reproduced the global GitHub settings layout with mocked authenticated browser data and traced the breakage to unconstrained custom `DashboardIcon` SVG dimensions.
- Bounded the GitHub settings header icon to 20px and the install action icon to 16px, preserving the existing account-scoped installation flow and responsive card layout.
- Verified a TDD red-green cycle, 9 focused Web tests, desktop 1440x900 and mobile 390x844 browser renders, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check`.
- No API tests, API/DB/dependency changes, Git handoff, deployment, or cloud mutation were performed.

### 2026-07-15 - Route disconnected CI/CD users to the correct GitHub settings

- Added an account-aware CI/CD empty state: users without a GitHub App installation go to global Settings, while connected accounts without an active project repository keep the project GitHub Settings action.
- Reused the global GitHub account settings section already rendered after the connected AWS accounts list; active project repositories keep the existing Pipeline Run console without an extra account lookup.
- Verification passed: focused CI/CD/Dashboard/Workspace/API tests 160/160, Web tests 1,331/1,331, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- No database migration, dependency, lockfile, GitHub installation, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-15 - Move GitHub App permissions to global settings

- Added account-scoped GitHub App installation listing and install callbacks without creating or changing project `SourceRepository` rows.
- Added the global `GitHub 계정 연결` section immediately below connected AWS accounts; project settings now keep only repository selection and analysis and link permission management to global settings.
- Verification passed: 39 focused API tests, 64 focused Web tests, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- Authenticated visual QA redirected to login, so the rendered settings body was not inspected; source placement coverage and the production build passed.
- No DB migration, dependency, lockfile, external GitHub permission change, deployment, or cloud mutation was performed.

### 2026-07-15 - Remove deployment run details from the modal

- Removed the `실행 세부정보` section, execution-record selector, refresh action, and the recent-result card's now-invalid details link.
- Removed the section-only failure explanation request/state and presentation helpers while preserving deployment selection, execution actions, release history, resources, outputs, logs, and all deployment mutation contracts.
- Focused Web tests passed 112/112 and `pnpm lint`, `pnpm harness:check`, and `git diff --check` passed. No API tests were run.
- `pnpm typecheck` and `pnpm build` remain blocked by the concurrent GitHub callback union handling errors in `apps/web/app/integrations/github/callback/page.tsx:62-63`; the deployment modal files reported no type or lint errors.
- No API, database, dependency, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-15 - Rebuild the Workspace deployment modal for operational clarity

- Reorganized the deployment modal into a bounded 1280px operational layout with a compact three-step flow, a 320px recent-result card, and a single-column fallback below 1200px.
- Added explicit deployment setting labels and help text, icon-and-text status badges, truthful recent validation/deployment results, localized execution details, and a normal-flow deployment history with a clear empty state.
- Preserved the existing deployment APIs, state, automatic verified AWS connection selection, and safety gates; the removed AWS selector and legacy context panel were not restored.
- Verification passed: Web tests 1,325/1,325, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Full API tests were intentionally not run because no API path changed.
- Authenticated visual QA could not reach the modal because the local Workspace route redirected to login; source-level responsive/accessibility coverage and production build passed.
- No API, database, dependency, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-15 - Open the deployment modal without a pre-save wait

- Changed the Workspace `배포` entry to open the deployment modal synchronously without waiting for project draft or Board thumbnail persistence.
- Removed the entry button's save-dependent pending state, spinner, and obsolete pre-open save failure toast; the visible label remains `배포`.
- Kept deployment safety in the modal: `저장 후 검증 실행` still synchronizes Terraform, saves the project draft, requires its revision, saves the Architecture/Terraform artifacts, and then runs validation.
- Verification passed through a focused TDD red-green cycle, Web tests 1,325/1,325, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check`.
- No API, database, dependency, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-15 - Simplify the Workspace deployment entry and validation layout

- Removed the AWS connection dropdown and the right-side deployment context panel, then expanded the remaining validation content to the full row.
- Kept the Workspace deployment button label fixed as `배포` while idle and pending, without removing the save-before-open safety flow.
- Kept the first verified AWS connection auto-selection and `awsConnectionId` deployment request contract unchanged.
- Verification passed: 121 focused Web tests, Web tests 1,319/1,319, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check`.
- No API, database, dependency, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-15 - Remove the Dashboard external connections band

- Removed the populated Dashboard's `외부 연결` band while preserving the `연결 상태` metric and the underlying AWS/Git connection workflows.
- Removed the unused connection icons and responsive CSS selectors, and added a focused source regression test.
- Verification passed: Web tests 1,317/1,317, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, and `git diff --check`.
- No API, database, dependency, deployment, Git handoff, or cloud mutation was performed.

### 2026-07-15 - Resolve Issue #360 branch conflicts with latest dev

- Merged `origin/dev` at `6f1558bf` while preserving the branch's Area sizing/reconciliation, render-safe history updates, parameter panel layout, and deployment Stepper changes.
- Preserved dev's Terraform source-authority invalidation, authored-edge route invalidation, Brainboard source geometry, and repository Template contracts.
- Excluded feature-session plan/spec and archived progress changes from the PR diff; canonical product/deployment documentation remains included where it describes shipped behavior.
- Verification passed focused API tests (109/109), focused Web conflict tests (214/214), the full Web suite (1,314/1,314), `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. The full API suite was stopped at the user's request after the relevant API coverage passed.
- No dependency, lockfile, DB migration, Terraform Apply/Destroy, deployment, or cloud mutation was performed.

### 2026-07-14 - ECS GitOps persistence, immediate replacement, and cleanup

- Made automated `push`/`workflow_run` authoritative over manual dispatch, isolated unavailable job logs, and preserved accepted nullable handoff provenance without PostgreSQL unknown-null parameters.
- Added remote S3 backend enforcement, Environment-gated plans, and a real ECS all-at-once scale-to-zero replacement with active rollback restoration.
- Fixed project refresh so obsolete release verification failures do not stale a newer verified release and actual chained workflow jobs override changed-file scope in stage history.
- Proved the final ECS release through GitHub, HTTPS, AWS, API, RDS, CI logs, and release history; then rotated the exposed external ID and removed all cost-bearing sandbox resources.

### 2026-07-14 - Production ECS deployment speed optimization merged from dev

- Preserved dev's parallel ECR-cached Buildx jobs, digest-only releases, stability preflight, rollback evidence, and deployment timing.
- Production run `29333857003` remains recorded as 6m09s with public health 200; read-only plan `29334381609` reported no infrastructure changes.
- This sandbox branch does not alter or re-claim the production optimization evidence.

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

- Open and babysit the `codex/ecs-deployment-speed` PR against `dev`, address CI/review feedback, and merge only after GitHub reports it ready.
- No production Terraform apply is required for this change set.
- If pursuing the 5m30s stretch target, profile the 1m28s validation job and 3m13s API service stabilization before changing safety thresholds.
- Continue issue #378 only on its dedicated branch; do not mix its sandbox matrix work into this release optimization branch.
