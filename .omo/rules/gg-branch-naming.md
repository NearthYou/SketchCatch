# gg Branch Naming

These rules apply to gg-owned work.

1. Before creating a branch, check the current team convention.
2. For gg implementation work, use `feat/gg/{issue-number}-{short-task}`.
3. For gg bug fixes, use `fix/gg/{issue-number}-{short-task}`.
4. Use `docs/gg/{issue-number}-{short-task}` only when the task is documentation-only.
5. If implementation will follow in the same task, use `feat/gg/...` instead of `docs/gg/...`.
6. Do not use shortcut names like `feat-#42` or `docs-#42`.
7. Do not create `feature/gg/...` for gg work unless the user or team explicitly changes the convention.
8. If the branch name is wrong, rename it before implementation continues and make the upstream branch match.
9. Delete stale gg task branches after their PR is merged and both local and remote refs are no longer needed.
10. Keep the task slug short, lowercase, and hyphen-separated.

Examples:

```text
feat/gg/42-ai-check-simulation
fix/gg/42-ai-error-panel
docs/gg/42-ai-plan
```
