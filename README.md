# SketchCatch

SketchCatch is a web service for AWS beginners to visually design AWS practice architectures, understand resource relationships, check estimated cost and risk, and eventually deploy approved practice environments with automatic cleanup.

This repository is currently in the early infrastructure setup stage. Terraform execution, AI generation, authentication, and production feature workflows are not implemented yet.

## Tech Stack

- pnpm workspace
- Turborepo
- TypeScript
- Next.js, React, and TypeScript for `apps/web`
- Node.js and TypeScript for `apps/api`
- Shared packages under `packages/*`
- Docker Compose for local PostgreSQL
- ESLint and Prettier
- GitHub Actions CI

## Repository Structure

```text
sketchcatch/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── ui/
│   ├── types/
│   └── config/
├── infra/
│   └── local/
├── docs/
├── examples/
│   └── terraform/
└── .github/
    └── workflows/
```

## Getting Started

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

Start local PostgreSQL:

```bash
docker compose -f infra/local/docker-compose.yml up -d
```

## Production Deployment

Production uses EC2, RDS, S3, GitHub Actions, AWS Systems Manager, Docker, and an Nginx container. Docker Compose is not used for production deployment.

See [docs/deployment.md](docs/deployment.md).

## Root Scripts

- `pnpm dev`: run development servers through Turborepo
- `pnpm build`: build all apps and packages
- `pnpm lint`: lint all apps and packages
- `pnpm typecheck`: type-check all apps and packages
- `pnpm test`: run placeholder test commands
- `pnpm format`: format the repository with Prettier
- `pnpm docker:build`: build production Docker images locally without Docker Compose
