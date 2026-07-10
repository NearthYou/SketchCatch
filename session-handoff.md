# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: fix/sw/316-ecs-production-cutover-및-worker-격리-안전성-보강, issue #316.
- Route53 production alias still targets the EC2 ALB.
- ECS has one healthy legacy nginx app service.
- Remote runtime state and backend protections were verified live.
- A saved warmup plan preserves the legacy service, target group, and service security group.

## Changes This Session

- Added warmup and split ALB target weights.
- Restored Terraform ownership and prevent-destroy protection for the legacy app service and target group.
- Added parallel API/web deployment jobs and steady-state waits.
- Added dedicated worker task definition, roles, security group, RDS ingress, secrets, and API dispatch IAM.
- Added production secret gates, tests, and operational documentation.

## Broken Or Unverified

- Full repository checks and Terraform tests pass; PR review is still pending.
- No Terraform apply, ECS worker smoke, or Route53 mutation has run.
- Worker dispatch must remain disabled until existing connection roles trust the worker task role.
- Operator permission for the new worker role names is not yet verified.

## Best Next Action

- Finish checks, publish and merge the PR, then re-create and review the production warmup plan from merged dev before apply.