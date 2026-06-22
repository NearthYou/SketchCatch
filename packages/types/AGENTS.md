# Types Agent Rules

This folder contains shared TypeScript types used by the API, frontend, and future workers.

## Source Of Truth

1. `docs/data-models.md` is the domain naming source of truth.
2. API DTOs and frontend state should use `camelCase`.
3. PostgreSQL may use `snake_case`, but shared TypeScript fields should not.
4. Use `IsoDateTimeString` for API and frontend date fields.
5. Do not expose `passwordHash`, raw access keys, secret keys, private tokens, or decrypted credentials in shared types.

## Model Rules

1. Add shared types before wiring API and frontend behavior.
2. Keep model names stable: `Project`, `ArchitectureSnapshot`, `ArchitectureJson`, `ResourceNode`, `ResourceEdge`, `ProjectAsset`, and `TerraformArtifact`.
3. Keep `ArchitectureJson.nodes` and `ArchitectureJson.edges` as the board and IaC analysis contract.
4. Prefer narrow union types for known statuses, levels, and resource kinds.
5. Use `Record<string, unknown>` for resource-specific config until a resource schema is intentionally designed.

## Change Checklist

Before finishing a type change, check:

1. Does the API Zod schema still match?
2. Can the frontend state use the type without renaming fields?
3. Does the DB/S3 storage boundary still match `docs/data-models.md`?
4. Are sensitive values still excluded?

## Verification

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/types lint
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/types typecheck
```
