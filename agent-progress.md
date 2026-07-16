# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch `fix/ys/414-github-연동-로직-수정` keeps GitHub App repository authorization separate from GitHub OAuth login.
- The production infrastructure plan overlays `GIT_APP_CLIENT_ID` and the `GIT_APP_CLIENT_SECRET` ARN onto the existing runtime tfvars without replacing unrelated settings; the runtime tfvars owner must retain the Live Observation capability Secret ARN before a complete runtime review plan.
- The workflow rejects malformed Client IDs and Secret ARNs from another AWS region or account.
- `scripts/check-production-infra.mjs` guards the four GitHub App runtime wiring markers.

## Session Record

### 2026-07-16 - Wire production GitHub App runtime inputs

- Added fail-closed GitHub Environment input validation and runtime tfvars overlay to the production infrastructure plan.
- Added static production-infrastructure markers for the GitHub App Client ID and Client Secret ARN wiring.
- Verification: `node scripts/check-production-infra.mjs`, `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` pass.
- Full `pnpm test` remains non-green only on the three pre-existing three-tier Template position, security-scope, and parent contract failures in `packages/types`.
- No workflow dispatch, Terraform apply, cloud mutation, push, or production deployment was performed.

### 2026-07-16 - Production runtime plan drift review

- Blocked Apply after review-only run 29479563543: the worker task definition did not receive `GIT_APP_CLIENT_SECRET`, and the complete runtime input would remove the existing Live Observation capability Secret ARN.
- Added worker Secret wiring, a fail-closed worker precondition, and source/Terraform contract coverage that preserves the capability Secret requirement.
- Added a dedicated production-infra-plan Environment Secret for the existing Live Observation capability ARN and overlay it into the runtime tfvars without replacing the opaque runtime JSON.
- Final review-only run 29498864502 succeeded with 3 add, 7 change, and 2 task-definition replacement destroys. The API execution policy no longer removes the capability Secret; the worker execution policy adds the GitHub App Secret. Apply remains unapproved because unrelated ALB, CORS, and observability changes share the Plan.
- Verification: harness, production-infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check pass. Terraform validate/test could not initialize the uncached AWS provider within the local timeout.

## Next Action

- Review and merge the drift-review PR. Do not Apply the combined runtime Plan until the unrelated ALB, CORS, and observability changes have their own approval and the masked task-definition image identity has been read-only verified.
