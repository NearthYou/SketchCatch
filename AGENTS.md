# AGENTS.md

This repository is SketchCatch.

SketchCatch is a Terraform-first IaC platform for safe AWS learning. It helps beginners design infrastructure visually, understand resource relationships, validate cost and security risks, manage IaC versions, and eventually deploy only explicitly approved practice environments with automatic cleanup.

## Product Direction

1. Treat SketchCatch as an IaC-based infrastructure creation, validation, deployment, versioning, and safety platform, not just a visual cloud diagram tool.
2. Terraform is the primary IaC target for product planning and implementation.
3. CloudFormation may be used as an AWS learning reference or future compatibility target, but it is not the default MVP direction.
4. Prefer beginner-safe AWS workflows, cost-accident prevention, explicit review, and time-limited practice environments.
5. Do not implement real AWS apply, deploy, update, delete, or destroy behavior unless the user explicitly asks for it in the current task.

## Required Reading

Before making changes, always read the nearest `AGENTS.md` and this root file. Read additional docs only when they are relevant:

- Read `docs/README.md` when working on documentation or when you need the document map.
- Read `docs/product.md` when changing product scope, MVP behavior, AI/IaC workflows, or safety policy.
- Read `docs/architecture.md` when changing stack, storage, API scope, deployment architecture, or ADR-level decisions.
- Read `docs/data-models.md` when changing DB models, API DTOs, shared types, or frontend state.
- Read `docs/development.md` when working with Git flow, code conventions, or required checks.
- Read `docs/deployment.md` when touching deployment, infrastructure, RDS, S3, or operations.

## Language Rules

1. Write `AGENTS.md` files in English.
2. Write regular project docs and user-facing explanations in Korean unless the user asks otherwise.
3. Keep code identifiers, commands, API paths, environment variable names, package names, and AWS service names in their original form.

## Repository Boundaries

1. Keep frontend code in `apps/web`.
2. Keep backend code in `apps/api`.
3. Keep shared domain types in `packages/types`.
4. Keep shared presentational UI in `packages/ui`.
5. Keep project data, architecture JSON, deployment records, and metadata in RDS.
6. Keep diagram images, IaC files, generated exports, thumbnails, and release artifacts in S3.
7. Do not mix Terraform generation, AWS SDK calls, deployment execution, or infrastructure mutation logic into UI components.
8. Future Terraform execution belongs in backend or worker code behind explicit safety gates.

## Safety Rules

1. Never commit secrets, `.env` files, private keys, AWS credentials, DB passwords, or real access tokens.
2. Never print secrets in logs, docs, tests, screenshots, or terminal output.
3. Use environment variables for runtime configuration.
4. Do not hardcode account-specific secrets or private infrastructure credentials.
5. If a command fails, report the failure clearly instead of pretending it passed.
6. Production deployment uses Docker, EC2, S3 release artifacts, RDS, GitHub Actions, SSM Run Command, `docker run`, and Nginx.
7. Production deployment does not use Docker Compose.

## Dependency And Lockfile Rules

1. Do not run install commands that rewrite `pnpm-lock.yaml` unless dependency metadata changed or the user asked for it.
2. If `package.json` changes, update and review `pnpm-lock.yaml`.
3. If `pnpm-lock.yaml` changes by more than the expected workspace/dependency entry, inspect the diff and report why.
4. Do not add runtime dependencies when a small local helper or existing package is enough.
5. Prefer the package manager version declared by the repository.

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
2. Apply SOLID as practical responsibility separation, not as over-engineering.
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
pnpm lint
pnpm typecheck
pnpm build
```

If local `pnpm` is not available, use Corepack or npm:

```bash
corepack pnpm lint
npm exec --package=pnpm@11.8.0 -- pnpm lint
```

For documentation-only changes, full build checks are optional unless package files, source code, or generated artifacts changed.

## Git And Review

1. Start normal work from `dev`.
2. Do not push directly to `main`.
3. Do not push directly to `dev` except for one-time repository administration or explicit user approval.
4. Use focused branches and PRs small enough to review.
5. Follow the Git and PR conventions in `docs/development.md`.
6. Before asking for review, summarize changed files, checks run, and any checks that could not be run.
