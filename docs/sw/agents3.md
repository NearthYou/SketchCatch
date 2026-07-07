# Git/CI/CD Auto Deploy Agent Rules

1. Read `docs/sw/spec6.md`, `docs/sw/plan6.md`, and this file before work.
2. Keep these three files updated in every PR that changes scope, contracts, risk, or verification.
3. Treat this work as Git/CI/CD Deployment Path, not Direct Deployment.
4. Do not call SketchCatch AWS-only; keep provider boundaries explicit.
5. GitHub App handles repo selection, PR creation, and Actions run reads.
6. Repo setup must use approved GitHub permissions and fail closed with an OAuth/permission CTA.
7. Never store GitHub tokens, AWS credentials, secrets, or private keys in DB/logs/docs.
8. GitHub OAuth repository tokens must be one-time Runtime Cache grants with short TTLs.
9. Existing AWS Connection roles may be changed only after diff review and user approval.
10. IAM trust must be scoped to repo, branch, environment, and `sts.amazonaws.com`.
11. Terraform apply and destroy must require GitHub Environment approval.
12. Infra and app workflows stay separate, but one handoff record summarizes both.
13. Track PR merge state by PR number, then workflow runs by merge commit SHA.
14. Use S3 backend for CI Terraform state; do not use local state artifacts.
15. RDS is opt-in only; default CI/CD deploy excludes RDS.
16. App runtime deploy uses S3 release artifact plus ASG Instance Refresh.
17. Do not rely on SSM in-place overwrite as the main app rollout mechanism.
18. Destroy workflow is required for every generated apply workflow.
19. Frontend must show approval, waiting, failed, and success states distinctly.
20. Every mutation path needs tests for denied approval and missing permission.
21. Run live-smoke preflight before any real GitHub/AWS mutation.
22. Use `-ConfirmLiveMutations` only after explicit cost, permission, and cleanup approval.
23. Document live smoke commands, cleanup evidence, and residual risks.
24. Update `agent-progress.md` before finishing a work session.
25. Update `session-handoff.md` when the next agent needs continuation context.
26. Keep PRs aligned to the issue/branch mapping in `docs/sw/plan6.md`.
27. If implementation changes a milestone boundary, update the issue body or add a follow-up issue.
28. Do not mark a milestone complete without concrete verification commands.
29. PR artifact generation is not live proof; record real merge/apply/release/destroy smoke separately.
