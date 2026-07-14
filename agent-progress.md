# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/ck/391-diagram-positioning`.
- `origin/dev` was fetched and merged into this branch on 2026-07-15; incoming dev state included sandbox GitOps persistence, Web clarity/accessibility, dashboard copy, ECS deployment speed, and Brainboard Template updates.
- This branch still carries the Repository ECS frontend diagram readability fix, including good-reference layout criteria, strict template preservation, support-lane separation, and saved DiagramJson restore normalization.
- Before the merge, focused notification SSE fixes passed API notification tests 17/17, Web notification tests 6/6, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Before the merge, focused repository template layout tests passed: workspace adapter 45/45, public repository recommendation 8/8, repository template recommendation 10/10, plus `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Latest merged dev notes still mark Static, Lambda, EC2/ASG, rollback drills, QR public session, and Web Push provider delivery as incomplete where applicable; do not report those as passing.

## Session Record

### 2026-07-15 - Lock Repository ECS reference layout and real Group containers

- Captured the open Chrome Architecture Board as the deterministic first-generation layout for the full `audience-live-check` ECS Fargate plus frontend evidence signature.
- Preserved authored Template geometry and placed Browser, GitHub Actions, private subnets, NAT/private routing, CloudFront/S3, ECR, CloudWatch, and the Fargate runtime at the approved coordinates.
- Materialized `Global IAM` and `Definition / Ops` as the only `design_group` presentation containers in this ECS flow; Region remains a Region area and User/Client remains a Design node.
- Kept subsequent AI patch and saved-draft restore paths from overwriting user-owned positions, sizes, labels, or styles while repairing Template semantic types and containment metadata.
- Chrome verification showed the target layout after reload and reported `Area / Group` for both requested groups without saving or deploying.
- Verification: reference layout test passed 1/1; saved restore tests passed 5/5; `pnpm harness:check`, `pnpm lint`, standalone `pnpm typecheck`, `pnpm build`, and `git diff --check` passed; two independent final reviews reported no findings.
- Known unrelated baseline: the full `pnpm test` attempt remains non-green on existing three-tier Template contract expectations in `packages/types`; the unchanged adapter convention test also remains non-green outside this feature path.

### 2026-07-15 - Merge latest dev into diagram positioning branch

- Fetched `origin/dev` and merged it into `feat/ck/391-diagram-positioning`.
- Preserved dev's deployment/GitOps persistence, production ECS speed, Web clarity/accessibility, dashboard copy, Brainboard Template, notification, and infrastructure updates.
- Preserved this branch's Repository ECS frontend diagram layout behavior, strict template preservation, and notification SSE reconnect-loop fixes.
- Resolved merge/stash conflicts only in `agent-progress.md`.

### 2026-07-15 - Diagnose deployment notification SSE reconnect loop

- Found the local API reconnect loop was caused by notification SSE closing and the frontend retrying every second.
- Confirmed local DB is behind the durable notifications migration: `notifications`, `notification_outbox`, and `web_push_subscriptions` are missing while Drizzle history only shows earlier applied migrations.
- Fixed SSE lifetime handling so idle streams stay open and added a regression for the no-immediate-event case.
- Stopped the frontend from starting the SSE stream when the initial durable Inbox load fails.
- Verification: focused API notification tests passed 17/17; focused Web notification tests passed 6/6; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Known local action: run `pnpm --filter api db:migrate:runtime` before testing deployment notifications locally.

### 2026-07-15 - Strict template preservation and readable support lanes

- Re-read the good/failure diagram references and tightened repository-generated template layout rules: selected template nodes are hard-preserved, generated support nodes are placed in a separate left-side support lane, and generated nodes cannot intrude into the template bounds.
- Strengthened the ECS repository-generated test to assert exact authored Template positions and sizes plus support-lane separation from the selected Template.
- Verification: focused workspace adapter test passed 45/45; public repository recommendation test passed 8/8; repository template recommendation test passed 10/10; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.

### 2026-07-15 - Preserve saved repository diagram manual layout

- Fixed saved DiagramJson restore so repository-generated diagrams are sanitized without re-running the generated layout pass and moving user/manual positions.
- Exposed `localCacheWorkspaceId` on `/workspace` project URLs to isolate stale local draft caches during browser recovery.
- Manually repaired the open `fqwf` project draft in Chrome: Template nodes now load at authored positions, generated repository nodes remain in a readable support lane, and the corrected board was saved back to the API draft.
- Verification: Chrome showed the corrected layout after reload; workspace draft restore test passed 5/5; focused workspace adapter test passed 45/45; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and final `pnpm harness:check` passed.

### 2026-07-15 - Restore real node visuals for repository ECS diagrams

- Treated `aws-region` Template presentation nodes as real area nodes so Region stays behind the diagram instead of rendering as an opaque card.
- Added fallback icon rendering for saved Browser, User/Client, GitHub Actions, and ECS Task Definition design nodes so they render as icon/resource-style nodes rather than `DESIGN` cards.
- Promoted repository-generated `aws_ecs_task_definition` Fargate Task nodes to real Terraform resource nodes on new conversion and saved draft restore, preserving deployable parameters while stripping diagram-only config from Terraform values.
- Confirmed ECS Task Definition remains enabled in the manual resource palette with parameter panel, Terraform Preview, and Terraform Sync capabilities.
- Verification: focused DiagramNodeView, workspace draft restore, resource catalog, workspace adapter, and flow mapper tests passed; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.

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

- Continue notification work separately from the completed repository diagram commit.
- Run local API DB migrations before testing deployment notifications locally.
