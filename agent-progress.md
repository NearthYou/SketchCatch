# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feat/gg/409-architecture-board-compiler-chat`.
- Latest `origin/dev` is merged at `cb3ead40`; the branch contains the current Workspace AI Chat and Architecture Board Compiler commits.
- 000 Architecture Board Compiler is implemented as `architecture-board-compiler/v3`: versioned 29+1 Template knowledge, original/presentation/semantic candidates, semantic containment repair, complete visible diff recording, and source-exact compiled variants are in place.
- AI Draft, Board automatic organization, Reverse Engineering, and Template review use the same Compiler interface. AI and Repository starts show a proposal summary and only save after `Board에 적용`.
- Latest focused Compiler/AI/Repository suite passed 27/27; knowledge and evidence checks, `pnpm harness:check`, `pnpm lint`, and root `pnpm typecheck` passed.
- Known unrelated baseline: `pnpm test` stops at three existing `packages/types` three-tier Template contract failures; `pnpm build` stops at the pre-existing missing `apps/web/.codegraph` path.
- No migration, DB schema change, Terraform execution, cloud mutation, or Git/CI/CD handoff was performed.
- The 001 Workspace AI Chat commit is already present independently on this integration branch. Uncommitted clipboard work remains outside the 000 Compiler commit.
- Incoming dev includes a least-privilege `aws-connections/*` S3 permission repair and Repository ECS live-deployment profile support. Neither Terraform change has been applied by this branch.

## Session Record

### 2026-07-15 - Implement Architecture Board Compiler 000

- Implemented the versioned 29-usable-Template knowledge policy, provenance ranking, source-exact compiled variants, protected-node layout preservation, viewport/presentation state handling, and visible edge/viewport diff accounting.
- Connected the same proposal contract to AI Draft, Board automatic organization, Reverse Engineering, and Template review. Repository-based draft creation now stages a compiled Board review instead of saving immediately; AI and Repository review show score, distance, grouped changes, diagnostics, and evidence before user application.
- Updated the 000 design record with implemented behavior and verification commands. `ARCHITECTURE-BOARD-COMPILER-409` remains in progress because the aggregate feature includes separately owned 001 AI Chat completion.
- Verification passed: `pnpm harness:check`, focused 27-test Compiler/AI/Repository suite, `pnpm architecture-board-knowledge:check`, `pnpm architecture-board-evidence:generate`, `pnpm architecture-board-evidence:check`, `pnpm lint`, and `pnpm typecheck`.
- Known baselines: root `pnpm test` fails only in three existing three-tier Template contract checks in `packages/types`; root `pnpm build` fails before compilation because `apps/web/.codegraph` is absent. The unauthenticated local browser redirected to login, so visual review was covered by component/source contracts rather than a live authenticated flow.

### 2026-07-15 - Rebuild the Workspace AI launcher

- Removed the Sparkles-only launcher JSX and all legacy `.aiChatLauncher` rules from the shared Workspace stylesheet.
- Added a focused 44px black AI monogram launcher component and isolated CSS module following the DESIGN.md CTA, radius, type, focus, and reduced-motion rules.
- Chrome QA confirmed the 44x44 launcher does not overlap the deployment notification, opens the existing dock, and receives focus again after Escape closes the dock.
- Verification: AI Chat focused tests passed 14/14; lint, typecheck, production build, harness, and diff checks passed. The full test command remains non-green only on three existing three-tier Template geometry/parent contract failures.

### 2026-07-15 - Restore the production AWS Console launch permission

- Added a least-privilege ECS API task-role statement for the S3 prefix used by generated AWS connection CloudFormation templates.
- Verification passed: `terraform fmt -check -recursive`, `terraform validate`, `terraform test` (2/2), `pnpm harness:check`, `pnpm lint`, and `pnpm typecheck`.
- `pnpm build` exceeded the local two-minute command limit without emitting a build error; no Terraform apply, deployment, or cloud mutation was performed.
- The existing Terraform mock-provider test cannot observe configured IAM document contents at plan time, so no weak source-coupled regression assertion was retained.

### 2026-07-15 - Enable the current Repository ECS diagram for Terraform Plan and live deployment

- Added the six missing `practice` live-apply resource types used by the current Board: EIP, NAT Gateway, ECR Repository, CloudFront Origin Access Control, S3 Bucket Policy, and S3 Object.
- Separated read-only Terraform Plan resource validation from the narrower live-apply profile while keeping approval, Apply, and Destroy execution fail-closed against the selected live profile.
- Removed Diagram Template metadata from Terraform rendering and marked the visual Fargate runtime as reference-only so the deployable control-plane Task Definition is emitted exactly once.
- Browser verification on the local `frsgf` Board found 33 Terraform resources across the expected 24 types, zero `template_id` attributes, zero empty Task Definitions, and one real Task Definition block.
- Verification: focused API/Web regressions passed 9/9; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `scripts/init-harness.ps1 -Full`, and `git diff --check` passed. No Terraform Apply/Destroy or cloud mutation was performed.

### 2026-07-15 - Diagnose missing production AWS Console launch link

- Reproduced the production-only AWS connection setup regression in the signed-in settings page: the CloudFormation setup rendered an inline YAML template and no `AWS Console 열기` link.
- Traced the response to the S3 publisher fallback. `S3_BUCKET_NAME` is wired into the ECS API environment, but the API task role lacks `s3:PutObject` and `s3:GetObject` for `aws-connections/*`.
- Ruled out a Web/API response-contract mismatch because the same response successfully rendered `roleName` and `templateBody`; the launch link is conditional only on `launchStackUrl`.
- Verification: `pnpm harness:check` passed; the production browser loop reproduced the missing link twice. No cloud mutation, Terraform apply, or source-code fix was performed.

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

### 2026-07-15 - Architecture Board Compiler design

- Created `feat/gg/architecture-board-compiler` from the latest `origin/dev` and kept the unrelated Workspace AI chat commits on their original branch.
- Defined an unconstrained, proposal-only Architecture Board Compiler with one deep in-process interface, full semantic and visual change authority, Compilation Distance, diff/diagnostic provenance, and four integration surfaces.
- Recorded the domain language, ADR, product/architecture/data-model contracts, and a gg design reference covering the 29 usable Template corpus, scoring, feasibility, risks, and implementation order.
- Verification passed 29 focused Brainboard registry/source and automatic layout tests, `pnpm harness:check`, and `git diff --check`. No source code, DB schema, migration, cloud, Deployment, or GitHub state was changed.

### 2026-07-15 - Consolidate Workspace AI chat and Architecture Board Compiler

- Created Issue #409 and pushed `feat/gg/409-architecture-board-compiler-chat` as the single integration branch for the Workspace AI chat refactor and Architecture Board Compiler work.
- Merged the prior AI chat and compiler branches, kept the AI chat and compiler worktree changes, union-merged independent Workspace CSS additions, and accepted the current dev removal of the obsolete right-panel aggregate test.
- Deleted the two replaced local branches only after both were ancestors of the integration branch; neither replaced branch had a remote counterpart.
- Verification passed `pnpm harness:check`, staged and unstaged `git diff --check`, and a conflict-marker scan. The retained autostash is a recovery backup for the in-progress worktree changes.

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

- Review the current integration PR after the latest dev merge; leave the independently committed 001 work and uncommitted clipboard work untouched for their owner.
- Apply the separate, approved production Terraform permission change and re-run the signed-in production AWS Console launch verification when that workstream is resumed.
