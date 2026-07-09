# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feature/sw/288-ecs-deploy-workflow`.
- Active workstream: `ECS-MIGRATION-000` in `feature_list.json`.
- The ECS/Fargate foundation PR has been merged into `dev`.
- Live Terraform execution was intentionally started against AWS account `555980271919`.
- `terraform init` with the S3 backend passed, initial `terraform plan -out=tfplan` passed with 25 creates, and `terraform apply tfplan` partially created resources before failing on IAM role creation.
- After permission refresh, `terraform apply tfplan-remaining` created both ECS IAM roles, then failed on `iam:ListAttachedRolePolicies`.
- After adding `iam:ListAttachedRolePolicies`, the final remaining plan applied successfully and a follow-up Terraform plan reported no changes.
- Route53 alias creation stayed disabled and `ecs_desired_count=0` was used, so no DNS cutover and no running Fargate tasks were started.
- Phase 2 implementation adds a separate manual ECS deploy workflow while keeping the existing EC2/SSM production workflow as rollback.
- `docs/sw/spec.md`, `docs/sw/plan.md`, and `docs/sw/agents.md` are the active ECS migration execution references.

## Changes This Session

- Fast-forwarded local `dev` to latest `origin/dev`.
- Used profile `sketchcatch-dev`, region `ap-northeast-2`.
- Initialized backend `s3://sketchcatch-terraform-state-555980271919-ap-northeast-2/production/ecs-foundation/terraform.tfstate`.
- Applied the saved plan until IAM role creation failed.
- Created resources now tracked in Terraform state: ECR repos/lifecycle policies, CloudWatch log groups, ECS cluster, parallel ECS ALB/listener/target group, ECS ALB/service security groups, and related security group rules.
- Generated `tfplan-remaining`, then applied it far enough to create and track the ECS execution role and ECS task role.
- Untainted the two IAM roles after the interrupted apply, regenerated `tfplan-remaining-3`, and applied the final 4 resources successfully.
- Final outputs include ECR URLs for api/nginx/web, ECS ALB DNS `sketchcatch-production-ecs-909071745.ap-northeast-2.elb.amazonaws.com`, cluster `sketchcatch-production-cluster`, and service `sketchcatch-production-app`.
- Created issue #288 and linked branch `feature/sw/288-ecs-deploy-workflow`.
- Added `.github/workflows/deploy-ecs.yml` for ECR push, task definition rendering, and ECS service update.
- Updated the GitHub Actions deploy role policy document with ECR/ECS/iam:PassRole permissions needed by the ECS workflow.
- Documented the Phase 2 ECS workflow and required GitHub variables in `docs/deployment.md`.

## Broken Or Unverified

- `sketchcatch-admin` and `sketchcatch-caller` profiles exist but had invalid credentials during this session.
- ECS service exists but is intentionally scaled to `desiredCount=0`.
- ECR image push workflow has been added but not live-run in this local session.
- Task secrets, ECS smoke, and Route53 cutover are still pending future phases.

## Best Next Action

- Finish verification, open the Phase 2 PR, wait for review comments, resolve them, then merge if checks pass.
- After Phase 2 merge, configure the required GitHub variables and run the manual ECS workflow only when task secrets and smoke criteria are ready.
