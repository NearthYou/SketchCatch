# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Production AWS connection setup currently falls back to the inline CloudFormation template instead of rendering `AWS Console 열기`. Browser evidence on `https://sketchcatch.net/dashboard/settings` showed one setup wizard, zero launch links, and one inline template.
- Root cause: the API publishes to `aws-connections/<connectionId>/cloudformation-template.yaml`, while the production ECS API task role only permits S3 object access under `projects/*` and `deployments/*`; the publisher failure is intentionally converted to the inline fallback without logging.
- A local Terraform fix now grants only the ECS API task role `s3:PutObject` and `s3:GetObject` on `aws-connections/*`; it has not been applied to production.
- Branch: `feat/ck/391-diagram-positioning`.
- `origin/dev` was fetched and merged into this branch on 2026-07-15; incoming dev state includes the fail-closed three-stage sandbox orchestration contract, standalone AWS SAM and CodeDeploy application units, application-local static install roots, generated artifact cleanup, Web clarity/accessibility, dashboard copy, ECS deployment speed, and Brainboard Template updates.
- This branch still carries the Repository ECS frontend diagram readability fix, including good-reference layout criteria, strict template preservation, support-lane separation, and saved DiagramJson restore normalization.
- Before the merge, focused notification SSE fixes passed API notification tests 17/17, Web notification tests 6/6, `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Before the merge, focused repository template layout tests passed: workspace adapter 45/45, public repository recommendation 8/8, repository template recommendation 10/10, plus `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Static, Lambda, EC2/ASG, rollback drills, QR public session, and Web Push provider delivery remain incomplete and must not be reported as passing.
- Incoming dev verification recorded 25 sandbox runner tests, 88 maintained API deployment tests, 40 maintained Web deployment tests, harness, lint, typecheck, build, and diff checks as passing; full Web/API suites were intentionally omitted.
- Incoming cleanup evidence records no remaining cost-bearing Issue #378 resources; no Terraform Apply/Destroy, deployment, Git handoff, or cloud mutation was performed during this code-integration pass.
- Repository Analysis now keeps evidence-anchored template priorities stable, provides detailed Korean recommendation copy and questions, and requires an inline project CI/CD connection before Architecture Draft creation.

## Session Record

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

### 2026-07-15 - Decouple GitHub App connections from login identity

- Added migration `0043_github_installation_connections` and persisted GitHub App installation ownership by SketchCatch `user_id`, independent of password/Naver/Kakao/GitHub login identity.
- Added signed setup state, PKCE user authorization, and GitHub `/user/installations` verification before accepting an installation; provider user tokens and code verifiers are not persisted.
- Removed the GitHub-login-only gate and copy, added disconnected-state handling, and routed the setup callback through provider verification before repository selection.
- Fixed the direct provider callback so it restores the initiating user from signed state plus the HttpOnly PKCE cookie and does not require a browser Bearer header.
- Verification: focused API tests passed 12/12; focused Web tests passed 6/6; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm migration:compatibility:check`, `terraform fmt -check -recursive`, and `pnpm test:terraform` passed. Standards and spec reviews reported zero remaining findings.
- Known unrelated baseline: full `pnpm test` remains non-green on the existing three-tier Template position/parent expectations in `packages/types`; changed-path tests are green.
- Operator next action: configure the GitHub App client ID and client secret, register the user-authorization callback URL, apply migration 0043 through the reviewed production workflow, and redeploy the API before production login-method verification.

## Next Action

- Review and apply the approved production Terraform change, then re-run the signed-in production browser loop to confirm the AWS Console launch link is rendered.
- Continue notification work separately from the completed repository diagram commit.
- Run local API DB migrations before testing deployment notifications locally.
