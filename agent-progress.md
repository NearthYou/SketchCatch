# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State

- Active branch: `fix/ys/348-trivy-로직-수정`.

- Release `v2.0.0` uses main SHA `44cdc976da8a03fca2d0aad69a0f3d45d51d4e8a`.
- Route53 points to the direct-path ECS ALB. Public `/`, `/health`, and `/health/db` return 200; protected `/api/projects` returns 401.
- API and web are active at desired/running 1 with Application Auto Scaling min 1 and max 2.
- The legacy ECS service is absent from `list-services`, its task definition is inactive, and its target group is deleted.
- The old EC2 instance, old ALB, and legacy CloudFormation ALB stack are deleted.
- Cold rollback retains encrypted AMI `ami-0a65f0b7656bf2221`, encrypted snapshot `snap-04862810b1ed8a101`, and the verified SHA-pinned S3 Docker archive.
- RDS is encrypted and available with deletion protection and seven-day backups; it remains Single-AZ for cost control.
- Production username/password signup and login are healthy after rotating the invalid one-character auth token secret; OAuth client ID injection is pending this hotfix deployment.
- Container log alarms keep ALARM notifications while suppressing repetitive OK notifications, require two consecutive error periods, and exclude stale Next.js Server Action requests from the web metric.

## Session Record

### 2026-07-12 - Merge latest dev into template QA branch

- Fast-forwarded local `dev` to `origin/dev` at `f5908be3` and merged it into `fix/gg/qa-followup`.
- Preserved catalog-backed Template materialization, containment layout, and the Live Observation 40px grid while adopting the S3 Website traffic endpoint from `dev`.
- Verification: 27 focused Template tests, harness, lint, and typecheck passed; lint retained one existing unused-argument warning.
- Full build remains blocked by the pre-existing missing `apps/web/.codegraph` path.

### 2026-07-12 - Restore local signup availability QA path

- Goal: Resolve the signup duplicate-check server error and align the paired password inputs during local QA.
- Completed:
  - Applied the existing local database migrations; the initial Postgres database had no relations, so availability requests could not query `users`.
  - Set authentication form fields to start-align their internal grid content so password help text no longer pushes the confirmation input down.
  - Added focused source-contract coverage for the password field alignment rule.
- Verification:
  - `POST /api/auth/signup/availability` returned `200 {"usernameAvailable":true}` after migration.
  - Focused signup page test passed.
- Risk:
  - The pre-existing full web test suite has unrelated failures outside the signup files.

### 2026-07-12 - Restore Destroy Plan follow-up actions

- History keeps `Destroy Plan 생성` before planning, shows regeneration plus approval after planning, and shows regeneration plus Destroy execution after approval; explicit API approval snapshot checks remain intact. Focused action tests passed 22/22, and lint, typecheck, build, diff check, and harness passed; browser visual verification was unavailable after the local tab interruption.

### 2026-07-12 - Merge origin/dev into the Workspace UI branch

- Fetched `origin/dev` at `53ca1c04` and merged it into `fix/ys/348-trivy-로직-수정`.
- Restored the current Workspace screen, diagram editor, parameter/resource panels, and Deployment console from `60890f31`; accepted `dev` changes outside that protected UI scope.
- Combined multi-file Terraform Plan inputs with the existing artifact-SHA Trivy snapshot cache, and adopted the server-owned Git/CI/CD approval request contract without changing the visible Deployment flow.
- Added only cross-boundary compatibility for new resource labels, template preview visibility, cancellable cost requests, and updated safe/unsafe deployment fixtures.
- Verification: focused Web tests passed 155/155, focused Deployment/API tests passed 108/108, and lint, typecheck, build, diff check, and harness passed; no cloud apply or destroy ran.

### 2026-07-11 - Coalesce Architecture Board direct-drag previews

- Applied the documented rAF follow-up on the current branch. `onNodeDrag` now keeps only the latest payload and commits preview nodes plus Area targeting once per animation frame.
- Preserved final drop behavior by synchronously committing the `onNodeDragStop` payload, flushing a pending payload during visibility finalization, and cancelling a queued frame on unmount.
- Added the source-contract regression for rAF scheduling, final-payload flush, and cleanup. Independent review found no runtime correctness defect; it noted that the scheduler coverage is source-contract rather than callback-behavior testing.
- Updated the ignored local `docs/jh/011_아키텍처보드_노드드래그_렌더링최적화_개선안_JH.md` implementation record and measurement caveat.

### 2026-07-11 - Double new palette Area node dimensions

- Doubled width and height only for Area nodes newly dragged from the Resource palette.
- Kept Catalog, AI, Module, Template, Terraform sync, and existing DiagramJson sizes unchanged.
- Reused one pure transformer for drag preview and final drop geometry.

### 2026-07-11 - Add resource connection policy and four-direction ports

- Added a provider-neutral default-allow connection evaluator with isolated AWS relationship-resource restrictions for new manual Board edges.
- Reused the same policy for drag target affordance and the final edge creation guard.
- Enabled source and target Handles on all four sides while preserving user-directed edge orientation and existing lock, self, and duplicate guards.

### 2026-07-11 - Draft the Resource Dependency Rule Engine design

- Added `docs/jh/010_리소스의존성규칙엔진설계_JH.md`, a Korean AWS-first, provider-neutral design for declarative resource-dependency rule packs and a shared Architecture Graph evaluator.
- Defined no-toast creation behavior, contextual versus full validation, Architecture/Terraform diagnostic separation, the EC2 AMI/VPC/Subnet scenario, AWS-first initial rule packs, safety boundaries, and acceptance tests.
- Wrote `docs/superpowers/plans/2026-07-11-resource-dependency-rule-engine.md`, a TDD implementation plan for the shared evaluator, EC2/VPC/Subnet v1 rule pack, Preview API revalidation, derived Board state, Issues UI, and full verification.
- Implemented v1 on the current branch: shared diagnostic contracts, a deterministic provider-neutral evaluator boundary, and an AWS VPC/Subnet/EC2 rule pack.
- The Board evaluates contextual diagnostics after a 300 ms debounce without creating a toast or persisting data. Terraform Preview re-evaluates the current diagram and returns diagnostics alongside generated code.
- The Issues view renders Architecture diagnostics separately from persisted Terraform source diagnostics and can focus the affected Board resource.
- Added focused evaluator, diagnostics-state, API, and Workspace layout tests. No Terraform apply, deploy, or cloud mutation was performed.

### 2026-07-11 - Create the Korean Operational Excellence study set

- Reworked the 226-page AWS Well-Architected Operational Excellence Pillar into fourteen top-down Korean study documents under `docs/jh/study`.
- Covered the introduction, eight design principles, all 68 best practices from OPS01-BP01 through OPS11-BP09, the conclusion, glossary, revision history, and source notices.
- Kept each OPS area as an approximately one-hour learning unit with plain-language explanations, expert implementation detail, SketchCatch examples, retrieval questions, and a master evidence checklist.
- Replaced the old `docs/jh/study.md` notes with a short entry point to the complete study set.

### 2026-07-11 - Redesign and harden the Workspace Deployment console

- Rebuilt Deploy around the five-step Direct Deployment flow: save, preflight, plan, approval, and apply.
- Added an explicit Local workspace gate that prevents AWS connection and project Deployment requests until a real project exists.
- Separated Direct Deployment, Git/CI/CD, and Deployment History; moved Destroy controls to History.
- Added the approved 224px / flexible / 294px console layout, responsive mobile flow, neutral preflight state, unified active-step errors, and keyboard/focus handling.
- Preserved the existing server action gates, approval snapshots, polling/SSE, request payloads, and Terraform execution boundaries.
- Browser acceptance used intercepted Project responses only. No Apply, Destroy, Git handoff, or cloud mutation was executed.

### 2026-07-11 - Resolve and integrate PR #317 and PR #343 review feedback

- Confirmed the missing `SourceRepositoryConflictError` import reported on PR #317 was already present, documented the resolution, and merged the green PR into `dev`.
- Fixed PR #343 so the Apply confirmation opens when apply becomes available but can still be dismissed, with a focused regression test.
- Reconciled PR #343 with the merged template work from PR #317 while preserving archive parser hardening, generated Lambda/EKS support, and direct-deployment evidence.
- Verification: focused deployment apply, Terraform artifact safety, and Apply confirmation tests passed; required repository checks were run before integration.

### 2026-07-11 - Retire warm rollback and complete cost-first ECS operations

- Deployed and released the main SHA, aligned API/web/worker images, and verified the one-off worker migration command.
- Sanitized the retired EC2 host before creating an encrypted cold rollback AMI; removed the duplicate unencrypted AMI and snapshot.
- Deleted the EC2 instance, old ALB stack, legacy ECS service/task registration, target group, and port 80 rules.
- Added API/web autoscaling min 1 and max 2, circuit-breaker-preserving service ownership, low-cost alarms, and confirmed SNS delivery.
- Replaced EC2 migrations with approved ECS one-off worker migrations, pre-migration snapshots, a compatibility guard, and three-snapshot retention.
- Removed retired deployment/HTTPS workflows and reduced the GitHub deploy role to ECR, ECS, worker, scoped snapshot, and SNS permissions.
- Added a disabled-by-default cold rollback Terraform root with scoped RDS/Redis access and documented restore procedures.

### 2026-07-11 - Integrate latest dev into Live Observation PR

- Merged the latest `origin/dev` UI rebuild and ECS production changes into PR #328 while preserving Live Observation and Board behavior.
- Kept the ECS deployment workflow and removed the retired EC2 deployment workflow.
- Reconciled the new Workspace shell, Board viewport behavior, Resource panel extraction, and Live Observation styles.

## Verification

- `pnpm harness:check` (passed)
- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/drag-transaction.test.ts features/diagram-editor/flow-mappers.test.ts features/diagram-editor/DiagramNodeView.test.ts features/diagram-editor/diagram-editor-layout.test.ts` (105 passed)
- `pnpm lint` (passed; one existing, out-of-scope API unused-argument warning)
- `pnpm typecheck` (passed)
- `git diff --check` (passed)
- `pnpm --filter @sketchcatch/web build` (Next production compile passed; lock cleared and `BUILD_ID` generated)
- `pnpm build` (passed; all five workspace build tasks completed successfully)

- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/palette-area-node-size.test.ts features/diagram-editor/diagram-editor-layout.test.ts features/resource-settings/catalog.test.ts` (52 passed)
- `pnpm harness:check` (passed after implementation)
- `pnpm lint` (passed after implementation)
- `pnpm typecheck` (blocked by three concurrent, user-owned `cachedNodesById` option errors in `flow-mappers.test.ts`)
- `pnpm build` (passed after implementation)
- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/resource-connection-policy.test.ts features/diagram-editor/flow-mappers.test.ts features/diagram-editor/DiagramNodeView.test.ts features/diagram-editor/diagram-editor-layout.test.ts` (86 passed)
- `pnpm --filter @sketchcatch/web test` (859 passed, 5 unrelated existing failures: dashboard timezone copy, projects route expectation, and three AWS priority inventory parser checks)
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm harness:check` after the design document and progress-log update
- Placeholder scan of `docs/jh/010_리소스의존성규칙엔진설계_JH.md`: zero `TBD`, `TODO`, `FIXME`, or unresolved-decision markers
- Placeholder scan of `docs/superpowers/plans/2026-07-11-resource-dependency-rule-engine.md`: zero implementation-plan placeholders
- `pnpm harness:check` after the implementation-plan and progress-log update
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/architecture-dependency-rules.test.ts` (1 passed)
- `pnpm --filter @sketchcatch/types typecheck` (passed)
- `pnpm --filter @sketchcatch/web typecheck` (blocked by pre-existing `FlowMapperOptions.cachedNodesById` test/type mismatch)
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/architecture-dependency-rules.test.ts features/workspace/architecture-diagnostics-state.test.ts features/workspace/terraform-issues-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` (99 passed)
- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/terraform.test.ts` (19 passed)
- `pnpm lint` (passed)
- `pnpm typecheck` (passed)
- `pnpm build` (passed)
- Study coverage check: 14 files, 68 expected unique OPS best-practice IDs, 68 found, zero missing or unexpected IDs
- Local Markdown link check: 15 files checked, zero broken local links
- `git diff --check`
- `pnpm harness:check`
- `pnpm exec tsx --test features/workspace/deployment-*.test.ts features/workspace/pre-deployment-*.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/workspace-right-panel-layout.test.ts` (130 passed)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Playwright CLI: Local gate at 1280x720 and 390x844; mocked Project Direct/Git/History views at 1280x720
- Evidence: `output/playwright/deployment-console/local-desktop.png`, `local-mobile.png`, `project-five-step.png`


## Risk

- The rAF follow-up is contract- and focused-test verified, but the current local fixture retained only one node. The 1-node hot-dev measurement (`p95 50.1ms` versus control `18.7ms`) is not comparable to the earlier 12-node baseline and does not prove the target has been met.
- The new scheduler test is a source contract. Extracting and behavior-testing the coalescer with controlled rAF callbacks would strengthen future regression coverage.

- The 2x multiplier is intentionally limited to the Resource palette drop boundary; other diagram creation paths retain their existing Area sizes.
- The connection policy intentionally defaults to allow, so unrelated pairs remain possible until an evidence-backed restricted relationship rule is added.
- The Web full suite still has five failures outside the diagram editor change set; focused diagram tests, lint, typecheck, and build pass.
- `docs/jh/` is intentionally gitignored as a personal documentation area, so the new study files exist locally but are not included in normal Git status or commits unless explicitly force-added or the ignore policy changes.
- The source edition is dated 2024-11-06; AWS service capabilities and support terms should be checked against current official documentation before implementation.
- Full-suite failures outside the Live Observation change set still block branch integration.
- A one-task baseline has no steady multi-AZ application redundancy; autoscaling is cost-first and reacts to CPU load, not AZ failure.
- RDS is Single-AZ. Deletion protection, seven-day backups, pre-migration snapshots, and the restore runbook reduce but do not remove outage risk.
- External customer execution roles may still need the worker task principal added to their trust policy.
- Cold rollback has a longer RTO than the retired warm path and has static validation but no post-sanitization restore drill.

## Next Action

- Recreate the 12-node local Board fixture in a stable server session and rerun the identical pointer-down performance trace before claiming the 60fps target.

- Expand the restricted connection list only for AWS relationships with unambiguous counterpart evidence and regression tests.
- Expand the Resource Dependency Rule Engine with evidence-backed rule packs beyond the implemented VPC/Subnet/EC2 v1 scope.
- Begin with `docs/jh/study/000_운영우수성_학습가이드_JH.md` and use the OPS documents as one-hour study units.
- Review the Deployment console changes on the current Workspace UI/UX branch and commit them when the user requests Git publication.

### 2026-07-12 - Trivy deployment-safety accuracy and latency

- Added exact S3 rule mappings, `{resourceAddress, riskFamily}` grouping, highest-severity selection, and preserved `trivyRuleIds` evidence.
- Removed AI generation from the synchronous check response and added per-finding lazy explanation loading.
- Added five-minute content/policy/ignore-rule cache, Runtime Cache sharing, startup warmup, and same-key single-flight execution.
- Reused the shared Trivy snapshot between the button check and Terraform Plan when artifact content is unchanged.
- Added an immediate in-process gate for Public S3, open SSH, Public RDS, and IAM wildcard; Trivy now completes in the background and the UI merges its result without delaying Plan creation.
- Kept high findings visible in the Plan summary without using them as an approval blocker; existing legacy `blocksApproval` metadata is also ignored by the Plan approval UI and API.
- Updated the canonical product safety policy and documented `blocksApproval` as compatibility metadata that Direct Plan approval does not enforce.
- Fixed the Direct Deployment step loop so an existing unapproved apply Plan hides regeneration and advances to Plan approval.

## Verification

- `pnpm harness:check` passed.
- `pnpm lint` passed with one existing unused-argument warning in `live-observation-store-contract.ts`.
- `pnpm typecheck` passed when run after the Next.js build completed.
- `pnpm build` passed for all five workspaces.
- Focused scanner, API, approval, Plan, Apply, Destroy, and Workspace tests passed; the immediate gate route measured about 41 ms in the controlled test.
- `pnpm test` found four unrelated existing web failures; none of their files differ from `origin/dev`.

## Risk

- The deterministic Terraform gate is intentionally limited to four high-value risk families and is not a full HCL evaluator; Trivy remains the deep scanner.
- The full web suite baseline failures remain in diagram toolbar CSS expectations, dashboard projects route expectations, a missing ignored personal docs inventory, and a stale resource catalog count.

## Next Action

- Exercise the Direct Deployment preflight UI against a running local API before PR publication.
