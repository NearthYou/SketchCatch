# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/391-diagram-positioning`.
- `origin/dev` was fetched and merged into this branch on 2026-07-15; incoming dev state included sandbox GitOps persistence, Web clarity/accessibility, dashboard copy, ECS deployment speed, and Brainboard Template updates.
- This branch still carries the Repository ECS frontend diagram readability fix, including good-reference layout criteria and saved DiagramJson restore normalization.
- Before the merge, focused notification SSE fixes passed API notification tests 17/17, Web notification tests 6/6, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Latest merged dev notes still mark Static, Lambda, EC2/ASG, rollback drills, QR public session, and Web Push provider delivery as incomplete where applicable; do not report those as passing.

## Session Record

### 2026-07-15 - Merge latest dev into diagram positioning branch

- Fetched `origin/dev` and merged it into `feat/ck/391-diagram-positioning`.
- Preserved dev's deployment/GitOps persistence, production ECS speed, Web clarity/accessibility, dashboard copy, Brainboard Template, notification, and infrastructure updates.
- Preserved this branch's Repository ECS frontend diagram layout behavior and notification SSE reconnect-loop fixes.
- Resolved the only merge conflict in `agent-progress.md`.

### 2026-07-15 - Diagnose deployment notification SSE reconnect loop

- Found the local API reconnect loop was caused by notification SSE closing and the frontend retrying every second.
- Confirmed local DB is behind the durable notifications migration: `notifications`, `notification_outbox`, and `web_push_subscriptions` are missing while Drizzle history only shows earlier applied migrations.
- Fixed SSE lifetime handling so idle streams stay open and added a regression for the no-immediate-event case.
- Stopped the frontend from starting the SSE stream when the initial durable Inbox load fails.
- Verification: focused API notification tests passed 17/17; focused Web notification tests passed 6/6; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Known local action: run `pnpm --filter api db:migrate:runtime` before testing deployment notifications locally.

### 2026-07-14 - Repository analysis template ranking and layout preservation

- Updated repository analysis so every available board template can be used as a ranking candidate pool while the user-facing recommendation list is capped at the top three choices.
- Preserved authored template layouts for selected repository-analysis templates and routed non-built-in templates through direct template board creation so their saved positions are not moved.
- Added an `audience-live-check` style regression proving ECS Fargate ranks ahead of 3-tier for a single containerized Node/React app with no persistent database.
- Chrome verification: controlled Chrome reached the repository analysis route but redirected to login because the launched automation profile was unauthenticated; existing user Chrome exposed no debug port for attachment.
- Verification: repository recommendation API test passed 10/10; public repository recommendation web test passed 8/8; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.

### 2026-07-14 - Prior dev work now merged into this branch

- Dev brought in ECS GitOps persistence and cleanup evidence, production ECS deployment speed optimization, live sandbox Direct recovery hardening, deployment sandbox E2E gates, Web UI clarity/accessibility improvements, dashboard navigation/copy simplification, and Brainboard AWS Template branch integration records.
- Detailed older dev records remain available in `docs/agent-history/2026-07.md` and the merge commit history.

## Next Action

- Finish the merge by reapplying the pre-merge stash, resolving any resulting conflicts, and running focused checks.
- Run local API DB migrations before testing deployment notifications locally.
