---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when the user wants to pin down domain terminology, record an architecture decision, or when another skill needs to maintain the domain model.
---

# Domain Modeling

Actively sharpen the project's domain language while designing. Challenge ambiguous terms, test them with concrete edge cases, compare claims with the code, and record resolved language immediately.

## Project files

```text
/
├── CONTEXT.md
└── docs/
    └── architecture.md
```

- `CONTEXT.md` is the glossary. Create it lazily when the first term is resolved.
- `docs/architecture.md` owns system boundaries and durable architecture decisions.
- Do not create a parallel decision directory or one file per decision.

## During the session

### Challenge against the glossary

Call out language that conflicts with `CONTEXT.md` and ask which meaning is intended.

### Sharpen fuzzy language

Propose one precise canonical term when a word is vague or overloaded.

### Discuss concrete scenarios

Use edge cases to expose unclear relationships and ownership boundaries.

### Cross-reference with code

Check whether the implementation agrees with the stated model. Surface contradictions instead of silently rewriting either side.

### Update `CONTEXT.md` inline

Capture resolved terms immediately using [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md). Keep implementation details and temporary plans out of the glossary.

### Record architecture decisions sparingly

Record a decision only when all three are true:

1. It is expensive to reverse.
2. A future reader would not understand it from the code alone.
3. Real alternatives were considered.

If any condition is missing, skip the decision record. When all apply, update the decision section in `docs/architecture.md` using [DECISION-FORMAT.md](./DECISION-FORMAT.md).
