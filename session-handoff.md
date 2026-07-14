# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/gg/381-brainboard-aws-templates`.
- Project Board capture persistence is merged into `dev` at `186ff261`. The current working tree adds the remaining bounded Dashboard thumbnail refresh.
- The Dashboard retries a missing thumbnail (`404` mapped to `null`) and transient network, 408, 429, or 5xx failures at most three times with a fixed 250ms delay. Permanent HTTP failures stop immediately.
- Cards continue to render only authenticated raster Board captures. A lifecycle helper ignores post-dispose results and revokes created object URLs.
- Project Board capture now clones the React Flow DOM offscreen at 1280x720, fits every rendered Resource into the frame with an 8% margin, and removes the clone after capture. It does not move or persist the user's Board viewport. A manual save forces capture even if the server revision is unchanged.
- Dashboard thumbnail cards request their image again on a persisted browser `pageshow` event, so returning from a saved Workspace through browser history cannot retain an old object URL. A request-generation guard prevents stale reads from replacing the refreshed image.
- No database schema, migration, storage adapter, backend route, cloud, deployment, or dependency change was made.

## Verification

- TDD RED/GREEN: full Board bounds, CSS transform parsing, fitted viewport, and capture-path regressions passed alongside the existing thumbnail tests.
- Full Web suite passed 1,233/1,233.
- Real local filesystem thumbnail upload and read API flow passed without AWS credentials.
- Root lint and typecheck passed; lint retains one existing unused `setNow` argument warning in `apps/api/src/live-observations/live-observation-store-contract.ts`.
- Migration compatibility check and harness check passed.
- Root `pnpm test` has four unrelated API failures: three macOS path-separator Terraform lock-file fixtures and one EKS route-table-association orphan fixture. Root `pnpm build` is blocked before Web compilation by the missing `apps/web/.codegraph` path.
- A second read-only review found no Critical or Important issue.

## Changes This Session

- Current changes include the persisted-history Dashboard thumbnail refresh, together with earlier thumbnail loader/lifecycle and complete-Board offscreen capture work, tests, and progress records.
- Do not stage or remove the unrelated untracked `docs/gg/feat-infrastructure-template/brainboard-captures/aws-vpc-subnets-security-groups-2az.json`.

## Broken Or Unverified

- Root `pnpm test` is blocked by three unrelated macOS failures in Windows-path Terraform lock-file fixtures and one EKS route-table-association orphan fixture.
- Root `pnpm build` is blocked before Web compilation by the missing `apps/web/.codegraph` path.

## Best Next Action

- Existing Dashboard thumbnails refresh with full-board framing on their next Workspace save, including a same-revision manual save. Restore `apps/web/.codegraph` separately before expecting a successful production Web build.
