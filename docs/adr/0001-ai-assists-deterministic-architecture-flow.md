# AI assists deterministic architecture flow

SketchCatch will use AI to turn natural-language infrastructure requirements into Architecture Drafts, explain IaC Preview output, propose user-approved changes, and translate Pre-Deployment Check findings into user-facing design guidance. Deterministic graph validation, generators, and rule engines remain the source of truth for structured architecture data, IaC output, deploy-blocking checks, and simulation assumptions. This keeps the first delivery demoable and safer: AI can improve design speed and reasoning, while deployable artifacts still come from reproducible project data and rules.

**Considered Options**

- Let AI freely generate Terraform and deployable checks: higher demo impact, but too risky and hard to verify in a short project.
- Use only fixed templates and no AI interpretation: safer, but weakens SketchCatch's value as an infrastructure design platform.
- Use natural-language AI interpretation plus deterministic graph outputs: selected because it balances design flexibility, safety, repeatability, and presentation value.
