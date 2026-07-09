# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feature/sw/290-ecs-secrets-config`.
- Active workstream: `ECS-MIGRATION-000`.
- Phase 3 issue: #290, `Feat: ECS 런타임 Secret 주입 구조 정리`.
- Phase 3 scope is code/docs only; do not run live AWS commands.
- `pnpm harness:check` passed before edits.
- `terraform -chdir=infra/aws/terraform fmt -check -recursive` passed.
- Static ECS workflow runtime config check passed.
- `terraform -chdir=infra/aws/terraform validate` passed.

## Changes This Session

- Added `.github/workflows/deploy-ecs.yml` validation for required API task secrets.
- Added Terraform validation that blocks sensitive API names from `api_environment`.
- Restricted `api_secret_arns` to approved ECS API secret names and Secrets Manager/SSM ARN formats.
- Added `infra/aws/terraform/runtime-config.tf`.
- Updated `infra/aws/terraform/README.md` and `docs/deployment.md` with ECS runtime config/secrets mapping and rollback guidance.

## Broken Or Unverified

- Full required checks still need to run: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- PR creation, review comment wait, comment resolution, and merge are still pending.
- Prior live smoke left ECS desired count at 1, which is cost-bearing outside this Phase 3 no-live-AWS scope.
- Prior live smoke added an RDS security group ingress rule manually; capture that drift in a later infrastructure follow-up.

## Best Next Action

- Run the required checks, update harness evidence, commit, push, open the Phase 3 PR to `dev`, wait for review comments, resolve any actionable comments, then merge.
