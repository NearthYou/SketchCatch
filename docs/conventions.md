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

## Git Flow

- `main` is the production branch.
- `dev` is the integration branch for development work.
- Feature work branches from `dev`.
- Do not push directly to `main` or `dev` for normal feature work.
- Open PRs from feature branches into `dev`.
- Promote `dev` to `main` through a PR when deploying a release.

Branch names follow the team convention:

```text
feature/{name}/{issue-number}-{task-name}
fix/{name}/{issue-number}-{task-name}
refactor/{name}/{issue-number}-{task-name}
docs/{name}/{issue-number}-{task-name}
chore/{name}/{issue-number}-{task-name}
hotfix/{name}/{issue-number}-{task-name}
```
