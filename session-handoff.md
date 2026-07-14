# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `test/sw/378-deployment-sandbox-e2e`; latest `origin/dev` at `847a8206` is integrated and issues #370-#377 are merged.
- Non-production preflight passed for AWS account `614935468487`, region `ap-northeast-2`, the verified local API connection, and `NearthYou/sketchcatch-deployment-sandbox`.
- Three Direct Terraform runs labeled `infrastructure`, `application`, and `full_stack` reached Apply success, healthy Output probes, and Destroyed.
- Full-stack observation evidence matched: 12 accepted traffic requests, 12 CloudWatch log events, and metric sum 12.
- AWS cleanup returned zero demo ASGs, ALBs, active EC2 instances, demo S3 buckets, and demo CloudWatch log groups.

## Verification

- Sandbox E2E focused tests pass 20/20.
- Destroy-plan retry regression passes 3/3; demo artifact and Terraform safety focused tests pass.
- Final workspace harness, lint, typecheck, and build must be rerun after the dev merge and remaining implementation.

## Changes This Session

- Fixed the StepScaling policy rejected by AWS, cleanup retry stage preservation, root API URL normalization, smoke token expiry recovery, explicit scope reporting, and sandbox deregistration delay.
- Executed and cleaned a failed partial apply plus three successful labeled Direct runs.
- Integrated the latest `origin/dev` while preserving the Issue #378 sandbox safety and recovery changes.

## Broken Or Unverified

- Direct `application` and `full_stack` currently execute Terraform but do not build an application artifact or create an `ApplicationRelease`; the successful sandbox runs left `application_releases` at zero.
- The local API has no `GIT_APP_ID`, `GIT_APP_SLUG`, `GIT_APP_PRIVATE_KEY_BASE64`, callback configuration, or installed sandbox-repository GitHub App, so service-owned GitOps handoff/monitoring cannot run.
- GitOps four-runtime deployment/rollback, QR public session, Inbox/Web Push provider delivery, and the complete verifier report remain unverified.

## Best Next Action

- Implement the Direct application build/release adapter and persist a release only from immutable commit/artifact/provider evidence.
- Install a least-privilege GitHub App on the sandbox repository and provide its runtime configuration through secret environment variables.
- Rerun the GitOps four-runtime matrix, rollback drills, QR/notification checks, final cleanup, and strict report verification.
