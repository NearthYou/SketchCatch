# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- PR 1 / issue #434 is merged into `dev` at the PR 2 base `207a979f`.
- PR 2 / issue #433 implements a provider-neutral `ApplicationArtifact` Registry shared by Direct Deployment and GitOps while keeping `ApplicationRelease` as a separate ledger.
- Canonical identity includes repository, commit, normalized build config, build contract, target platform, and secret-free build inputs. Provider verification checks the actual ECR/S3 artifact before reuse.
- Project-scoped active uniqueness, hashed claim tokens, renewable leases, and the composite release foreign key prevent duplicate builds and cross-project reuse.
- Migration `0045_application_artifact_registry.sql` intentionally avoids the `0044` number reserved by another branch; `_journal.json` is updated.
- Focused PR 2 tests pass 55/55, including corrupt cache/claim/persistence boundaries. Harness, migration compatibility, lint, typecheck, and build pass.
- Clean-state review passes; the evaluator rubric result is Accept (12/12, no hard fail).

## Session Record

### 2026-07-16 - Implement ApplicationArtifact Registry v1

- Added all seven artifact kinds, strict v2 evidence DTOs, canonical identity, persistent Postgres claims, read-only AWS verification, and project-scoped artifact listing.
- Direct preparation reuses a verified artifact without CodeBuild; GitOps registers its already-built artifact and links verified releases while preserving v1 evidence fallback.
- RDS stores identity/metadata only. User artifact bytes stay in the user's ECR/S3 or provider storage; Redis is not a source of truth.
- Review hardening added locale-independent ordering, path normalization, whitespace-preserving build inputs, full identity checks, exact GitOps references, runtime namespace checks, lease heartbeats, and provider-computed S3 digest verification.
- No real credentials, live AWS mutation, Terraform apply/destroy, user deployment, or Git handoff were performed. PR 3 / issue #435 was not started.

## Broken Or Unverified

- `pnpm --filter @sketchcatch/api test` passes 666/669; three unchanged filesystem security tests cannot create symlinks on this Windows host and fail with `EPERM`.
- `pnpm test:core` stops on three pre-existing three-tier Template security-scope/position/parent assertions; PR 2 changes none of those Template files.
- A first API run hit a transient Fetch `bad port` in the unchanged notification SSE test because the host dynamic TCP range overlaps blocked ports. The isolated test and the second full API run passed it.
- Generated workflows remain v1 evidence producers; the parser and registrar accept both v1 and strict v2. No live provider acceptance test was run by design.

## Next Action

- Review and merge the Ready PR from `feature/sw/433-application-artifact-reuse` into `dev` after required CI.
- Start PR 3 / issue #435 only after PR 2 is merged.
