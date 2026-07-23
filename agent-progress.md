# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- The new-project screen shows local AWS, multicolor Google Cloud, and Azure brand icons and uses a wider, larger start-method layout with single-line desktop copy.
- Workspace start cards keep every desktop title on one line, use subdued description typography, and place the AWS Role badge in the Reverse Engineering title row.

## Session Record

- 2026-07-23: Localized the landing navigation, removed the duplicate product-tour action, and routed every landing start CTA through Login so Signup is entered only from the Login page. Verified with the focused landing-flow regression test, Web typecheck, scoped diff review, and harness check.
- 2026-07-23: Added user-scoped Settings caches for AWS, GitHub, and AWS CodeConnections. Cached connection details now survive tab remounts for 30 minutes, stay fresh for 5 minutes, and explicit refresh updates every connection source. Verified with the focused cache regression test, Web typecheck, scoped diff review, and harness check.
- 2026-07-23: Aligned the empty Cost Usage refresh action with the shared dashboard secondary-button UI, typography, icon, and busy state. Verified by scoped diff review and harness check.
- 2026-07-23: Removed the redundant empty-project `새 설계 시작` CTA from both project-list implementations while preserving the top-level `새 프로젝트` action. Verified by scoped diff review and harness check.
- 2026-07-23: Enlarged the `/workspace/new` content area, start cards, titles, descriptions, and icons; added local cloud-provider brand assets and responsive single-column fallback. The focused start-screen test passes 2/2, and lint, typecheck, and production build pass.
- 2026-07-23: Refined the `/workspace/new` start-method cards to match the selected compact UI direction. Added a focused regression test. Verified with the focused test, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check`.

## Known Risk

- Authenticated browser visual smoke testing for `/workspace/new` was not available in the clean browser session; the route redirected to login. Source-level regression coverage and the production build are green.
- The manifest-contract repair and audience receipt flow are production-verified, but provider-confirmed scale-out remains a separate blocked acceptance item.
- Error-analysis percentage remains an elapsed-time estimate because the current AI endpoint does not expose server-side stages; the active item rises from 8% to 94%, then a real successful response shows 100% for 800ms.
- Existing saved Project Drafts are not rewritten. The affected project must be re-analyzed and its Fixed Template Board regenerated before preparing a new deployment.
- The local test project `b99f92aa-fb46-4822-ae2f-ca9e4e88e4f9` was saved by the stale Web process and must be re-analyzed/regenerated or replaced after the Web restart.
- Root `pnpm test` is not green because ten unrelated API baseline tests fail and `application-artifact-registry.test.ts` still has one cancelled lease-heartbeat test.
- The full Web suite is 1,205/1,213. Eight unrelated baseline contracts fail across generated architecture knowledge, node/thumbnail presentation, typography audits, CI/CD styling, and Live Observation capacity layout.
- Provider-confirmed scale-out remains unaccepted because the production acceptance traffic intentionally covered session, receipt, SSE, and heartbeat continuity rather than a load-triggered capacity change.
- Automatic cleanup remains blocked for this credential layout until the approved cleanup operator can read the internal deployment-state object.
- No new AWS resources or traffic may be created without a new explicit approval.

## Next Action

1. Re-run the local new-project Repository flow against the restarted Web server and confirm the generated Board contains the runtime Secret chain.
2. Use a separately approved load cycle if provider-confirmed Live Observation scale-out must be accepted; no DB migration is required.
3. Consider server-reported progress stages only if the AI error-analysis contract later exposes them.
