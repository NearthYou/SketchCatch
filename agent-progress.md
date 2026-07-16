# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- PR 1 / issue #434 and PR 2 / issue #433 are merged into `dev`. PR 3 / issue #435 started from merge commit `13716049532bcedc61d68e094bf829747077b989`, which contains reviewed PR 2 head `efdda2294830c9e8b4f8d863f280cc677daba61d`.
- Runtime Convergence v1 separates `artifactFingerprint` from project/account/region-scoped `deploymentTargetFingerprint` and models ten distinct ECS, EC2, EKS, Kubernetes, Lambda, and Static adapters.
- No-op requires read-only provider evidence for the canonical target, provider/account/region boundary, exact artifact fingerprint/digest/reference, and verified healthy state. Missing, mismatched, or unhealthy evidence falls back to rollout.
- Direct ECS/Fargate and generated GitOps ECS/Lambda/EC2 ASG/Static workflows use the contract. The remaining canonical adapters are isolated ports verified with test doubles and explicit ResourceDefinition coverage.
- Migration `0046_runtime_convergence.sql` is additive and `_journal.json` is updated after merged revision 0045.
- Focused runtime/resource/storage/integration regressions pass. Harness, migration compatibility, lint, typecheck, build, generated Bash/Python syntax, and `git diff --check` pass.
- Clean-state review and the evaluator rubric result are Accept (12/12, no hard fail).
- Production runtime validation on `dev` preserves GitHub App and Live Observation Secret wiring, rejects cross-account or cross-region ARNs, reconciles ECS task definitions, and checks post-apply worker execution-policy coverage without exposing Secret values.

## Session Record

### 2026-07-16 - Implement provider-verified Runtime Convergence v1

- Added provider-neutral shared targets, strict Zod DTOs, canonical target identity, nullable RDS release evidence, and legacy target reconstruction with fail-closed canonical/legacy consistency checks.
- Added a ten-adapter registry with current-state reads, provider/target and artifact comparison, rollout, health, rollback evidence, already-active decisions, and secret-shaped evidence rejection.
- Added adversarial regressions for cross-provider revisions, pre-provider stale target rejection, inactive ECS services, non-Fargate GitOps observations, unhealthy Lambda versions, GitOps region drift, v3 rollback evidence, and divergent handoff targets.
- Integrated Direct releases with read-only ECS/Fargate inspection, a DNS-pinned public HTTPS health probe, safe rollout fallback, and persisted convergence outcomes.
- Extended generated GitOps workflows and v3 evidence for ECS, Lambda, EC2 ASG, and Static S3/CloudFront. Mutations are skipped only after provider preflight and independently rechecked by reconcilers.
- Kept static artifact bytes target-independent by storing convergence markers on the CloudFront origin rather than in the artifact manifest.
- Added explicit coverage for all ten runtime adapters across deployable ResourceDefinitions and documented the contract, safety boundaries, compatibility behavior, and operational flow.
- No real credentials, live AWS mutation, Terraform apply/destroy, user artifact upload, or user Git/CI/CD handoff was performed.

### 2026-07-17 - Address PR #446 review feedback

- Kept missing ECS deployment configuration fail-closed, made every nested access explicit, and guarded unexpected DNS lookup result shapes before address processing.
- Converted malformed health URLs into Zod validation errors and malformed provider revision metadata into `provider_revision_unverified` rather than native runtime errors.
- Review regressions pass with the full focused runtime/resource/API set at 79/79. Harness, migration compatibility, lint, typecheck, build, and diff checks pass.

### 2026-07-16 - Implement ApplicationArtifact Registry v1

- Added all seven artifact kinds, strict v2 evidence DTOs, canonical identity, persistent Postgres claims, read-only AWS verification, and project-scoped artifact listing.
- Direct preparation reuses a verified artifact without CodeBuild; GitOps registers its already-built artifact and links verified releases while preserving v1 evidence fallback.
- RDS stores identity/metadata only. User artifact bytes stay in the user's ECR/S3 or provider storage; Redis is not a source of truth.
- Review hardening added locale-independent ordering, path normalization, whitespace-preserving build inputs, full identity checks, exact GitOps references, runtime namespace checks, lease heartbeats, and provider-computed S3 digest verification.
- No real credentials, live AWS mutation, Terraform apply/destroy, user deployment, or Git handoff were performed.

### 2026-07-16 - Address PR #438 review feedback

- Added fail-closed runtime build-input validation and normalized repeated key delimiters before secret-shape detection.
- Preferred async streaming over full-body buffering for S3 digest verification and stopped claim heartbeats immediately after renewal failure.
- Verified the four regressions red/green; focused PR 2 tests pass 59/59, and harness, lint, typecheck, and build pass.
- No migration, credential use, live AWS mutation, Terraform apply/destroy, or user deployment was added.

### 2026-07-16 - Production runtime plan drift review

- Review-only Plan 29498864502 succeeded with 3 add, 7 change, and only 2 task-definition replacement destroys. Worker Secret wiring and the Live Observation capability Secret preservation were added without exposing Secret values.
- Verification passed: harness, production infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check. Local Terraform validation/test could not initialize the uncached AWS provider within the timeout.

### 2026-07-16 - Follow up merged PR #439 review

- Scoped runtime Secret contract regexes to their Terraform set literals, selected the named worker container, and used `try(..., [])` for nullable Secret lists so unrelated markers cannot satisfy the checks.
- Passed harness, production infrastructure structure check, Terraform formatting, lint, typecheck, build, and diff check. Terraform validate/test remain blocked locally because AWS provider 6.54.0 is not cached; no Terraform or AWS mutation was performed.

### 2026-07-16 - Complete runtime Apply validator repair

- Corrected the jq resource-address escaping used by the complete runtime Apply guard and added a structural regression check for valid and invalid forms.
- Passed harness, production infrastructure structure check, Prettier, lint, typecheck, build, and diff check. Local Terraform validate/test could not initialize the AWS provider before the timeout; no Terraform apply or AWS mutation was performed.

### 2026-07-16 - Complete runtime deployment reconciliation

- Complete runtime Apply validation compares planned API and worker Secret references with Terraform state and verifies that the worker execution policy retains every existing secret reference.
- The API ECS service reconciles task definition changes while retaining autoscaling ownership of desired count.
- Synthetic jq checks passed for retained and intentionally removed Secret references; harness, structure check, formatting, lint, typecheck, build, and diff check passed.

### 2026-07-16 - Complete runtime policy and post-apply verification

- Complete runtime Apply validation reads the existing worker execution inline policy from state when Plan JSON masks prior policy data, then verifies every worker Task Definition Secret reference after Apply.
- Synthetic jq checks passed when prior permissions were retained and failed when a prior permission or Secret reference was removed; no Secret value was emitted.

### 2026-07-17 - Complete runtime post-apply task definition verification

- Plan JSON also masks the desired task definition payload, so the complete Apply guard verifies GitHub App runtime inputs in the applied API and worker task definitions from Terraform state.
- Synthetic jq checks passed with both required inputs and failed when the worker Client ID environment entry was removed.

### 2026-07-17 - Complete runtime partial-apply resume guard

- The first approved Apply partially completed the reviewed runtime plan, then stopped because the deploy role lacked ELB tag readback and task-definition deregistration authorization.
- The deploy-policy source now grants only those two missing actions, and the complete runtime guard accepts either the original full reviewed envelope or the exact residual envelope. No state operation, import, or unreviewed apply was used.
- Harness, production infrastructure structure check, Terraform formatting, lint, typecheck, and build pass. Local Terraform validate/test remain blocked by the uncached AWS provider package.

## Broken Or Unverified

- `pnpm test` stops in `@sketchcatch/types` at 40/43 on the same three pre-existing three-tier Template security-scope/position/parent assertions. This branch does not modify those Template sources or failing tests.
- `pnpm --filter @sketchcatch/api test` passes 710/713. The remaining three unchanged filesystem security tests fail during Windows symlink setup with `EPERM`, before their assertions.
- Generated AWS workflows were syntax-checked and provider behavior was exercised with test doubles only. Live AWS acceptance was intentionally not run.

## Next Action

- Monitor the Ready PR targeting `dev`, resolve any actionable review or branch-owned CI failure, and merge only through normal review.
