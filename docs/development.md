# Development

## Install Dependencies

```bash
pnpm install
```

If `pnpm` is not available, enable it through Corepack:

```bash
corepack enable
corepack prepare pnpm@11.8.0 --activate
```

## Run the Web App

```bash
pnpm --filter @sketchcatch/web dev
```

The web app runs on `http://localhost:3000`.

## Run the API App

```bash
pnpm --filter @sketchcatch/api dev
```

The API app runs on `http://localhost:4000`. Health check:

```bash
curl http://localhost:4000/health
```

## Run Local PostgreSQL

```bash
docker compose -f infra/local/docker-compose.yml up -d
```

This starts a local PostgreSQL container with safe local defaults.

## Root Scripts

- `pnpm dev`: run all development servers through Turborepo
- `pnpm build`: build all apps and packages
- `pnpm lint`: lint all apps and packages
- `pnpm typecheck`: type-check all apps and packages
- `pnpm test`: run placeholder test commands
- `pnpm format`: format files with Prettier
