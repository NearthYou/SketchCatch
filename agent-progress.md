# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `feature/sw/370-live-observation-v2`.
- PR #366 preserves six Catalog-backed AWS Template Boards with 103 Terraform-deployable Resources and 28 parameterless Design nodes.
- The current `dev` Deployment/CI/CD console split is integrated without restoring the retired monolithic panel.
- Workspace deployment context counts only `isTerraformDeployableNode` results and passes that value into the Direct Deployment screen; CI/CD remains a separate screen.
- Migrations `0032` and `0033` came from `dev` and have not been executed by this gg workstream.

## Session Record

### 2026-07-14 - Live Observation v2 provider snapshot and AWS evidence

- Added the strict provider-neutral observation snapshot, Store enforcement, observer lease service, and authenticated AWS evidence refresh path.
- Added ALB request/error/p95 metrics, ASG and ECS/Fargate capacity, bounded redacted CloudWatch Logs, explicit unavailable/delayed stale-null behavior, and common operator UI evidence.
- Connected verified log-group Terraform outputs to deployment manifests and added the required ECS/Logs read permissions to AWS connection setup.
- Updated Redis Lua validation for manifest adapter v1/v2 and fixed the Windows integration runner; Redis 8 integration passed 31/31.
- Review follow-up bound refreshes to their Deployment, aligned completed metric periods, derived capacity from exact Target Group health, validated complete AWS ARN identity, expanded secret masking, and hardened Store error mapping plus abortable bounded caching.
- Second review follow-up replaced whole-LB request evidence with aligned Target Group 2xx/3xx/4xx/5xx classes and treats sparse classes as zero only when the same period has request evidence.
- Terraform output discovery now requires one coherent listener, LB, Target Group, runtime, scaling target, and runtime-owned log topology; ambiguous or contradictory graph evidence fails closed.
- Manifest materialization rejects simultaneous ASG and ECS capacity outputs.
- Third review follow-up requires exact aligned CloudWatch points with unique Complete query status, keeps shared ECS/ASG support chains from leaking sibling logs, and resolves only unique ASG alarm-to-policy ownership chains.
- Final Task 4 follow-up requires one complete ASG action/policy/LB/TG evidence chain and emits an ECS request threshold only for one non-contradictory policy independent of graph order.
- Kept one-hop proxy trust and repaired stale auth fixtures; spoofed-chain rejection remains covered.
- Verification: final Task 4 focused regression 76/76, API 1429/1429, harness, lint, typecheck, build, and whitespace checks passed.
- Risk: no credentialed AWS sandbox evidence and no Terraform Apply/Destroy, deployment mutation, database migration, or AWS mutation.

### 2026-07-13 - Integrate current dev into PR #366

- Merged `origin/dev` at `39118a79`, including the completed PR #368 Deployment/CI/CD console and Web baseline updates.
- Resolved the deployment conflict by keeping the new console adapter and moving the branch's deployable-Resource count contract into `DirectDeploymentScreen`.
- Preserved both Template regression contracts: the 103 deployable Resource total and the updated 26-node Live Observation baseline.
- Archived completed PR #368 and Template/PR #366 records instead of combining two stale active workstreams.
- Verification: no conflict markers or whitespace errors; 110 focused conflict regressions, harness, lint, typecheck, and build passed. Lint retains one pre-existing unused-argument warning.
- Root tests passed 1,325/1,328; the three failures are unchanged Windows-only path expectations shared by the pre-merge branch and `origin/dev`, not conflict-resolution regressions.
- Risk: no Terraform Apply/Destroy, AWS mutation, deployment API mutation, or database migration execution is part of this merge.

## Next Action

- Push the focused Live Observation follow-up commit, then confirm the branch PR is mergeable with no unresolved review thread.
- Run migrations and credentialed browser acceptance only with an approved safe environment.
