# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State

- Active branch: `fix/sw/330-production-auth-runtime`, issue #330.
- Release `v2.0.0` uses main SHA `44cdc976da8a03fca2d0aad69a0f3d45d51d4e8a`.
- Route53 points to the direct-path ECS ALB. Public `/`, `/health`, and `/health/db` return 200; protected `/api/projects` returns 401.
- API and web are active at desired/running 1 with Application Auto Scaling min 1 and max 2.
- The legacy ECS service is absent from `list-services`, its task definition is inactive, and its target group is deleted.
- The old EC2 instance, old ALB, and legacy CloudFormation ALB stack are deleted.
- Cold rollback retains encrypted AMI `ami-0a65f0b7656bf2221`, encrypted snapshot `snap-04862810b1ed8a101`, and the verified SHA-pinned S3 Docker archive.
- RDS is encrypted and available with deletion protection and seven-day backups; it remains Single-AZ for cost control.
- Production username/password signup and login are healthy after rotating the invalid one-character auth token secret; OAuth client ID injection is pending this hotfix deployment.
- Container log alarms keep ALARM notifications while suppressing repetitive OK notifications, and the web filter excludes stale Next.js Server Action requests.

## Session Record

### 2026-07-11 - Disable Trivy ALB and Auto Scaling checks

- Configured each Terraform Trivy scan to generate an ignore file that excludes ALB rules AWS-0047, AWS-0052, AWS-0053, and AWS-0054 plus Auto Scaling launch configuration/template rules AWS-0008, AWS-0009, AWS-0122, AWS-0129, and AWS-0130.
- Kept all other Terraform Trivy checks enabled; the exclusion applies to the generated scan workspace only and does not change user Terraform source files.
- Verification: focused Trivy scanner tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: future Trivy check-bundle rule IDs require an explicit review before they are added to the exclusion list.
- Next action: add the product-specific ALB and ASG configuration warnings as non-blocking deployment checks when requested.
### 2026-07-11 - Recover production auth runtime configuration

- Traced signup/login failures to a one-character SSM `AUTH_TOKEN_SECRET` and missing OAuth client IDs in the ECS API task definition.
- Rotated the secret without exposing it, restarted the API service, and verified live signup, login, and account cleanup.
- Added production startup validation and deployment-time OAuth variable injection so invalid auth configuration fails before serving traffic.
- Kept container ALARM notifications, removed repetitive OK notifications, and excluded the known stale Server Action web log pattern.

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
- Production auth tests passed 41 of 41; Terraform runtime validation passed and tests passed 2 of 2.
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

- Merge the main-history synchronization PR into `dev` with a merge commit, then merge release PR #325 into `main` with a merge commit so future release diffs use the correct ancestry.
