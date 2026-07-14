# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/gg/381-brainboard-aws-templates`.
- Latest `origin/dev` at `847a8206` is merged; all 16 content conflicts were resolved by preserving both branch and dev behavior.
- The branch contains 24 non-empty Brainboard AWS Templates plus the existing six deployable Templates.

## Changes This Session

- Preserved Brainboard source fixtures, Template catalog/detail creation, source-authoritative Terraform replacement, Board thumbnail capture/reload, fresh-project reset, and native Workspace brand navigation.
- Preserved latest dev Repository AI evidence, prepared deployment revisions, Terraform output preservation, Save and Deploy, release, Live Observation, notifications, and authentication behavior.
- Kept RDS read replicas separate from normal RDS defaults and prevented a fixed static-hosting Template from acquiring incompatible VPC or database additions after the dev merge.

## Broken Or Unverified

- No branch-authored DB migration exists. Migrations `0034` through `0041` arrived only from merged `dev`.
- `pnpm catalog:check` and template Terraform CLI validation require a local Terraform executable; none is installed or configured through `TF_CLI_PATH` or `TERRAFORM_BIN`.
- A complete production build still needs its final post-merge run.

## Best Next Action

- Complete final checks, commit and push the merge, then open the issue #381 PR against `dev` with the full cross-cutting change list and known Terraform CLI limitation.
