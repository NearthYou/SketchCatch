# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State

- Release PR: #319, dev to main, targeting v2.0.0.
- Active workstream: ECS-MIGRATION-000, production cutover and worker isolation.
- Production Route53 points to the split ECS ALB.
- API, web, and protected legacy ECS services are healthy; public smoke passes through ECS.
- ECS one-off worker dispatch is enabled and a worker-network migration smoke exited successfully.
- The EC2/SSM/nginx path remains available only for explicit rollback.

## Session Record

### 2026-07-10 - Stage the production split and isolate the one-off worker

- Live discovery confirmed that Phase 8 had not been applied: only sketchcatch-production-app exists and the API/web/worker task families do not.
- The original Phase 8 plan would destroy the legacy service and target group, replace the shared service security group, and route the listener before split targets were healthy.
- Added warmup and split listener weights so legacy remains at 100 during service registration and at 0 after split.
- Restored and protected the legacy app service, target group, and port 80 security group rules.
- Added API/web service stability waits and parallel GitHub Actions deploy jobs.
- Added a dedicated one-off worker task definition, execution role, task role, security group, RDS ingress, worker secrets, and scoped API dispatch permissions.
- Worker dispatch remains disabled until the worker caller principal is trusted by existing customer execution roles and a worker smoke passes.
- Added production secret completeness preconditions, ALB deletion protection, invalid header dropping, Terraform tests, and Korean operations documentation.

### 2026-07-11 - Resolve v2.0.0 release review

- Restored the access token TTL to 15 minutes so session extension uses the existing refresh-token rotation path.
- Corrected generic deployment warning classification and normalized managed Terraform user data before hash verification.
- Updated generated GitHub Actions to use `python3` and made default S3 bucket names safe at the 63-character boundary.
- Avoided redundant string conversion for downloaded Git artifacts.
- Kept the two reverse-engineering record guards local because their array semantics differ and a shared helper would change behavior or add coupling.

### 2026-07-11 - Complete ECS cutover and guard the EC2 rollback workflow

- Applied the warmup and split Terraform plans with the legacy target retained at weight zero.
- Ran the production database migrations after creating an encrypted pre-v2 RDS snapshot.
- Switched Route53 to the ECS ALB and verified public web, API, and DB health responses from ECS addresses.
- Enabled ECS one-off worker dispatch after extending the existing connection role trust to the API and worker task roles.
- Added a dedicated GitHub Actions production infrastructure plan role and environment.
- Changed the legacy EC2 deployment workflow to manual rollback only so a main merge cannot deploy the rollback stack.

## Verification

- Initial harness check passed.
- Terraform fmt and validate passed.
- Terraform tests passed 2 of 2 warmup/split contracts.
- Warmup apply completed with 26 additions, 21 in-place changes, and only the expected HTTP listener removal.
- Split apply changed only the HTTPS default action and API path rule weights.
- Worker enable apply replaced only the API and legacy task definition revisions and updated their services.
- Final Terraform refresh-only plan reports no changes.
- Public `/`, `/health`, and `/health/db` return 200 from ECS; protected `/api/projects` returns 401.
- Worker task smoke completed the idempotent database migration command with exit code 0.
- Release review targeted tests passed 38 of 38.
- Full repository lint, typecheck, and build passed after the review fixes.
- Issue #320 passed workflow static assertions, Prettier, harness, lint, typecheck, and build.

## Risk

- API/web remain desired count 1 and do not provide multi-task application redundancy.
- Route53 remains outside runtime Terraform state; the reviewed EC2 rollback UPSERT must be retained.
- Existing external customer execution roles outside this AWS account may still require worker-principal trust migration.
- The protected legacy rollback task still contains nginx, web, and API on the legacy security group.

## Next Action

- Merge issue #320's rollback-workflow guard into dev, then refresh release PR #319.
- Keep the v2.0.0 tag and GitHub Release blocked until PR #319 is merged to main.
