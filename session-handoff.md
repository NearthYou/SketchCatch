# Session Handoff

Use this file only for compact continuation context.

## Currently Verified

- Current branch: `feat/ck/287-ai-diagram`.
- Latest `origin/dev` includes the production split ECS cutover, one-off worker isolation, and manual-only EC2 rollback workflow.
- The branch retains Amazon Q-backed Architecture Draft generation, deterministic deployable materialization, streamed progress, external User/Internet presentation nodes, area containment, and semantic gateway placement.
- No cloud deployment or Terraform mutation was run while integrating `dev`.

## Changes This Session

- Integrated latest `origin/dev` while preserving independent AI/Q and S3 artifact compatibility changes.
- Combined the ALB 120-second idle timeout with invalid-header dropping.
- Mapped AI normalizer and Q retrieval variables into the refactored shared API environment.

## Broken Or Unverified

- Post-merge checks and restoration of the pre-merge uncommitted worktree are still pending.
- External customer execution roles may still need worker-principal trust updates.

## Best Next Action

- Restore the stashed AI diagram work, run repository and Terraform checks, then continue visual verification.
