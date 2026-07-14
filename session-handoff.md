# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/gg/381-brainboard-aws-templates`.
- Latest `origin/dev` at `e322afd2` is merged; only harness state-file conflicts required manual combination.
- The branch contains 24 non-empty Brainboard AWS Templates plus the existing six deployable Templates.

## Changes This Session

- Preserved Brainboard source fixtures, Template catalog/detail creation, source-authoritative Terraform replacement, Board thumbnail capture/reload, fresh-project reset, and native Workspace brand navigation.
- Preserved latest dev Repository AI, deployment/release, Live Observation, notifications, authentication, and sandbox E2E behavior.
- Kept RDS read replicas separate from normal RDS defaults and prevented a fixed static-hosting Template from acquiring incompatible VPC or database additions after the dev merge.
- Applied both PR #393 Workspace Template CSS color-token reviews; harness, lint, typecheck, 14 focused Web tests, and diff checks pass.

## Broken Or Unverified

- No branch-authored DB migration exists. Migrations `0034` through `0041` arrived only from merged `dev`.
- `pnpm catalog:check` and template Terraform CLI validation require a local Terraform executable; none is installed or configured through `TF_CLI_PATH` or `TERRAFORM_BIN`.
- `pnpm build` stops before Web compilation because the ignored `apps/web/.codegraph` symlink targets a missing user-local path; it is a pre-existing local environment blocker.

## Best Next Action

- Commit and push, resolve both review threads, then merge PR #393 after CI passes.
