# Docs Agent Rules

This folder contains product, architecture, data model, development, and deployment documentation.

## Language

1. Write regular project documents in Korean.
2. Keep code identifiers, commands, API paths, file paths, AWS service names, package names, and environment variable names in their original form.
3. `AGENTS.md` files are the exception: they must be written in English.

## Documentation Rules

1. Do not create duplicate documents.
2. Before adding a new document, check `docs/README.md` and update an existing document if possible.
3. Keep the regular reading set small.
4. Remove or merge stale content instead of preserving old versions.
5. Keep product direction aligned with Terraform-first IaC platform positioning.
6. Keep safety boundaries explicit: no real AWS apply unless requested, no secrets, and no frontend AWS SDK calls.

## Update Targets

1. Product strategy, roadmap, risks, and deferred work belong in `docs/product.md`.
2. Stack, storage, current API scope, and architecture decisions belong in `docs/architecture.md`.
3. Shared model contracts belong in `docs/data-models.md`.
4. Local development, conventions, Git flow, and checks belong in `docs/development.md`.
5. Deployment operations belong in `docs/deployment.md`.
