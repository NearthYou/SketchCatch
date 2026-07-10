# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Current branch: `feat/gg/0-github-template`.
- PR #317 targets `dev`, is mergeable, and has green CI checks.
- GitHub Repository Analysis reads bounded static evidence at a commit-pinned revision and verifies the stored repository ID.
- Monorepo Application Units honor declared workspace globs and keep deployment evidence scoped to the owning unit.
- No repository code, live AWS, or Terraform mutation was run for Repository Analysis.

## Changes This Session

- Added Repository Analysis shared contracts, GitHub evidence reading, Template Selection, Source Repository API, ADRs, and milestone records.
- Added repository identity mismatch rejection and Application Unit evidence isolation after independent review.
- Merged latest `dev` and kept inline Lambda archive rendering while following the latest explicit-S3-resource contract.

## Broken Or Unverified

- Full `pnpm test` has unrelated existing failures in missing docs fixtures, S3 test env, Windows path assertions, and AI fixtures/contracts.
- Focused Repository Analysis tests, focused Terraform merge tests, required static checks, build, independent gate review, and GitHub CI all pass.

## Best Next Action

- Obtain required team review for PR #317 and resolve any new thread before merge.
