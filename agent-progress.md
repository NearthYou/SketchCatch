# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/370-live-observation-v2`.
- Issue #370 Tasks 1-5 are implemented; the feature flag remains false until external acceptance gates pass.
- Live Observation uses only the v2 Store, public collector, server-side observer, and provider-neutral snapshot paths.
- Legacy v1 routes, simulated CloudWatch providers, and presenter traffic-boost leases are removed.
- Latest `origin/dev` at `186ff261` is being integrated, including the completed Workspace Template Board UX and project thumbnail storage work.

## Session Record

### 2026-07-14 - Integrate latest dev into issue #370

- Merged `origin/dev` at `186ff261`; only this progress file required manual resolution.
- Preserved the active Live Observation workstream while carrying forward dev's Template Portal, Board thumbnail, storage, cost, and shared UI changes.
- Post-merge verification passed: Live Observation API 171/171 and Web 63/63, Web full 1,135/1,135, Redis 29/29, harness, lint, typecheck, build, and whitespace checks.
- API passed 1,428/1,431; the only failures occur before product code because Windows Developer Mode is disabled and three new dev-side security fixtures cannot create symlinks (`EPERM`).

### 2026-07-14 - Live Observation v2 production path

- Added the provider-neutral observation snapshot, atomic Store, capability-scoped public collector, server-side AWS evidence refresh, and operator/audience UI.
- Bound evidence to the selected Deployment and exact Target Group period, validated coherent runtime ownership, and masked credentials and sensitive headers.
- Removed the unused v1 routes/services/providers and demo-only presenter traffic-boost Store contract.
- Pre-merge verification passed: API full suite, Web 1,069/1,069, Redis 8 integration 29/29, harness, lint, typecheck, build, and whitespace checks.
- External acceptance remains unverified: the in-app browser blocks localhost, Chrome launch was not approved, and AWS STS is unavailable. No cloud mutation was attempted.

## Next Action

- Finish the merge commit, push the branch, open the issue #370 PR, wait five minutes, then resolve review and CI feedback before merging to `dev`.
- Keep the feature flag false until credentialed Chromium and an explicitly approved non-production AWS sandbox provide acceptance evidence.
