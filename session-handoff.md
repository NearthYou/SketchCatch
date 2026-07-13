# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/sw/375-ec2-codedeploy-release`; issue #375 is implemented and locally verified.
- EC2/ASG GitOps handoff requires one current AppSpec and complete CodeDeploy, ASG, Output URL, and health-path coordinates.
- The generated workflow publishes an immutable versioned S3 bundle and restores the previous verified revision on CodeDeploy, instance, or health failure.
- API reconciliation re-queries CodeDeploy, S3, and ASG state before writing the shared release ledger.

## Verification

- Focused workflow/provider/reconciler tests passed 31/31.
- PostgreSQL 16 applied migrations 0000-0039; migration compatibility passed.
- Harness, lint, typecheck, build, and whitespace checks passed on 2026-07-14.
- Full Web and other workspace tests passed; API has only three unchanged Windows symlink fixture setup errors (`EPERM`).

## Changes This Session

- Added EC2/ASG runtime contracts and project target settings, migration/schema support, generated CodeDeploy workflow, evidence parser, AWS re-query reconciler, and tests.
- Updated deployment/data-model documentation and harness evidence.

## Broken Or Unverified

- Three unrelated filesystem security tests require Windows symlink privileges unavailable on this machine.
- No Terraform Apply/Destroy, AWS mutation, deployment mutation, or production database migration was performed.

## Best Next Action

- Commit/push issue #375, open its Korean PR, wait five minutes, resolve review/CI feedback, and merge to `dev`.
- Continue issue #376 from refreshed `dev` according to `docs/sw/spec2.md`, `docs/sw/plan2.md`, and `docs/sw/agents2.md`.
