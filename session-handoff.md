# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/sw/371-project-deployment-release-ledger`; issue #371 is implemented and locally verified.
- A project owns one deployment target. Direct and GitOps releases share one RDS/API/History contract with deterministic version, SHA-256 digest, provider revision, Output URL, health, and rollback evidence.
- Legacy Deployment plan/apply remains compatible through explicit `infrastructure/direct` defaults and migration backfill.

## Verification

- #371 API focus passed 63/63 and Web passed 1,138/1,138.
- PostgreSQL 16 applied migrations 0000-0035 with `ON_ERROR_STOP=1`; migration compatibility passed.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed on 2026-07-14; run the final harness check after this handoff update.
- The only full API blockers are three unchanged Windows symlink fixture setup failures (`EPERM`).

## Changes This Session

- Added `project_deployment_targets`, `application_releases`, deployment linkage fields, and migration/backfill.
- Added target/release services, Zod/auth routes, project settings UI, and common Deployment History.
- Updated shared contracts, legacy fixtures/adapters, `docs/data-models.md`, and harness evidence.

## Broken Or Unverified

- Three unrelated API tests require Windows symlink privileges unavailable on this machine; they fail during fixture setup with `EPERM`, before product code executes.
- No Terraform Apply/Destroy, cloud mutation, deployment mutation, or production database migration was performed.

## Best Next Action

- Commit/push issue #371, open its PR, wait five minutes, resolve review/CI feedback, and merge to `dev`.
- Continue with issue #372 from refreshed `dev` without changing the RAG recommendation scope.
