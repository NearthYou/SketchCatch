# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State

- Release PR: #319, dev to main.
- Active workstream: ECS-MIGRATION-000, production cutover and worker isolation.
- Issue: #316.
- Production Route53 still points to the EC2 ALB.
- The parallel ECS ALB currently serves the healthy legacy nginx app service.
- The runtime state bucket has Versioning, AES256 encryption, Public Access Block, and no stale lock.

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

## Verification

- Initial harness check passed.
- Terraform fmt and validate passed.
- Terraform tests passed 2 of 2 warmup/split contracts.
- Live refresh-only plan completed without mutation.
- The revised production warmup plan has no legacy service, target group, or security group delete/replace actions.
- Its only delete is the non-production ECS ALB HTTP forward listener, replaced by HTTP redirect plus HTTPS while legacy remains weight 100.
- No Terraform apply, worker RunTask, or Route53 mutation has run yet.
- Release review targeted tests passed 38 of 38.
- Full repository lint, typecheck, and build passed after the review fixes.

## Risk

- The operator role may still need permission to create and pass the two new worker IAM roles.
- Existing customer execution roles must trust the worker task role before worker dispatch is enabled.
- Warmup temporarily runs three Fargate app tasks.
- API/web remain desired count 1. Web now has a permissionless task role and separate SG; only the protected legacy rollback task still contains all three containers on the API/legacy SG.
- Route53 ownership remains outside runtime state and requires a separately reviewed change and rollback batch.

## Next Action

- Push the verified review patch to dev, resolve PR #319 review threads, and recheck CI before the release merge decision.
- Re-plan production infrastructure from the released revision before any approved live warmup or cutover operation.
