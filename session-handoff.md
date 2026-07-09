# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `codex/ecs-01-foundation`.
- Active workstream: `ECS-MIGRATION-000` in `feature_list.json`.
- Exactly one workstream is currently `in_progress`.
- `terraform fmt -check`, `terraform init -backend=false`, `terraform validate`, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed for Phase 1.
- Phase 1 scope is Terraform ECS/Fargate foundation only. Do not implement GitHub Actions ECS deployment, secret migration, worker code, ALB path routing split, EC2/SSM removal, or live AWS mutation in this phase.
- `docs/sw/spec.md`, `docs/sw/plan.md`, and `docs/sw/agents.md` are the active ECS migration execution references.

## Changes This Session

- Added ECS migration tracking as the only `in_progress` workstream in `feature_list.json`.
- Aligned ECS migration docs around the agreed strategy: parallel ALB cutover, Phase 1 nginx/web/api single ECS task, EC2/SSM rollback retained until ECS smoke passes, secrets migration in a later phase, and API/worker separation only after ECS production stability.
- Replaced the previous SQS/always-on worker service plan with ECS `RunTask` one-off worker execution as the next worker direction; SQS FIFO/DLQ and always-on worker services are deferred pending a later decision.
- Added `infra/aws/terraform` ECS foundation definitions for ECR, ECS cluster/service/task definition, IAM roles/policies, CloudWatch Logs, security groups, parallel ALB, listener, and Fargate `ip` target group.
- Kept Route53 alias creation disabled by default so the EC2 ALB remains the active rollback path.
- Documented Phase 1 cost-bearing resources and required Phase 2/3 variables/secrets in `infra/aws/terraform/README.md` and `docs/deployment.md`.
- Added Terraform local-state ignore rules while keeping `.terraform.lock.hcl` trackable for provider reproducibility.

## Broken Or Unverified

- No GitHub issue was created in this session.
- No live AWS commands, Terraform plan/apply/destroy, IAM changes, Route53 cutover, or cloud mutations were run. `terraform plan` remains intentionally unverified.
- No GitHub Actions ECS deploy workflow, secret migration implementation, worker code, ALB path routing split, or EC2/SSM removal was done.
- ECR image push and ECS smoke are still pending future phases.

## Best Next Action

- Next implementation phase should be `Feat: ECR 기반 ECS 배포 워크플로 전환` on `feature/sw/{issue}-ecs-deploy-workflow`.
- Phase 2 should wire ECR image push and ECS service update using the Terraform outputs from `infra/aws/terraform`.
