# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feature/sw/314-production-infra-terraform`.
- Active workstream: `ECS-MIGRATION-000`, issue #314.
- The existing ECS runtime root and backend key are preserved.
- Four production state groups have unique S3 backend keys and native lockfile configuration.
- Static guards, four backend-free Terraform init/validate runs, runtime Terraform tests, and full repository checks pass.
- No live AWS or remote Terraform operation has run.

## Changes This Session

- Added `infra/aws/production` with edge, data, and legacy rollback import-gate roots, backend examples, import manifest, and Korean runbook.
- Added a manual `production-infra-plan` workflow requiring group confirmation and GitHub Environment approval.
- Added a Node static checker for state groups, resource inventory, empty high-risk roots, and forbidden workflow operations.
- Raised the runtime Terraform minimum to 1.10 and protected the production Route53 record from destroy.
- Separated production infrastructure execution from product Deployment execution in canonical and docs/sw documents.

## Broken Or Unverified

- All requested local/static checks pass; live backend, state, and AWS ownership checks remain pending.
- Backend bucket controls, OIDC plan role, existing state membership, and live resource ownership are not verified.
- No import/resource blocks exist in edge/data/legacy roots by design.
- CloudFormation and EC2 rollback remain external owners/rollback dependencies.

## Best Next Action

- Complete final self-review, publish the PR, wait five minutes, resolve feedback, re-verify, and merge.
