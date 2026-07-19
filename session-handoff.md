# Session Handoff

Use this file only for compact continuation context. Write it in English and reference durable artifacts instead of repeating them.

## Currently Verified

- Branch: `fix/sw/live-observation-deployment-picker-layering`; implementation commit `132346f0` is ready to integrate with `origin/dev` at `252e7085`.
- Focused Live Observation and Design Analysis checks pass 36/36.
- Browser QA confirms the disabled placeholder when no successful Deployment is eligible.
- `pnpm harness:check` passes on 2026-07-20. No AWS mutation, Terraform execution, deployment, traffic, migration, dependency change, or push was performed for this fix.

## Changes This Session

- Compacted the active trackers and moved stale 2026-07-19 context into `docs/agent-history/2026-07.md` without duplicating records already archived.
- Raised the Live Observation overlay above known Workspace floating surfaces.
- Changed an empty eligible-Deployment list from an enabled blank native picker to one disabled unavailable option.
- Wrapped the Direct Deployment launch callback so the click event cannot become a Deployment selection.

## Broken Or Unverified

- Repeated sandbox `sts:AssumeRole` preflights still return AccessDenied. Verify that the source policy is saved and attached, then inspect the target role trust policy, permission boundary, and SCP.
- The latest sandbox attempt failed before traffic at `application-autoscaling:RegisterScalableTarget`; partial-state cleanup completed. Do not claim live scale-out acceptance.
- Do not retry Apply or generate traffic until the preflight succeeds and the user gives fresh explicit approval for a bounded Plan/Apply/traffic/Destroy cycle.

## Best Next Action

1. Merge `origin/dev`, resolve the overlapping tracker and Workspace CSS changes, then run the full required checks.
2. Treat sandbox role remediation and a new acceptance cycle as separate, explicitly approved deployment work.

## Suggested Skills

- Use `review` for the focused UI/test diff before publication.
- Use `qa` to repeat the browser picker regression check if the implementation changes.
