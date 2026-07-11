# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Issue #322 PR #324 is merged into `dev`; release PR #325 is open.
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
- PR #325 is temporarily conflicting because the prior v2.0.0 squash commit is not an ancestor of `dev`.

## Best Next Action

- Merge the ancestry-sync branch into `dev` with a merge commit, then recheck and merge PR #325 with a merge commit.
