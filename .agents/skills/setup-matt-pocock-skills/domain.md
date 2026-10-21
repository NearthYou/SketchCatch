# Domain Docs

Before exploring domain behavior, read the relevant `CONTEXT.md` glossary and the architecture decisions in `docs/architecture.md`. If either file is missing, proceed silently.

## Single-context layout

```text
/
├── CONTEXT.md
└── docs/
    └── architecture.md
```

If `CONTEXT-MAP.md` exists, read only the context files relevant to the task. System-wide decisions still belong in `docs/architecture.md`.

Use glossary terms consistently in issues, proposals, tests, and code. If a proposal contradicts a recorded architecture decision, identify the conflicting decision and explain why it may be worth reopening instead of silently overriding it.
