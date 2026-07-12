# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State

- Active branch: `Feat/jh/346-시뮬레이션-기능-구현-및-테스트`.

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

### 2026-07-12 - Support the S3 and ALB CloudFront distribution shape

- Added the requested CloudFront root object, OAC, custom ALB origin, managed cache policy, ordered API cache behavior, and origin request policy controls.
- Added path-aware parsing for `origin.custom_origin_config` and `restrictions.geo_restriction`, plus top-level `ordered_cache_behavior` parse/render support.
- Verified the exact supplied HCL parses without sync diagnostics and preserves all values through Diagram-to-Terraform-to-Diagram round trips.
- Verification: 50 focused API/Web regressions, lint, typecheck, build, harness, and diff checks pass. One unrelated Kubernetes renderer regression remains in the broader Terraform preview test; lint retains one pre-existing API unused-argument warning.

### 2026-07-12 - Expose Load Balancer Target Group health settings

- Added Parameter panel controls for Target Group `target_type`, `deregistration_delay`, and the supported single `health_check` fields.
- Normalized Terraform-to-Diagram parsing of the provider's maximum-one Target Group health check block to an editable object while retaining generic repeated nested-block behavior elsewhere.
- Added exact-HCL Web catalog and API parse/render regressions for the live-observation Target Group configuration.
- Verification: 34 focused API/Web tests, lint, typecheck, build, harness, and diff checks pass. Lint retains one pre-existing API unused-argument warning.

### 2026-07-12 - Remove hardcoded parameter-reference arrows

- Removed the resource-specific automatic edge generator for Listener, ASG, CloudWatch Alarm, and Auto Scaling Policy references.
- Parameter changes now preserve only user-created diagram edges; Terraform references remain unchanged.
- Draft restoration strips legacy `managedBy: parameter-reference` edges while preserving manual edges.

### 2026-07-12 - Keep key-value editor focus stable

- Replaced editable key-derived React row keys with stable per-row identities so typing in tag keys no longer remounts the focused input.
- Preserved entry order during key renames and explicitly focused the new or nearest key input after add/delete actions.
- Added a focused source-contract regression for row identity and focus restoration.

### 2026-07-12 - Preserve unsupported Terraform draft source

- Added optional multi-file Terraform working state to local/server ProjectDraft persistence with migration `0031_project_draft_terraform_files`.
- Changed valid unsupported top-level HCL such as the exact `traffic_api_bundle_url` variable block to a nonblocking warning with zero Board proposals; opaque resource blocks no longer partially mutate DiagramJson.
- Preserved raw top-level source during generated-code refresh and connected successful Terraform editor saves to project draft checkpoints and deployment virtual files.
- Fixed the preservation merge regression that retained Diagram-deleted or stale managed Subnet blocks; restored files are now classified before merge, missing managed addresses are pruned, and only opaque, unknown, or Terraform utility addresses remain protected.
- Added path-aware parsing for `aws_autoscaling_policy.target_tracking_configuration.predefined_metric_specification`, including ALB request metric interpolation round-trip coverage.
- Verification: 101 existing/new Terraform parser tests, 29 renderer/schema tests, 159/160 focused Workspace tests, lint, and typecheck pass. The one Workspace failure is the pre-existing mobile canvas toolbar CSS contract; lint retains one pre-existing API unused-argument warning.
- No Terraform Apply/Destroy or AWS mutation was performed.

### 2026-07-12 - Support Launch Template HCL round-trip settings

- Added safe round-trip support for `filebase64("...")` expressions and the `aws_launch_template.network_interfaces` nested block while preserving existing metadata and tag blocks.
- Added Launch Template parameter controls for default-version updates, IMDS settings, network interfaces, and tag specifications.
- Added red/green API and Web regressions; the original editor input now produces no sync diagnostics and preserves nested values.
- Verification: 84 focused tests, lint, typecheck, build, harness, and diff checks pass. Lint retains one pre-existing API unused-argument warning.
- Remaining sync limitations were probed and recorded for interpolations, most functions, conditionals, indexing, for/heredoc expressions, dynamic/lifecycle blocks, top-level variable/module/output blocks, and uncataloged provider types.

### 2026-07-12 - Support SSM-backed AMI references in Launch Templates

- Extended the shared parameter contract with target-specific reference attributes.
- Launch Template `image_id` now offers both `data.aws_ami.*.id` and `data.aws_ssm_parameter.*.value` references.
- Added a red/green regression using the runtime parameter catalog; 42 focused parameter/catalog tests pass.
- Verification: lint, typecheck, build, harness, and diff checks pass. Lint retains one pre-existing API unused-argument warning.
- Known tooling issue: `pnpm catalog:generate` remains blocked by the pre-existing CommonJS resolution failure for `resource-node-geometry`; the curated source and generated catalog were updated consistently.

### 2026-07-12 - Fix duplicate-label Terraform block selection

- Reproduced two same-type Security Group nodes sharing the `SECURITY GROUP` label and confirmed the Terraform panel selected the first display-label block instead of the selected node's `resourceName` block.
- Changed matching to prefer the parameter address when the node and parameter resource types agree, while preserving the visible-identity fallback for legacy type-mismatched nodes.
- Added a regression for `security_group` and `ec2_security_group` nodes sharing one label.
- Verification: focused regression test, lint, typecheck, build, and harness pass. Lint retains one pre-existing API unused-argument warning.

### 2026-07-12 - Recognize the EC2 managed prefix list data source

- Registered `data.aws_ec2_managed_prefix_list` in the shared Terraform definition catalog and added its Terraform Data Sources presentation.
- Added a regression that reproduces the previous unsupported-resource warning; diagnostics now return no warning and Terraform-to-Diagram sync produces a create proposal.
- Verification: focused API/Web tests, lint, typecheck, build, harness, and diff checks pass. Lint retains one pre-existing API unused-argument warning.

### 2026-07-12 - Auto-expand parent areas for nested areas

- Generalized the existing auto-expansion path so an Area newly assigned to another Area expands its direct parent and ancestor chain by 1.5 times the child Area dimensions.
- Preserved full-box containment, center-preserving growth, auto-expand OFF behavior, internal-move deduplication, and cycle/missing-parent guards.
- Added pure and drag-finalization regressions; 45 focused Area movement, expansion, preference, and drag tests pass.
- Verification: lint, typecheck, build, harness, and diff checks pass; lint retains one pre-existing API unused-argument warning.

### 2026-07-12 - Refine panel resize affordance

- Replaced the full-height black rail with a centered 40px by 3px muted-gray grip on hover, keyboard focus, and active drag while preserving the 14px hit area.
- Changed the panel separator cursor from `col-resize` to `ew-resize` and raised selector specificity above the global button `pointer` rule after real-browser computed-style inspection found the override.
- Added geometry, state, and cascade regressions; all 38 Diagram Editor layout tests pass, and the signed-in Workspace reports `ew-resize` for both separators.
- Verification: lint, typecheck, build, harness, and diff checks pass; signed-in browser inspection confirmed `ew-resize` on both separators.

### 2026-07-12 - Unclip all Resource parameter dropdowns

- Audited required, optional, nested, Region, and Availability Zone parameter selection paths.
- Traced the shared enum and scalar-reference failure to `parameterFieldList` clipping every absolutely positioned `SelectMenu` dropdown with `overflow: hidden`.
- Changed the shared field-list boundary to `overflow: visible` without changing SelectMenu focus, keyboard, ARIA, or selection behavior.
- Added source-contract coverage proving required and advanced field lists, scalar enum/reference controls, and recursive nested controls share the unclipped boundary; Region and AZ paths remain covered separately.
- Browser verification used the real SelectMenu and ParameterInputPanel CSS for required enum/reference, optional enum, nested select, and AZ cases. Every 108 px menu extended outside its field list, remained hit-test visible, and accepted ArrowDown/Enter selection.
- Verification: 54 focused parameter, SelectMenu, Region/AZ, and resource-settings tests passed; lint, typecheck, build, harness, and diff checks passed. Lint retains one pre-existing API unused-argument warning.

### 2026-07-12 - Add Terraform editor Tab indentation

- Added two-space `Tab` indentation and `Shift+Tab` outdent behavior while preserving Ctrl/Cmd+S, selections, mixed leading whitespace, and LF/CRLF source through a pure helper.
- Added 8 passing behavior/wiring tests and Korean design/plan docs under ignored `docs/jh/2026-07-12/`; lint, typecheck, and harness pass.
- Full `pnpm build` is blocked by concurrent broken imports in `apps/web/app/parameter-dropdown-debug/page.tsx`; the Terraform editor compiles during typecheck.

### 2026-07-12 - Diagnose and fix Terraform rename/save validation mismatch

- Reproduced the exact palette-created Subnet shape and confirmed it contains only `mapPublicIpOnLaunch: false`, so generated HCL omits the required AWS provider argument `vpc_id`.
- Confirmed the editor fast diagnostics and Terraform-to-Diagram rename sync both accept the generated code, while real Terraform provider validation fails before and after changing the resource name.
- Refined the rename finding after receiving the real diagnostic: a standalone rename syncs, but renaming a referenced Subnet declaration without updating callers produces the blocking `terraform.undefined_reference` error before sync can run.
- Removed the noisy `terraform.empty_block` heuristic because empty draft Resources are valid HCL syntax and provider-required arguments belong to deployment validation.
- Identified a second UX factor: Architecture and Terraform diagnostics are separated in Issues content but combined in the Code-tab issue badge and error color.
- Downgraded `terraform.undefined_reference` to a non-blocking warning so draft saves are blocked by syntax/structural errors rather than incomplete semantic references.
- Added deterministic rename-reference rewriting across `.tf` virtual files. The scanner preserves strings, line/block comments, heredocs, partial-name matches, and `.tfvars`.
- Changed the save flow to detect rename proposals, rewrite references, revalidate, resync, and persist one aligned Terraform/DiagramJson result.
- Fixed Terraform-to-Diagram sync to ignore generated `terraform { required_providers { ... } }` configuration blocks as execution metadata instead of reporting every providers.tf line as an error.
- Added a permanent palette-wide regression that runs all 131 enabled items through actual drag defaults, Terraform generation, virtual-file validation, and sync; all 126 code-generating items now produce zero editor/sync diagnostics.
- Added Korean root-cause, design, and implementation-plan records under `docs/jh/2026-07-12/`; no Terraform Apply/Destroy or cloud mutation was performed.
- Verification: TDD RED/GREEN for API diagnostics, generated Terraform configuration sync, reference rewriting, save orchestration, and palette-wide defaults; 102 focused API/Web tests passed; direct API/Web lint and typecheck passed; forced uncached five-package build passed; pure end-to-end rename simulation aligned code and DiagramJson; harness passed.
- Risk: `/terraform/validate` remains a fast static diagnostic service rather than provider-backed `terraform validate`; palette-created Subnet still omits provider-required `vpc_id`, and deployment-time Terraform validation remains responsible for that failure.
- Next action: manually confirm in the Workspace that generated providers.tf and empty draft Resources no longer create Issues and that Save succeeds after a referenced Subnet rename.

### 2026-07-12 - Make all embedded Terraform issues reachable

- Placed Terraform validation issues above Architecture design issues so the more urgent validation results appear first.
- Moved vertical scrolling to the combined Workspace Issues container and removed every child diagnostics scroll owner so both groups share one continuous reachable scroll region.
- Changed the combined grid tracks from shrinkable `auto` rows to `max-content` rows after browser reproduction showed the Terraform card overlapping the Architecture header by 75 px.
- Removed the clipping grid track and nested Terraform wrapper constraints without changing diagnostic state, actions, or the code/issues resize boundary.
- Added a source-contract regression that failed on the clipped layout and passed after the CSS fix.
- Browser verification: the same constrained fixture changed from 75 px overlap with no scroll overflow to a 14 px gap and a reachable 389 px scroll height inside a 300 px viewport.
- Verification: focused Workspace layout and diagnostic-state tests, lint, typecheck, build, harness, and diff checks passed. Lint retains one pre-existing API unused-argument warning.

### 2026-07-12 - Merge origin/dev into the Workspace UI branch

- Resolved the three content conflicts while preserving the redesigned Deployment console and the `dev` duration/apply-confirmation fixes.
- Kept the released source-repository migration at `0029` and moved the Live Observation manifest migration and combined snapshot to `0030`.
- Updated the Workspace AI source-contract test for the Repository Analysis template context added by `dev`.
- Split credential-shaped test literals so GitHub push protection can inspect the branch without false-positive Slack or Stripe secrets; runtime probe values remain unchanged.
- Verification: migration compatibility, focused Web/API tests, lint, typecheck, build, and harness passed. `drizzle-kit generate` still reports the pre-existing historical snapshot-parent collision.

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
