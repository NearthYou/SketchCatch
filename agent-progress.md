# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/` and remain available in Git history.

## Current Verified State

- Branch `fix/sw/live-observation-deployment-picker-layering` contains the current Live Observation work after the resolved `origin/dev` merge.
- Live Observation renders bounded traffic motion, a task-count-responsive Fargate fleet, and a default-collapsed operational analysis. Development-only traffic and Task preview controls are no longer exposed.
- Deployment manifest materialization accepts exactly one Terraform-style target-tracking configuration block while rejecting empty or ambiguous arrays.
- Delayed first CloudWatch points retain request, capacity, and log evidence instead of collapsing the first session to zero. Stopped sessions no longer continue the countdown.
- The approved sandbox run sent exactly 963 requests and received 963 HTTP 200 responses. CloudWatch initially reported 721 requests; ECS remained at running/desired `1/1` with no scale-out activity during the immediate check.
- The failed observation acceptance triggered approved immediate cleanup. All `liveobs-7cccab4b` AWS resources were verified absent in account `614935468487`, region `ap-northeast-2`.
- Deployment `57bda2bf-88af-4e15-8674-0b2ef20f1e8c` is `DESTROYED` with cleared state and current-plan pointers.
- Verification passes: `pnpm harness:check`, API Live Observation tests 64/64, Web Live Observation tests 71/71, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- `feature_list.json` retains one separately owned aggregate `in_progress` item: `ARCHITECTURE-BOARD-COMPILER-409`.

## Session Record

### 2026-07-20 - Exercise and fail closed the Live Observation traffic run

- Sent the approved maximum of 963 bounded requests; all returned HTTP 200 and no additional traffic was generated.
- Diagnosed the missing animation as delayed CloudWatch evidence being discarded before the first available snapshot, then retained current metrics, capacity, and logs in delayed snapshots with a regression test.
- Stopped the countdown when no active session exists and removed the temporary development-only traffic and capacity buttons.
- The automatic Destroy Plan was blocked by internal deployment-state storage access for the sandbox operator. After exact account and resource inventory checks, manually removed only the `liveobs-7cccab4b` resource set through the approved execution role.
- Verified CloudFront, OAC, S3, ECS, Application Auto Scaling, ALB, Target Group, ECR, CloudWatch Logs, IAM workload roles, VPC, subnets, route tables, NAT/EIP, security groups, and IGW are absent, then closed the Deployment as `DESTROYED`.

### 2026-07-20 - Restore Live Observation manifest eligibility

- Reproduced the 409 as a persisted `manifest_invalid` record and isolated materialization before AWS topology verification.
- Normalized exactly one Terraform-style `targetTrackingScalingPolicyConfiguration` block while continuing to reject empty or ambiguous block arrays.
- Aligned the local and example `SKETCHCATCH_PUBLIC_BASE_URL` with the active HTTPS Web origin.

### 2026-07-20 - Refine Live Observation presentation

- Removed the fake empty Task slot, bounded high-volume traffic to representative particles, and added request-based capacity projection while preserving provider-confirmed Tasks as authoritative.
- Replaced equal raw-metric cards with a default-collapsed operational analysis and aligned its typography and surfaces with Workspace tokens.
- Kept QR closed by default and anchored its utility below the QR button.

## Known Risk

- Live animation and scale-out remain unaccepted end-to-end. The bounded requests reached CloudFront, but the active UI session missed them before the delayed-snapshot fix; no provider-confirmed scale-out occurred before cleanup.
- The internal deployment-state bucket did not grant the sandbox operator read access, so automatic Destroy Plan could not restore Terraform state. Manual cleanup completed and AWS absence was verified, but the orphaned internal state object remains for normal storage pruning.
- Root `pnpm test` still stops at the pre-existing `packages/types/src/git-cicd-readiness-contract.test.ts:117` assertion (`null !== 0`); the focused Live Observation suite passes and this file is unchanged.

## Next Action

1. Run the required repository checks and commit the Live Observation fixes without pushing.
2. Before any future Apply, make the internal state-storage read path available to the approved cleanup operator without broadening target-account permissions.
3. Re-run end-to-end observation only under a new explicit Apply, traffic, and cleanup approval.
