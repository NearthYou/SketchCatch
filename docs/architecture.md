# Architecture

SketchCatch starts as a pnpm and Turborepo monorepo.

## Initial Structure

- `apps/web`: Next.js frontend application
- `apps/api`: Node.js TypeScript API server
- `packages/ui`: shared UI placeholder package
- `packages/types`: shared TypeScript types
- `packages/config`: shared config placeholder package
- `infra/local`: local development infrastructure
- `docs`: product and engineering documentation
- `examples/terraform`: future Terraform examples only

## Current Boundaries

Real AWS, Terraform, AI, and cost integrations are future work. This setup does not include AWS SDK calls, Terraform execution, AI generation, Cost Explorer, Budgets, authentication, or database migrations.

## Future Module Boundaries

- Architecture generation
- Visual board
- Budget and risk checks
- Terraform deployment
- Auto-delete practice sessions
