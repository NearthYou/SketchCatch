# Git/CI/CD Auto Deploy Agent Rules

1. Read `docs/sw/spec6.md`, `docs/sw/plan6.md`, and this file before work.
2. Keep these three files updated in every PR that changes scope, contracts, risk, or verification.
3. Treat this work as Git/CI/CD Deployment Path, not Direct Deployment.
4. Do not call SketchCatch AWS-only; keep provider boundaries explicit.
5. GitHub App handles repo selection, PR creation, and Actions run reads.
6. User OAuth is required for workflow file writes and repo Actions setup.
7. Never store GitHub tokens, AWS credentials, secrets, or private keys in DB/logs/docs.
8. Existing AWS Connection roles may be changed only after diff review and user approval.
9. IAM trust must be scoped to repo, branch, environment, and `sts.amazonaws.com`.
10. Terraform apply and destroy must require GitHub Environment approval.
11. Infra and app workflows stay separate, but one handoff record summarizes both.
12. Track PR merge state by PR number, then workflow runs by merge commit SHA.
13. Use S3 backend for CI Terraform state; do not use local state artifacts.
14. RDS is opt-in only; default CI/CD deploy excludes RDS.
15. App runtime deploy uses S3 release artifact plus ASG Instance Refresh.
16. Do not rely on SSM in-place overwrite as the main app rollout mechanism.
17. Destroy workflow is required for every generated apply workflow.
18. Frontend must show approval, waiting, failed, and success states distinctly.
19. Every mutation path needs tests for denied approval and missing permission.
20. Document live smoke commands, cleanup evidence, and residual risks.
21. Update `agent-progress.md` before finishing a work session.
22. Update `session-handoff.md` when the next agent needs continuation context.
23. Keep PRs aligned to the issue/branch mapping in `docs/sw/plan6.md`.
24. If implementation changes a milestone boundary, update the issue body or add a follow-up issue.
25. Do not mark a milestone complete without concrete verification commands.
26. PR artifact generation is not live proof; record real merge/apply/release/destroy smoke separately.
