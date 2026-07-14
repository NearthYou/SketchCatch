# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `test/sw/378-deployment-sandbox-e2e`; latest `origin/dev` at `847a8206` is integrated and issues #370-#377 are merged.
- Non-production preflight passed for AWS account `614935468487`, region `ap-northeast-2`, the verified local API connection, and `NearthYou/sketchcatch-deployment-sandbox`.
- Three Direct Terraform runs labeled `infrastructure`, `application`, and `full_stack` reached Apply success, healthy Output probes, and Destroyed.
- Full-stack observation evidence matched: 12 accepted traffic requests, 12 CloudWatch log events, and metric sum 12.
- AWS cleanup returned zero demo ASGs, ALBs, active EC2 instances, demo S3 buckets, and demo CloudWatch log groups.
- Direct application/full_stack execution now prepares immutable CodeBuild artifacts, validates the active GitHub repository and CODECONNECTIONS source, re-queries AWS runtime state, and persists a Direct ApplicationRelease.
- Application-only Destroy now uses an approved cleanup manifest and restores the prior AWS revision without Terraform state.

## Verification

- Sandbox E2E focused tests pass 20/20.
- Destroy-plan retry regression passes 3/3; demo artifact and Terraform safety focused tests pass.
- Final workspace harness, lint, typecheck, and build must be rerun after the dev merge and remaining implementation.
- Deployment/release integration passes 109 tests, Web target state passes 10 tests, and workspace lint, typecheck, and build pass after the implementation.

## Changes This Session

- Fixed the StepScaling policy rejected by AWS, cleanup retry stage preservation, root API URL normalization, smoke token expiry recovery, explicit scope reporting, and sandbox deregistration delay.
- Executed and cleaned a failed partial apply plus three successful labeled Direct runs.
- Integrated the latest `origin/dev` while preserving the Issue #378 sandbox safety and recovery changes.

## Broken Or Unverified

- GitHub App `4294146` is installed only on the sandbox repository as installation `146476093`; its private key is stored at `%USERPROFILE%/.sketchcatch/secrets/sketchcatch-deployment-sandbox.pem` with restricted ACL.
- AWS CodeConnections `sketchcatch-sandbox-github` was created in `ap-northeast-2` but remains `PENDING`. GitHub's `AWS Connector for GitHub` authorization page has a disabled Authorize button, and CodeBuild creation correctly fails closed until the connection becomes available.
- The new Direct ApplicationRelease and application-only cleanup paths are automated-test verified but not yet live-verified against the sandbox CodeBuild release plane.
- GitOps four-runtime deployment/rollback, QR public session, Inbox/Web Push provider delivery, and the complete verifier report remain unverified.

## Best Next Action

- Complete the pending AWS Connector OAuth authorization, verify CodeConnections is `AVAILABLE`, then create `sketchcatch-issue-378-ecs` from the prepared sandbox configuration.
- Inject GitHub App credentials through runtime environment variables without committing them, then live-verify Direct application/full_stack release and application cleanup.
- Rerun the GitOps four-runtime matrix, rollback drills, QR/notification checks, final cleanup, and strict report verification.
