# UI Package Agent Rules

This folder contains reusable presentational UI components.

## Boundaries

1. Do not put domain business logic in this package.
2. Do not call APIs, AWS SDK logic, Terraform logic, or routing APIs from shared UI components.
3. Do not depend on app-specific state stores.
4. Keep components reusable across SketchCatch surfaces.

## Component Rules

1. Export explicit prop types.
2. Keep components small and readable.
3. Prefer composition over configuration-heavy components.
4. Use clear accessible labels for controls.
5. Avoid styling decisions that conflict with the app-level design system.

## Verification

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/ui lint
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/ui typecheck
```
