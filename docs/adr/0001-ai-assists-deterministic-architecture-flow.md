# AI assists deterministic architecture flow

SketchCatch will use AI to create Architecture Drafts, explain IaC Preview output, and translate Pre-Deployment Check findings into learner-facing guidance, but deterministic generators and rule engines remain the source of truth for structured architecture data, IaC output, and deploy-blocking checks. This keeps the 5-week MVP demoable and safer: AI can improve understanding, while deployment decisions still come from reproducible project data and rules.

**Considered Options**

- Let AI freely generate Terraform and deployable checks: higher demo impact, but too risky for AWS beginners and hard to verify in a short project.
- Use only fixed templates and no AI explanation: safer, but weakens SketchCatch's learning value.
- Use deterministic outputs first and AI explanations second: selected because it balances safety, repeatability, and presentation value.
