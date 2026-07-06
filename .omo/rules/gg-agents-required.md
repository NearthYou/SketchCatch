# gg Agent Rules Required

These rules apply to every Codex session that works on gg-owned work.

## Mandatory gg Rule Loading

1. If the current Git branch contains `/gg/`, starts with `gg/`, or otherwise names gg-owned work, Codex must read `AGENTS.gg.md` before planning, editing, committing, creating issues, or opening pull requests.
2. If the user says the task is for gg, gg AI, or a gg-owned feature, Codex must read `AGENTS.gg.md` even when the branch name does not include gg.
3. If `AGENTS.gg.md` cannot be read, Codex must stop gg work and report the missing or unreadable file before making changes.
4. `AGENTS.gg.md` is not optional context. It is part of the required instruction set for gg work.
5. After reading `AGENTS.gg.md`, Codex must follow its rules for Korean explanations, gg documentation paths, issue writing, branch naming, commit messages, code comments, DB migration reporting, and ownership boundaries.

## Quick Check

Before non-trivial gg work, Codex should verify:

```bash
git branch --show-current
test -f AGENTS.gg.md
```

If the branch or task is gg-related and the file exists, read it.
