# AGENTS.md

This repository is SketchCatch.

SketchCatch is a multi-cloud-ready IaC operations service. It turns text or voice requirements, source repository evidence, and existing cloud state into provider-neutral Practice Architectures, then connects them to Terraform IaC Preview, Git/CI/CD Integration, Direct Deployment, Reverse Engineering, Deployment History, and Auto Cleanup. The MVP is AWS-first and Terraform-first, but SketchCatch must not be described as AWS-only.

## Product Direction

1. Treat SketchCatch as an IaC operations service, not just a visual cloud diagram tool or a demo script.
2. Terraform is the primary IaC target for the MVP and the extension point for future cloud providers.
3. AWS is the first Provider Adapter for the MVP. Keep the domain model provider-neutral.
4. The MVP journey is Requirement Input, Source Repository, or Reverse Engineering input -> Practice Architecture -> IaC Preview -> Pre-Deployment Check -> approved execution or Git/CI/CD handoff -> Deployment History and Auto Cleanup.
5. Demo journeys must prove the real service flow rather than define a separate demo-only scope.
6. Voice Requirement Input must be transcribed, shown back to the user, and confirmed before becoming a Requirement Prompt.
7. AI, Bedrock, and Amazon Q Assistance may recommend, explain, and review, but Practice Architecture changes, IaC handoff, Git changes, and deployment actions must be user-accepted changes.
8. SketchCatch supports two execution paths: Direct Deployment Path and Git/CI/CD Deployment Path.
9. Reverse Engineering must be provider-adapter based. The MVP can implement AWS first, but the concept is not AWS-only.
10. Redis is internal Runtime Cache infrastructure, not a user Practice Architecture Resource.
11. CloudFormation may be used as an AWS reference or future compatibility target, but it is not the default MVP direction.
12. Real cloud apply, deploy, update, delete, or destroy behavior is allowed only for explicit Deployment work or approved Git/CI/CD handoff with plan, approval, logging, secret masking, and cleanup safeguards.

## Required Reading

Before making changes, read this file and the nearest `AGENTS.md`. Read additional docs only when relevant:

- `docs/README.md` for documentation work or document navigation.
- `docs/product.md` for product scope, MVP behavior, AI/IaC workflows, roadmap, or safety policy.
- `docs/data-models.md` for DB models, API DTOs, shared types, frontend state, AI results, Terraform artifacts, or deployment contracts.
- `docs/architecture.md` for stack, storage, API scope, execution boundaries, deployment architecture, or ADR-level decisions.
- `docs/development.md` for Git flow, code conventions, team AI collaboration, PR checks, or required checks.
- `docs/deployment.md` for operational deployment, Terraform Plan/Apply/Destroy, AWS credentials, RDS, S3, logs, outputs, or cleanup.

## Harness Operating Loop

1. For every non-trivial work session, run `pnpm harness:check` before editing files. If `pnpm` is unavailable, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1`.
2. After the harness check, read `agent-progress.md` and `feature_list.json`. Read `session-handoff.md` only when the task continues prior work, the handoff says there is active continuation context, or unfinished risk is relevant to the task. Read archived progress under `docs/agent-history/` only when older evidence is explicitly needed.
3. Use `scripts/init-harness.ps1` as the standard startup helper. Run it without flags for a lightweight baseline, with `-Verify` for lint/typecheck, and with `-Full` before finishing substantial code or infrastructure changes.
4. Keep `feature_list.json` as the machine-readable harness tracker. Product scope belongs in `docs/product.md`; shared contracts belong in `docs/data-models.md`.
5. Work on at most one active feature/workstream at a time. Do not leave more than one `in_progress` item in `feature_list.json`.
6. Do not mark a feature `passing` unless `evidence.lastVerified` and concrete verification commands are recorded.
7. Keep `agent-progress.md` and `session-handoff.md` concise. If `agent-progress.md` is getting large, move old records to `docs/agent-history/YYYY-MM.md` before adding new entries.
8. Before finishing, run `pnpm harness:check` again and apply `clean-state-checklist.md`. Update `agent-progress.md` with completed work, verification, known risks, and next action. Update `session-handoff.md` only when the next session needs a compressed continuation point.
9. Use `evaluator-rubric.md` for adversarial self-review when a change affects safety, deployment, contracts, or multi-session continuity.

## Language Rules

1. Write `AGENTS.md` files in English.
2. Write `agent-progress.md` and `session-handoff.md` in English only, and keep them concise.
3. Write regular project docs and user-facing explanations in Korean unless the user asks otherwise.
4. Keep code identifiers, commands, API paths, environment variable names, package names, and AWS service names in their original form.
5. Write Pull Request titles and bodies in Korean unless the user explicitly asks for another language.
6. Write Pull Request titles in the `Type: Korean title` format, such as `Feat: 로그인 기능 구현`.

## Repository Boundaries

1. Keep frontend code in `apps/web`.
2. Keep backend code in `apps/api`.
3. Keep shared domain types in `packages/types`.
4. Keep shared presentational UI in `packages/ui`.
5. Keep project data, architecture JSON, deployment records, and metadata in RDS.
6. Keep diagram images, IaC files, generated exports, thumbnails, and release artifacts in S3.
7. Do not mix Terraform generation, AWS SDK calls, deployment execution, or infrastructure mutation logic into UI components.
8. Terraform execution belongs in backend or worker code behind explicit safety gates.

## Safety Rules

1. Never commit secrets, `.env` files, private keys, AWS credentials, DB passwords, or real access tokens.
2. Never print secrets in logs, docs, tests, screenshots, or terminal output.
3. Use environment variables for runtime configuration.
4. Do not hardcode account-specific secrets or private infrastructure credentials.
5. If a command fails, report the failure clearly instead of pretending it passed.
6. Production steady state uses Docker, ECR, ECS/Fargate, ALB, RDS, and GitHub Actions. Warm EC2/SSM/Nginx rollback infrastructure is retired; recovery uses reviewed cold artifacts and an opt-in Terraform runbook.
7. Production deployment does not use Docker Compose.
8. SketchCatch production infrastructure Terraform uses operator-approved state and workflows that are separate from user Deployment execution.

## Dependency And Lockfile Rules

1. Do not run install commands that rewrite `pnpm-lock.yaml` unless dependency metadata changed or the user asked for it.
2. If `package.json` changes, update and review `pnpm-lock.yaml`.
3. If `pnpm-lock.yaml` changes by more than the expected workspace/dependency entry, inspect the diff and report why.
4. Do not add runtime dependencies when a small local helper or existing package is enough.
5. Prefer the package manager version declared by the repository.

## DB Migration Coordination

Five contributors can work on separate branches at the same time, so Drizzle migration numbers can collide before the branches meet. Migration reporting is a coordination signal to the other contributors, not a generic notice that migration files exist in the worktree.

1. Apply this rule only when the current Codex itself decides that its work requires a migration or directly creates, edits, deletes, renames, renumbers, or resolves a numbering conflict in `apps/api/drizzle/**`, including `apps/api/drizzle/meta/**`.
2. Before choosing a migration number or making that migration change, immediately notify the user with a visible `🚨 DB MIGRATION` warning. Include the intended change, the latest migration number checked, and the collision risk so the other active branches can coordinate before using the same number.
3. Repeat the migration warning at the very top of the final response, before the normal summary. List the files and whether `_journal.json` changed.
4. Do not emit the warning merely because migration files already exist, belong to the user or another worker, or arrived only by merging or rebasing `dev` into the current branch.
5. If the current Codex changes an imported migration to resolve a conflict, it has taken ownership of that migration change and must emit both the immediate and final warnings.

## Feature Work Flow

When adding or changing behavior, proceed in this order:

1. Check or update shared types in `packages/types`.
2. Check API DTO and Zod validation in `apps/api`.
3. Check the RDS/S3 storage boundary.
4. Connect frontend state and UI in `apps/web`.
5. Run relevant checks and report any failures.

For model, API, or state changes, `docs/data-models.md` is the naming source of truth.

## Code Quality

1. Prefer readable, human-editable code over clever code.
2. Apply SOLID as practical responsibility separation, not over-engineering.
3. Keep functions, components, services, and modules small enough to understand quickly.
4. Use clear names that reveal intent.
5. Follow existing local patterns before introducing new abstractions.
6. Extract meaningful duplication into helpers, hooks, services, or modules after the pattern is real.
7. Keep route handlers and UI components thin when logic starts to grow.
8. Prefer testable structure: pure helpers, explicit inputs, and isolated side effects.
9. Avoid unnecessary comments; add comments only when they explain non-obvious intent or constraints.
10. Remove unused code instead of leaving dead branches.

## Required Checks Before Finishing

Run these before finishing code or infrastructure changes:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

For documentation-only changes, full build checks are optional unless package files, source code, or generated artifacts changed.

## Git And Review

1. Start normal work from `dev`.
2. Do not push directly to `main`.
3. Do not push directly to `dev` except for one-time repository administration or explicit user approval.
4. Use focused branches and PRs small enough to review.
5. Write Pull Request titles in the `Type: Korean title` format.
6. Write Pull Request bodies in Korean unless the user explicitly asks for another language.
7. Follow the Git and PR conventions in `docs/development.md`.
8. Before asking for review, summarize changed files, checks run, and any checks that could not be run.
