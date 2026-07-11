# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch `fix/sw/322-ecs-production-ha-release-deploy`, issue #322, is ready for PR publication.
- Production ECS is healthy at API/web desired 1 with autoscaling min 1/max 2.
- Legacy ECS, EC2, old ALB, and the old CloudFormation ALB stack are retired.
- Route53, HTTP smoke, RDS protections, alarms, SNS delivery, worker image SHA, and final Terraform no-change plan are verified.

## Changes This Session

- Added autoscaling, alarms, migration safety, least-privilege deploy IAM, and disabled cold rollback Terraform.
- Removed warm rollback workflows and infrastructure definitions.
- Applied the approved runtime plan and synchronized GitHub production variables and tfvars.

## Broken Or Unverified

- External customer role trust migration is not globally observable from this AWS account.
- Cold rollback has not been restored end to end after AMI sanitization.
- The branch is not yet committed, pushed, reviewed, or merged.

## Best Next Action

- Commit and push issue #322, open a Korean PR to `dev`, address review feedback, and merge after checks pass.
