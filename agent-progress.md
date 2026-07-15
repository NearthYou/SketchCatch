# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State


- `origin/dev` was fetched and merged into this branch on 2026-07-15; incoming dev state includes the fail-closed three-stage sandbox orchestration contract, standalone AWS SAM and CodeDeploy application units, application-local static install roots, generated artifact cleanup, Web clarity/accessibility, dashboard copy, ECS deployment speed, and Brainboard Template updates.
- This branch still carries the Repository ECS frontend diagram readability fix, including good-reference layout criteria, strict template preservation, support-lane separation, and saved DiagramJson restore normalization.
- Before the merge, focused notification SSE fixes passed API notification tests 17/17, Web notification tests 6/6, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Before the merge, focused repository template layout tests passed: workspace adapter 45/45, public repository recommendation 8/8, repository template recommendation 10/10, plus `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Static, Lambda, EC2/ASG, rollback drills, QR public session, and Web Push provider delivery remain incomplete and must not be reported as passing.
- Incoming dev verification recorded 25 sandbox runner tests, 88 maintained API deployment tests, 40 maintained Web deployment tests, harness, lint, typecheck, build, and diff checks as passing; full Web/API suites were intentionally omitted.
- Incoming cleanup evidence records no remaining cost-bearing Issue #378 resources; no Terraform Apply/Destroy, deployment, Git handoff, or cloud mutation was performed during this code-integration pass.
- Repository Analysis now keeps evidence-anchored template priorities stable, provides detailed Korean recommendation copy and questions, and requires an inline project CI/CD connection before Architecture Draft creation.

## Session Record


### 2026-07-15 - Resume pending AWS connection setup after reload

- Reproduced the production settings regression where a pending AWS connection lost its account verification controls after a page reload and exposed only deletion.
- Added a pending-connection `설정 계속` action that refreshes the CloudFormation setup URL and restores the account ID verification flow from persisted connection data.
- Clear stale setup UI before reloading the saved connection, and isolate the restore behavior in a testable helper instead of source-text regex assertions.
- Added a red-green regression test for the reload recovery path; focused dashboard tests, harness, lint, typecheck, build, and diff checks pass.
- The full Web baseline remains non-green on unrelated existing Diagram/Area contract tests; no cloud mutation, deployment, Git handoff, or credential change was performed.


### 2026-07-15 - Localize Repository Draft and require inline CI/CD connection

- Replaced the optional CI/CD handoff checkbox and Settings detour with project-scoped GitHub connection controls in the existing dev UI; draft progression now fails closed until an active Source Repository exists.
- Added compact red inline feedback above the confirmation action, detailed Korean reasons/tradeoffs, and Korean normalization for known follow-up questions from stale responses.
- Reproduced the live `whiskend/audience-live-check` regression where AI confidence reordered 3-tier above Fargate. Evidence-anchored deterministic primaries can no longer be displaced by AI ranking, and the public analysis cache namespace was advanced.
- Live public analysis verified ECS Fargate 0.91, 3-tier 0.78, and EKS 0.63 with ECS Fargate as the top-level recommendation. Browser QA verified the existing dev layout, inline connection controls, and fail-closed interaction; the temporary local account was deleted.
- Verification: focused API tests passed 13/13; focused Web tests passed 14/14; required harness, lint, typecheck, build, and diff checks passed. Full `pnpm test` remains non-green only on the known three-tier Template position/parent contract failures in `packages/types`.

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

### 2026-07-15 - Restore production Amazon Q deployment configuration

- Found that the active ECS API task definition preserved disabled Terraform defaults even though the GitHub production environment contained the intended Amazon Q settings.
- Updated the ECS deployment workflow to require, validate, and inject the production Amazon Q runtime configuration; added a structural regression check for the contract.
- Added least-privilege `qbusiness:ChatSync` permission for the configured application to the production API task role and completed the missing GitHub production environment variable.
- Verification passed: focused production infrastructure check, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Production ECS deployment was not run following the user's explicit instruction.

### 2026-07-15 - Restore CI/CD pull request creation in the deployment console

- Restored the Git/CI/CD handoff entry point in `CicdConsoleScreen` against the current backend contract rather than copying the reverted legacy panel.
- The UI selects the latest directly approved Terraform apply plan, requires an explicit review, and sends the server-recorded approved plan artifact as `userAcceptedChangeId` when creating the deployment PR.
- Existing handoffs expose the PR link and separately approved Repository settings, GitHub OAuth, and AWS Role actions while duplicate handoffs for the same plan are blocked.
- Verification: focused Web regressions passed 5/5; Web typecheck and build passed. No GitHub deployment PR or cloud mutation was executed during verification.

## Next Action

- Review and merge `codex/fix-production-amazon-q-runtime`; run the production ECS deployment only after explicit approval.
- Review and apply the approved production Terraform change, then re-run the signed-in production browser loop to confirm the AWS Console launch link is rendered.
- Continue notification work separately from the completed repository diagram commit.
- Run local API DB migrations before testing deployment notifications locally.
