# Session Handoff

## Currently Verified

- PR #558 is merged into dev at 45219559 after CI run 39606279718 passed. Release integration uses #590 and the existing dev-to-main PR #560.
- The local full package test run passed: Types 78, Web 1393, API 2232 passed with two platform skips. Linux CI exercises filesystem symlinks and the POSIX cache test.
- Root harness, lint, typecheck and five-package build passed. Sandbox 25, import-safety 30, capture-generator 5 and Terraform mocked plan checks 2 passed.
- Main's reader documentation, demo-video label, contributor role, portfolio architecture image and three approved test removals are preserved. Canonical document links resolve.

## Changes This Session

- Repaired upload-negation and sizing interpretation, managed microservice selection, storage purpose separation, HTTPS coverage and generated transport placement.
- Made archive metadata/path verification portable while retaining checksum, path, type and quota checks. Refreshed auth and import test fixtures without relaxing access checks.
- Removed Security Group overlay bounds from the support-lane traffic envelope; genuine intrusion checks and the existing aggregate budget remain intact.
- Recaptured 10 Module and 29 Template previews using the real local editor. Updated committed asset/diagram hashes and repaired capture scripts. Test CI now runs the complete package suite and deployment/capture safety tests.

## Broken Or Unverified

- No production DB migration, ECS deployment, service restart, paid model call or real cloud operation was executed. Existing stopped services remain stopped.
- Production authentication, new AWS import permissions and end-to-end Terraform execution have not been smoke-tested against a live account in this session.
- Windows cannot create file symlinks without Developer Mode or elevation; that platform-specific test is explicitly skipped locally and remains enabled in Linux CI.

## Best Next Action

Use GitHub PR checks and the release page for publication status. Before any production deployment, recheck the running resource state and applied DB migration head, then follow docs/deployment.md for 0055 through 0057. Do not start stopped services merely to verify documentation or screenshots.
