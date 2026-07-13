# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/sw/376-static-gitops-release`; issue #376 is implemented and locally verified.
- Static GitOps requires one current analyzed output, a confirmed lockfile install preset, and complete S3/CloudFront coordinates.
- The generated workflow publishes a deterministic manifest under an immutable versioned prefix, switches the CloudFront origin path, and restores the previous pointer on failure.
- API reconciliation re-queries S3 manifest/object state, CloudFront distribution/origin state, and invalidation status before writing the shared release ledger.

## Verification

- Focused API contracts passed 107/107; source route 17/17, target state 10/10, and CI/CD layout 103/103 passed.
- PostgreSQL 16 applied migrations 0000-0040; migration compatibility and generated workflow bash syntax passed.
- Harness, lint, typecheck, build, and whitespace checks passed on 2026-07-14.
- Full Web and other workspace tests passed; API has only three unchanged Windows symlink fixture setup errors (`EPERM`).

## Changes This Session

- Added static analysis, target contracts and settings, migration/schema support, generated S3/CloudFront workflow, evidence parser, AWS re-query reconciler, and tests.
- Moved CI/CD branch/path editing into project settings and reduced the execution console to Activity and Logs.

## Broken Or Unverified

- Three unrelated filesystem security tests require Windows symlink privileges unavailable on this machine.
- No Terraform Apply/Destroy, AWS mutation, deployment mutation, or production database migration was performed.

## Best Next Action

- Commit/push issue #376, open its Korean PR, wait five minutes, resolve review/CI feedback, and merge to `dev`.
- Continue issue #377 from refreshed `dev` according to `docs/sw/spec2.md`, `docs/sw/plan2.md`, and `docs/sw/agents2.md`.
