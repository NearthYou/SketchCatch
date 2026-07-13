# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/sw/370-live-observation-v2`; issue #370 Tasks 1-5 are implemented locally and latest `origin/dev` at `186ff261` is integrated.
- Live Observation v2 owns the Store, public collector, server-side AWS observer, provider-neutral snapshot, and operator/audience UI paths.
- Legacy v1 routes, simulated providers, and presenter traffic-boost leases are removed.
- The feature flag remains false pending external credentialed browser and approved AWS sandbox acceptance.

## Verification

- Pre-merge API full suite passed. Post-merge API passed 1,428/1,431; three dev-side filesystem security fixtures cannot create symlinks because Windows Developer Mode is disabled.
- Post-merge Web passed 1,135/1,135 and Redis 8 integration passed 29/29.
- Focused post-merge Live Observation tests passed: API 171/171 and Web 63/63.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed on 2026-07-14.
- Automated contracts cover desktop, mobile, reduced-motion, StrictMode cleanup, capability erasure, QR, and signal geometry behavior.

## Changes This Session

- Removed legacy Live Observation v1 routes, services, providers, and their obsolete tests.
- Removed the demo-only presenter traffic-boost lease contract from both Store adapters and Redis Lua scripts.
- Integrated latest `origin/dev`; only `agent-progress.md` required manual conflict resolution.
- Updated deployment verification guidance and the durable harness records.

## Broken Or Unverified

- The in-app browser returns `ERR_BLOCKED_BY_CLIENT` for localhost and Chrome is not running; launching it requires explicit user approval.
- AWS CLI is installed, but STS is not reachable with the current credentials. No approved non-production AWS sandbox evidence exists.
- Three unrelated API tests require Windows symlink privileges unavailable on this machine; they fail during fixture setup with `EPERM`, before product code executes.
- No Terraform Apply/Destroy, cloud mutation, deployment mutation, or database migration was performed.

## Best Next Action

- Finish and push the merge commit, open the issue #370 PR, wait five minutes, resolve review/CI feedback, and merge to `dev`.
- Do not enable Live Observation v2 until both external acceptance gates are evidenced.
