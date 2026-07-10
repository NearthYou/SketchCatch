# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: fix/sw/320-main-병합-시-legacy-ec2-자동-배포-차단, issue #320.
- Route53 targets the split ECS ALB; API, web, and legacy services are healthy.
- Public web/API/DB smoke passes from ECS addresses.
- ECS worker dispatch is enabled and the worker-network migration smoke exited 0.
- Final runtime Terraform refresh-only plan reports no changes.

## Changes This Session

- Applied warmup, split, and worker-enable Terraform plans.
- Created a pre-v2 RDS snapshot and completed migrations.
- Cut Route53 over to ECS while retaining the EC2 rollback batch and legacy resources.
- Added GitHub production plan/deploy IAM and environment configuration.
- Made the EC2 deployment workflow manual rollback-only for release safety.

## Broken Or Unverified

- PR #319 is not merged and the v2.0.0 tag/release does not exist yet.
- API/web desired count remains 1.
- External customer execution roles may still need worker-principal trust updates.

## Best Next Action

- Verify and merge issue #320 into dev, update PR #319 live evidence, then make a separate main merge decision.
