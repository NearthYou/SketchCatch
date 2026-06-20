# Deferred Implementations

SketchCatch is intentionally delaying the following tools and capabilities until the product boundaries are clearer. This keeps the early learning experience safe, avoids accidental cloud access, and reduces churn while the architecture is still changing.

| Item                    | When to Add                                                   | Reason to Defer                                                                          |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| React Flow              | Add when implementing the architecture board.                 | It is not needed before the visual board exists.                                         |
| Monaco Editor           | Add when a Terraform editor is required.                      | The editor dependency can wait until Terraform editing becomes a real workflow.          |
| AWS SDK                 | Add only after safe backend AWS access patterns are designed. | Incorrect usage could create real resource access risk.                                  |
| Terraform CLI execution | Add only after controlled deployment guardrails are defined.  | Enabling automatic deployment too early is risky for beginners.                          |
| OpenAI / Bedrock SDK    | Add after the AI feature design is confirmed.                 | Provider integration should follow a clear AI workflow and safety design.                |
| Prisma / Drizzle ORM    | Add after the database model is stable.                       | Early migrations can churn if the schema is not settled.                                 |
| Auth                    | Add after user and permission policies are designed.          | Authentication should match the final ownership and access model.                        |
| Worker app              | Add after automatic deletion logic is designed.               | Background execution should wait until cleanup behavior and safety guarantees are clear. |
| Husky / lint-staged     | Add when local pre-commit enforcement becomes useful.         | Early on, CI checks are enough.                                                          |
