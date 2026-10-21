# AI assists deterministic architecture flow

SketchCatch will use AI to turn natural-language infrastructure requirements into Architecture Drafts, explain 인프라 코드 미리보기 output, and translate 배포 전 검사 findings into user-facing design guidance. Deterministic graph validation, generators, and rule engines remain the source of truth for structured architecture data, IaC output, reproducible findings, and simulation assumptions. The current safety gate records High findings for review but does not automatically block Plan approval solely by severity; that enforcement remains planned. AI can improve design speed and reasoning, while deployable artifacts and execution still require reproducible project data, rules, and explicit user approval.

Considered Options

- Let AI freely generate Terraform and deployable checks: higher demo impact, but too risky and hard to verify in a short project.
- Use only fixed templates and no AI interpretation: safer, but weakens SketchCatch's value as an infrastructure design platform.
- Use natural-language AI interpretation plus deterministic graph outputs: selected because it balances design flexibility, safety, repeatability, and presentation value.
