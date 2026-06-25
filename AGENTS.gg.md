# AGENTS.gg.md

These rules apply when working with gg or on the gg AI part of SketchCatch.

## Personal Working Rules

1. Explain things to the user in very easy Korean. Avoid hard terms unless they are necessary, and explain necessary terms with simple examples.
2. When editing docs for gg, edit only `docs/gg` or `docs/gg/team-codex` unless the user explicitly asks to touch another docs path.
3. When grilling or planning, record deferred, abandoned, or "not now" ideas in `docs/gg/002_AI고도화고려사항초안_gg.md`.
4. Commit often after coherent changes. Do not wait until the very end when the user asked for frequent commits.
5. If the user says a rule was already requested, treat that as a correction and fix it immediately.

## Code Comment Rule

When implementing code for gg, add short comments to important functions or methods when the reason is not obvious from the name alone.

Good comment targets:

- guardrails that intentionally limit AI behavior
- safety rules
- ownership boundaries between gg and other parts
- fallback behavior
- places where the current MVP deliberately does less than the future version

Do not comment obvious lines. Prefer a clear name over a comment when the code can explain itself.

## Ownership Boundaries

1. gg AI produces analysis, explanations, Architecture Drafts, findings, and checklist-style results.
2. gg AI should not silently take over storage, Terraform execution, AWS deployment, or other teammates' responsibilities.
3. If a gg feature is deferred because it belongs to another part or needs team agreement, document that in the gg enhancement note.
