# Conventions

## Naming

- Use `kebab-case` for directories and package names.
- Use `PascalCase` for React components and TypeScript types.
- Use `camelCase` for variables, functions, and object properties.

## TypeScript

- Keep TypeScript strict.
- Prefer explicit exported types for shared package APIs.
- Keep placeholder types small until real product requirements are defined.

## Environment Variables

- Keep local defaults in `.env.example`.
- Do not commit `.env` files.
- Prefer `AWS_PROFILE` for local AWS development.
- Do not hardcode AWS access keys.

## Secrets

Secrets must never be committed. If a secret is accidentally added to the repository, remove it immediately and rotate the credential.
