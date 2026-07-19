# Session Handoff

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Currently Verified

- Branch: `fix/sw/live-observation-deployment-picker-layering`, integrated with `origin/dev` through `ad1464ba` and being prepared for a PR to `dev`.
- The legacy `practice` profile is removed in favor of `demo_web_service`; imported migration `0054` handles existing rows.
- Repository ECS analysis records runtime Secret names only. Preflight uses isolated placeholders; approved Apply generates `CHECK_IN_SIGNING_SECRET`, stores it in Secrets Manager, grants exact Task execution-role read access, and maps the ARN into every Task.
- Fixed `INSTANCE_ID` injection is removed so hostname-based `servedBy` can distinguish Tasks. Stateless repository evidence keeps bounded Fargate capacity 1–3.
- The previous 963-request sandbox run completed with 963 HTTP 200 responses, and its failed observation acceptance triggered approved cleanup. Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED`; the scoped AWS resources were verified absent.
- Focused verification for the merge conflicts and baseline repairs passes. Final full checks are pending.

## Changes This Session

- Repaired Windows subprocess execution, API test environment isolation, stale generated architecture knowledge, and current Workspace/resource-catalog contracts.
- Merged current `origin/dev` while preserving both runtime Secret delivery and profile-removal safety intents.
- Updated runtime Secret safety coverage to use `demo_web_service` and kept literal-secret and broad-IAM rejection intact.

## Broken Or Unverified

- End-to-end Live Observation animation and provider-confirmed scale-out remain unaccepted because the prior active UI session missed the traffic before the delayed-snapshot fix.
- Automatic cleanup remains blocked until the approved operator can read the internal deployment-state object.
- Do not generate traffic or recreate AWS resources without a new explicit approval.

## Best Next Action

1. Finish the merged-result checks and publish the current branch as a PR to `dev`.
2. After merge, re-analyze `audience-live-check` and inspect its runtime Secret mapping before seeking any Apply approval.

## Suggested Skills

- Use `qa` if Live Observation browser behavior changes again.
- Use `review` before merging the PR.
