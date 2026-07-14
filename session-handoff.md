# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch: `feature/sw/377-durable-deployment-notifications`; issue #377 is implemented and locally verified.
- Direct and GitOps terminal events atomically create one persistent Inbox notification and one outbox row per source/status.
- Authenticated SSE and explicit-permission Service Worker Web Push use the same notification ID and safe project action path.
- Subscription endpoints and keys are encrypted; outbound Push DNS is pinned only after all resolved addresses pass the public-address guard.

## Verification

- Notification-focused API/Web tests passed, including encryption, ownership, permission fallback, expiry, retry, retention, and safe Push routing.
- PostgreSQL 16 applied migrations 0000-0041 and passed Direct/GitOps trigger idempotency and duplicate-source assertions.
- Migration compatibility, Terraform tests, harness, lint, typecheck, and build passed on 2026-07-14.
- Full Web and other workspace tests passed; API passed 1,525/1,528 with only three unchanged Windows symlink fixture setup errors (`EPERM`).

## Changes This Session

- Added durable notification schema/migration, shared contracts, service/repository/outbox job, authenticated routes, Web Push encryption and delivery, global Inbox UI, service worker, and tests.
- Removed workspace polling/sessionStorage notification state and documented production Web Push secret injection.

## Broken Or Unverified

- Three unrelated filesystem security tests require Windows symlink privileges unavailable on this machine.
- Browser Push provider delivery and the approved sandbox journey remain unverified until issue #378.
- No Web Push provider call, Terraform Apply/Destroy, AWS/GitHub mutation, or production database migration was performed.

## Best Next Action

- Complete issue #377 PR review and merge to `dev`.
- Continue issue #378 only with explicit approved sandbox credentials, rollback targets, and cleanup evidence.
