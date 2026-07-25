# Web Agent Rules

This folder contains the Next.js frontend application.

## Product Role

The web app provides the visual workspace for Terraform-first, multi-cloud-ready IaC operations. It may show Requirement Input, Architecture Board, IaC Preview, AI recommendations, safety warnings, CI/CD handoff state, Deployment records, Reverse Engineering results, and learning guidance, but it must not execute infrastructure changes directly.

## Boundaries

1. Do not call AWS SDK logic directly from frontend components.
2. Do not run Terraform, call AWS SDKs, or execute real AWS apply/destroy logic from UI components.
3. Treat API responses and frontend state as contracts based on `packages/types` and `docs/data-models.md`.
4. Keep Terraform execution, Deployment approval, and AWS account access behind backend or worker APIs.
5. Store only UI state in components; persistent project state belongs in the API and database.
6. For SW Terraform conversion, call backend APIs and render results; do not run Terraform CLI, AWS SDK, S3 upload, or RDS persistence directly from the browser.
7. Keep DiagramJson editor state aligned with `docs/data-models.md` and shared types.
8. Voice Requirement Input must show the transcribed text and require user confirmation before sending a Requirement Prompt.
9. AI Architecture Drafts, Architecture Suggestions, Git handoff, and Deployment actions must require explicit user acceptance before changing project state.

## UI Architecture

1. Keep components small and focused on presentation or a single workflow.
2. Move growing behavior into hooks, helpers, or feature modules.
3. Prefer explicit state names such as `selectedNodeId`, `architectureJson`, and `activeResourceId`.
4. Keep diagram-to-code synchronization logic isolated from presentational components.
5. Use `@xyflow/react` for Architecture Board graph behavior; extend the existing graph layer instead of hand-rolling parallel graph interactions.
6. When Monaco Editor is introduced, use it only for real IaC editing workflows; do not add it for placeholder screens.

## UX Rules

1. The first screen should be the usable workspace, not a marketing landing page.
2. Make cost, security, and deletion safety visible before any deployment-related action.
3. Beginner explanations should be short, concrete, and tied to the selected resource or warning.
4. Avoid decorative UI that makes operational workflows harder to scan.
5. Prefer clear states for loading, empty, error, warning, and blocked actions.
6. Treat presentation flows as Representative Use Journeys, not demo-only surfaces that diverge from the real service workflow.

## Verification

Run relevant frontend checks after changes:

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck
```
