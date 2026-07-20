# Session Handoff

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Currently Verified

- Branch: `dev`; the Repository runtime-Secret fix is committed and the public-release verifier compatibility change is ready for the requested direct `dev` publication.
- The legacy `practice` profile is removed in favor of `demo_web_service`; imported migration `0054` handles existing rows.
- Repository ECS analysis records runtime Secret names only. Fixed Template Board creation now consumes those names and generates `CHECK_IN_SIGNING_SECRET`, Secrets Manager storage, exact execution-role read access, and the ECS Task ARN mapping.
- Full-stack preparation rejects a missing or cross-wired required runtime Secret before Plan creation. Failed deployments no longer expose stale Apply approval and their stored failure summary remains visible from every deployment step.
- Public ECS/Web verification accepts both the legacy `sessionId` response and the stateless signed `sessionToken` response for `POST /api/check-ins` while retaining status and expiry validation.
- Fixed `INSTANCE_ID` injection is removed so hostname-based `servedBy` can distinguish Tasks. Stateless repository evidence keeps bounded Fargate capacity 1–3.
- Sixty focused runtime-Secret and deployment UI regressions and the final post-review 50-test subset pass. Lint and typecheck pass. Root build reported all tasks successful but Turbo did not exit. The full Web suite passes 1,090 of 1,098 tests, with eight failures outside the runtime-Secret paths. Root `pnpm test` still has ten unrelated API failures and one unchanged lease-heartbeat cancellation; the Repository source-contract regression found in that run is fixed.

## Changes This Session

- Diagnosed Deployment `48a82459-0414-4fb3-9384-b72431071f06`: ECS, frontend activation, and CloudFront invalidation succeeded; only the hard-coded legacy `sessionId` response check failed against the repository's new `sessionToken` contract.
- Added a red-green regression and the minimal verifier compatibility change. Thirty focused release and Git/CI/CD settings tests, lint, and typecheck pass.
- Retried the same pinned frontend candidate through the local UI. Deployment `48a82459-0414-4fb3-9384-b72431071f06`, Application Release `3d420708-618e-4921-887a-4213b7eded98`, and the retry job are now successful.
- Confirmed `jh-9999/audience-live-check` Repository Variables still target prior project `7b618d82`; current project `f584d0c2` has valid monitoring config but no Git/CI/CD handoff or applied settings.
- Confirmed the local Git/CI/CD handoff guard rejects `http://localhost:3000` because GitHub Actions cannot reach it; use the production HTTPS service for the real handoff rather than weakening the guard.
- Completed the missing initial Project Workspace Fixed Template runtime-Secret path, added a fail-closed deployment preparation guard, and corrected failed-deployment approval/error presentation.
- Updated the runtime convergence contracts and regression coverage without changing the database schema or mutating cloud resources.
- Runtime-Secret validation now runs against the exact Terraform-editor-synchronized `DiagramJson`, not the previously saved Board.
- Diagnosed project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` as created by a stale long-running Next dev process, restarted only the local Web server, and verified its exact persisted analysis produces the complete Secret chain with current code.

## Broken Or Unverified

- A clean root build completed all five package tasks successfully, but the local Turbo process did not exit after its success summary and was terminated. The production workflow remains the clean Ubuntu build gate.
- Current GitHub Repository Variables must not be manually overwritten outside the approved handoff path; the repository currently remains bound to the older project until a new handoff is created and Repository settings are explicitly applied.
- Existing Project Drafts are not rewritten; the affected repository must be re-analyzed and its Fixed Template Board regenerated after production deployment.
- Local project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` remains an old incomplete saved Board and is not evidence against the restarted code path.
- The full Web suite retains eight architecture-board/compiler failures outside this workstream; the changed runtime-Secret regression subset passes.
- End-to-end Live Observation animation and provider-confirmed scale-out remain unaccepted because the prior active UI session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked until the approved operator can read the internal deployment-state object.
- Do not generate traffic or recreate AWS resources without a new explicit approval.

## Best Next Action

1. Publish and deploy the current `dev` verifier change through the normal production workflow; no DB migration is required.
2. Recreate the project flow on the production HTTPS service and create its CI/CD handoff there.
3. Explicitly apply Repository settings so Project ID, AWS Role, CodeBuild project, state key, and Output URL replace the stale prior-project values.

## Suggested Skills

- Use `qa` if Live Observation browser behavior changes again.
- Use `review` before merging the PR.
