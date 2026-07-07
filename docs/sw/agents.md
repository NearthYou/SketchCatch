# Demo Web Service E2E Agent Rules

1. Work from latest `origin/dev`; do not build on a dirty feature branch.
2. Keep this scope in `docs/sw/spec5.md` and `docs/sw/plan5.md`.
3. Treat SketchCatch as a multi-cloud-ready IaC operations service, not AWS-only.
4. Keep Terraform/AWS execution in `apps/api`; never place it in Web UI code.
5. Use shared `ResourceDefinition` before API/Web-specific catalog changes.
6. Do not allow arbitrary EC2 `user_data` in live deployment.
7. Allow only SketchCatch-managed demo bootstrap with marker/hash validation.
8. Keep RDS outside default live apply unless the user explicitly enables optional live.
9. Do not run real apply/destroy without plan, approval, logs, masking, and cleanup.
10. Static site live demo must create, verify, and destroy all demo resources.
11. Traffic demo is UI simulation unless a later spec explicitly enables load tests.
12. Git/CI/CD static site handoff must use connected Source Repository metadata.
13. Never accept client-supplied repository owner/name/provider for handoff.
14. Do not log secrets, tokens, private keys, credentials, or sensitive outputs.
15. Smoke reports must not contain credentials or private URLs with secrets.
16. Update `feature_list.json` only when HARNESS-007 has concrete evidence.
17. Keep docs in Korean except agent instruction files.
18. Before finishing code changes, run harness, lint, typecheck, and build.
19. Record skipped live checks with a reason and next verification step.
20. Prefer small PRs mapped to one spec5 milestone each.
