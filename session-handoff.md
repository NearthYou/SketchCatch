# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Epic #432 remains ordered as merged PR 1 / issue #434, current PR 2 / issue #433, then PR 3 / issue #435.
- `feature/sw/433-application-artifact-reuse` is based on merged PR 1 commit `207a979f` and implements only PR 2.
- Direct Deployment and GitOps share a provider-neutral `ApplicationArtifact` Registry with canonical fingerprinting, provider revalidation, persistent build claims, and project isolation.
- PR #438 review hardening rejects malformed or delimiter-obfuscated build inputs, streams S3 digest verification, and releases failed renewal heartbeats immediately.
- `ApplicationRelease.artifactId` is nullable for legacy/v1 fallback, while a composite project foreign key blocks cross-project links.
- Migration `0045_application_artifact_registry.sql` avoids `0044`, which another branch reserved. `_journal.json` changes.

## Changes This Session

- Added all seven artifact kinds, canonical identity, strict v2 evidence, the Postgres Registry/lease boundary, read-only AWS verification, and the authenticated project artifact list.
- Integrated verified reuse with Direct Deployment and GitOps while preserving v1 release evidence and legacy releases.
- Updated product, data model, architecture, deployment, harness, and continuation documentation. PR 3 was not started.

## Broken Or Unverified

- Pass: focused PR 2 tests 59/59, `pnpm harness:check`, migration compatibility, lint, typecheck, and build.
- API full suite: 666/669; only three Windows symlink-creation tests fail with `EPERM`.
- Workspace `test:core` stops on three pre-existing three-tier Template contract failures unrelated to PR 2.
- No real credential, live AWS mutation, Terraform apply/destroy, user deployment, or Git handoff was executed.

## Best Next Action

1. Review and merge the Ready PR into `dev` after CI.
2. Keep PR 3 / issue #435 blocked until PR 2 is merged.
