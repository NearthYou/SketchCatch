# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State

- Branch: fix/sw/316-ecs-production-cutover-및-worker-격리-안전성-보강.
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

## Verification

- Initial harness check passed.
- Terraform fmt and validate passed.
- Terraform tests passed 2 of 2 warmup/split contracts.
- Live refresh-only plan completed without mutation.
- The revised production warmup plan has no legacy service, target group, or security group delete/replace actions.
- Its only delete is the non-production ECS ALB HTTP forward listener, replaced by HTTP redirect plus HTTPS while legacy remains weight 100.
- No Terraform apply, worker RunTask, or Route53 mutation has run yet.

## Risk

- The operator role may still need permission to create and pass the two new worker IAM roles.
- Existing customer execution roles must trust the worker task role before worker dispatch is enabled.
- Warmup temporarily runs three Fargate app tasks.
- API/web remain desired count 1. Web now has a permissionless task role and separate SG; only the protected legacy rollback task still contains all three containers on the API/legacy SG.
- Route53 ownership remains outside runtime state and requires a separately reviewed change and rollback batch.

## Next Action

- Full repository checks, Terraform validation/tests, production structure guard, workflow/JSON formatting, and diff checks passed.
- Open and merge the issue #316 PR after review.
- Re-plan from merged dev, apply warmup, verify target health and direct HTTPS smoke, then separately apply split and perform the approved Route53 cutover.