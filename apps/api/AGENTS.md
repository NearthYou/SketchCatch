# API Agent Rules

This folder contains the Fastify backend API.

## Product Role

The API owns project persistence, architecture snapshots, asset metadata, validation, and future controlled Terraform/AWS workflows. Keep real infrastructure mutation behind explicit safety gates and user approval.

## Boundaries

1. Do not implement real AWS apply, deploy, update, delete, or destroy behavior unless the user explicitly asks for it in the current task.
2. Do not expose AWS credentials, DB credentials, or secret values in responses or logs.
3. Keep frontend clients away from AWS SDK and Terraform execution details.
4. Store project records and architecture JSON in RDS.
5. Store diagram images, IaC files, exports, and thumbnails in S3 through metadata records and object keys.

## API Structure

1. Keep Fastify route handlers focused on HTTP input, validation, authorization checks, and response shaping.
2. Move growing business logic into services.
3. Move repeated database access into repositories or focused helpers when patterns become real.
4. Validate request bodies, params, and query strings with Zod.
5. Keep error response shapes consistent.
6. Use shared types from `packages/types` for API DTOs when the data crosses service boundaries.

## Database And Migration Rules

1. When changing `src/db/schema.ts`, decide whether a migration is required before finishing.
2. Keep Drizzle schema, generated migrations, Zod schemas, and shared types aligned.
3. Treat destructive schema changes as high risk; document the migration strategy before implementing them.
4. When adding enum/status values, update shared types, validation schemas, and tests together.
5. Do not store raw Terraform file content in RDS when the artifact belongs in S3; store metadata and object keys instead.

## Terraform And AWS Safety

1. Terraform generation should be deterministic and testable.
2. Terraform execution, when later allowed, must run only on backend or worker infrastructure.
3. Require explicit approval gates before any real resource mutation.
4. Prefer dry-run, plan, validation, and mock execution before apply.
5. Capture deployment logs and failure reasons without leaking secrets.

## AI Assistance Rules

1. AI-generated Terraform must never be applied directly.
2. AI output must pass deterministic validation and safety checks before it affects deployable artifacts.
3. Prefer rule-based cost and security checks for blocking decisions; use AI as an explanation and suggestion layer.
4. Keep prompts, model outputs, and logs free of secrets and credentials.
5. Make AI suggestions reviewable by humans before turning them into project state.

## Verification

Run relevant API checks after changes:

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api lint
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api typecheck
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api test
```
