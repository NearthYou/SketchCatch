# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `fix/gg/355-review-followup-v2`.
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
- Verification: combined API 217/217, focused Web 74/74, Redis 31/31, harness, lint, typecheck, build, and whitespace checks passed.
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

- Commit and push the resolved merge, then confirm GitHub reports PR #366 mergeable with no unresolved review thread.
- Run migrations and credentialed browser acceptance only with an approved safe environment.
