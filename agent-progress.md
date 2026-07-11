# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State

- Active branch: `fix/sw/322-ecs-production-ha-release-deploy`, issue #322.
- Release `v2.0.0` uses main SHA `44cdc976da8a03fca2d0aad69a0f3d45d51d4e8a`.
- Route53 points to the direct-path ECS ALB. Public `/`, `/health`, and `/health/db` return 200; protected `/api/projects` returns 401.
- API and web are active at desired/running 1 with Application Auto Scaling min 1 and max 2.
- The legacy ECS service is absent from `list-services`, its task definition is inactive, and its target group is deleted.
- The old EC2 instance, old ALB, and legacy CloudFormation ALB stack are deleted.
- Cold rollback retains encrypted AMI `ami-0a65f0b7656bf2221`, encrypted snapshot `snap-04862810b1ed8a101`, and the verified SHA-pinned S3 Docker archive.
- RDS is encrypted and available with deletion protection and seven-day backups; it remains Single-AZ for cost control.
- Production alarms are OK and the SNS email subscription is confirmed.

## Session Record

### 2026-07-11 - Retire warm rollback and complete cost-first ECS operations

- Deployed and released the main SHA, aligned API/web/worker images, and verified the one-off worker migration command.
- Sanitized the retired EC2 host before creating an encrypted cold rollback AMI; removed the duplicate unencrypted AMI and snapshot.
- Deleted the EC2 instance, old ALB stack, legacy ECS service/task registration, target group, and port 80 rules.
- Added API/web autoscaling min 1 and max 2, circuit-breaker-preserving service ownership, low-cost alarms, and confirmed SNS delivery.
- Replaced EC2 migrations with approved ECS one-off worker migrations, pre-migration snapshots, a compatibility guard, and three-snapshot retention.
- Removed retired deployment/HTTPS workflows and reduced the GitHub deploy role to ECR, ECS, worker, scoped snapshot, and SNS permissions.
- Added a disabled-by-default cold rollback Terraform root with scoped RDS/Redis access and documented restore procedures.

## Verification

- Harness, migration compatibility, production infra structure, IAM tests, lint, typecheck, and build passed.
- Runtime and cold rollback Terraform fmt/validate passed; runtime Terraform tests passed 2 of 2.
- The approved runtime Terraform apply completed and the final normal plan reports no changes.
- API/web services are stable at 1/1, autoscaling targets are min 1/max 2, and both target groups have healthy serving targets.
- Route53 alias, RDS protections, worker SHA, IAM attachments, alarms, and SNS subscription were verified live.

## Risk

- A one-task baseline has no steady multi-AZ application redundancy; autoscaling is cost-first and reacts to CPU load, not AZ failure.
- RDS is Single-AZ. Deletion protection, seven-day backups, pre-migration snapshots, and the restore runbook reduce but do not remove outage risk.
- External customer execution roles may still need the worker task principal added to their trust policy.
- Cold rollback has a longer RTO than the retired warm path and has static validation but no post-sanitization restore drill.

## Next Action

- Publish issue #322 as a PR to `dev`, resolve review feedback, merge it, then promote the workflow changes to `main` before the next production deploy or migration.
