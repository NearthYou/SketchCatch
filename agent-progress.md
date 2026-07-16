# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- PR 1 / issue #434 is merged into `dev` at the PR 2 base `207a979f`.
- PR 2 / issue #433 implements a provider-neutral `ApplicationArtifact` Registry shared by Direct Deployment and GitOps while keeping `ApplicationRelease` as a separate ledger.
- Canonical identity includes repository, commit, normalized build config, build contract, target platform, and secret-free build inputs. Provider verification checks the actual ECR/S3 artifact before reuse.
- Project-scoped active uniqueness, hashed claim tokens, renewable leases, and the composite release foreign key prevent duplicate builds and cross-project reuse.
- Migration `0045_application_artifact_registry.sql` intentionally avoids the `0044` number reserved by another branch; `_journal.json` is updated.
- Focused PR 2 tests pass 59/59, including review regressions for malformed/secret-shaped inputs, streamed S3 hashing, and failed lease renewal cleanup. Harness, migration compatibility, lint, typecheck, and build pass.
- Clean-state review passes; the evaluator rubric result is Accept (12/12, no hard fail).
- Branch `fix/sw/production-runtime-plan-drift` overlays GitHub App runtime inputs without replacing unrelated runtime tfvars; the Live Observation capability Secret ARN is retained through its dedicated Environment Secret.
- The workflow rejects malformed GitHub App inputs and Secret ARNs from another AWS region or account.
- `scripts/check-production-infra.mjs` guards the GitHub App and Live Observation runtime wiring markers.

## Session Record

### 2026-07-16 - Implement ApplicationArtifact Registry v1

- Added all seven artifact kinds, strict v2 evidence DTOs, canonical identity, persistent Postgres claims, read-only AWS verification, and project-scoped artifact listing.
- Direct preparation reuses a verified artifact without CodeBuild; GitOps registers its already-built artifact and links verified releases while preserving v1 evidence fallback.
- RDS stores identity/metadata only. User artifact bytes stay in the user's ECR/S3 or provider storage; Redis is not a source of truth.
- Review hardening added locale-independent ordering, path normalization, whitespace-preserving build inputs, full identity checks, exact GitOps references, runtime namespace checks, lease heartbeats, and provider-computed S3 digest verification.
- No real credentials, live AWS mutation, Terraform apply/destroy, user deployment, or Git handoff were performed. PR 3 / issue #435 was not started.

### 2026-07-16 - Address PR #438 review feedback

- Added fail-closed runtime build-input validation and normalized repeated key delimiters before secret-shape detection.
- Preferred async streaming over full-body buffering for S3 digest verification and stopped claim heartbeats immediately after renewal failure.
- Verified the four regressions red/green; focused PR 2 tests pass 59/59, and harness, lint, typecheck, and build pass.
- No migration, credential use, live AWS mutation, Terraform apply/destroy, or user deployment was added.

## Broken Or Unverified

- `pnpm --filter @sketchcatch/api test` passes 666/669; three unchanged filesystem security tests cannot create symlinks on this Windows host and fail with `EPERM`.
- `pnpm test:core` stops on three pre-existing three-tier Template security-scope/position/parent assertions; PR 2 changes none of those Template files.
- A first API run hit a transient Fetch `bad port` in the unchanged notification SSE test because the host dynamic TCP range overlaps blocked ports. The isolated test and the second full API run passed it.
- Generated workflows remain v1 evidence producers; the parser and registrar accept both v1 and strict v2. No live provider acceptance test was run by design.

## Next Action

- Review and merge the Ready PR from `feature/sw/433-application-artifact-reuse` into `dev` after required CI.
- Start PR 3 / issue #435 only after PR 2 is merged.
- Merge the production runtime drift-review PR after its refreshed review-only Plan passes, then use the approved full-runtime Apply workflow for the exact merged revision.

### 2026-07-16 - Production runtime plan drift review

- Review-only Plan 29498864502 succeeded with 3 add, 7 change, and only 2 task-definition replacement destroys. Worker Secret wiring and the Live Observation capability Secret preservation were added without exposing Secret values.
- Verification passed: harness, production infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check. Local Terraform validation/test could not initialize the uncached AWS provider within the timeout.

### 2026-07-16 - Follow up merged PR #439 review

- Scoped runtime Secret contract regexes to their Terraform set literals, so an unrelated later marker cannot satisfy the checks.
- Made the worker Secret assertion select the named worker container and removed an unnecessary set-to-list conversion.
- Passed harness, production infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check. Terraform validate/test remain blocked locally because AWS provider 6.54.0 is not cached; no Terraform or AWS mutation was performed.
- Follow-up review handling uses `try(..., [])` for nullable worker container Secret lists, preventing Terraform test evaluation errors before the intended assertion runs.

### 2026-07-16 - Complete runtime Apply validator repair

- Corrected the jq resource-address escaping used by the complete runtime Apply guard and added a structural regression check for the valid and invalid forms.
- Passed harness, production infrastructure structure check, Prettier, lint, typecheck, build, and diff check. Local Terraform validate/test could not initialize the AWS provider before the timeout; no Terraform apply or AWS mutation was performed by this repair.

### 2026-07-16 - Complete runtime deployment reconciliation

- Complete runtime Apply validation now compares planned API and worker Secret references with the Terraform state rather than nullable plan `before` data, and verifies the worker execution policy retains every existing secret reference.
- The API ECS service now reconciles task definition changes while retaining autoscaling ownership of desired count, so the active service rolls from manual revision drift to the reviewed task definition.
- Synthetic jq checks passed for retained and intentionally removed Secret references; harness, structure check, formatting, lint, typecheck, build, and diff check passed. Terraform validate/test remain blocked locally by the unavailable AWS provider cache.

### 2026-07-16 - Complete runtime policy state validation

- Complete runtime Apply validation now obtains the existing worker execution inline policy from Terraform state when Plan JSON masks its previous policy as null.
- Synthetic jq checks passed when prior permissions were retained and failed when a prior permission was removed; no Secret value was emitted.
- Harness, structure check, formatting, lint, typecheck, build, and diff check passed. Terraform validate/test remain blocked locally by the unavailable AWS provider cache.

### 2026-07-16 - Complete runtime post-apply policy verification

- Plan JSON masks the desired inline policy, so the complete Apply guard now verifies all worker Task Definition Secret references are present in the worker execution policy immediately after Apply using Terraform state.
- Synthetic jq checks passed when every worker Secret reference was present and failed when the GitHub App reference was removed.
