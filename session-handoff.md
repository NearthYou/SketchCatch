# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feature/sw/312-ecs-alb-path-routing`.
- Active workstream: `ECS-MIGRATION-000`, issue #312.
- Terraform routing contract passes for API/web target groups, listener rules, task definitions, and services.
- API forwarded-header regression coverage passes.
- Full harness, lint, typecheck, build, Terraform fmt/validate/tests, API forwarded-header tests, and ECS operations preflight pass.
- No live AWS, Terraform plan/apply, ALB, or Route53 command ran.

## Changes This Session

- Split the former nginx/app task and service into API and web Fargate task definitions and services.
- ALB routes `/api`, `/api/*`, `/health`, and `/health/db` to API; its default action routes all other paths to web.
- Removed nginx from ECS steady state and the ECS deploy workflow.
- Retained nginx and EC2/SSM assets as explicitly documented legacy rollback dependencies.
- Split ECS deployment into sequential API and web rollouts and updated scoped deploy IAM resources.
- Updated static preflight, observability, outputs, docs, and harness tracking.

## Broken Or Unverified

- Live AWS and HTTP checks remain intentionally pending; all local/static required checks pass.
- Live target health, HTTP smoke, ALB behavior, and Route53 cutover are intentionally unverified.
- Sequential API/web deployment is not atomic.
- The shared ECS task role and service security group are broader than the eventual least-privilege split.

## Best Next Action

- Publish the PR, wait five minutes, resolve review feedback, re-verify, and merge.
