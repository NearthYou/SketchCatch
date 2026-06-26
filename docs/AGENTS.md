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
5. Keep product direction aligned with Terraform-first, multi-cloud-ready IaC platform positioning. MVP implementation is AWS-first.
6. Keep the first MVP goal explicit: AI-recommended infrastructure must be deployable to real AWS through a controlled Deployment flow.
7. Keep safety boundaries explicit: no real AWS apply unless it is explicit Deployment work, no secrets, and no frontend AWS SDK calls.

## Document Filename Rules

1. When creating a new project document, use this filename format: `000_한글제목_대상이니셜.md`.
2. Before choosing a name, inspect the target folder and use the next unused three-digit numeric prefix, such as `001`, `002`, or `010`.
3. Write the title part in clear Korean so the purpose is understandable from the filename alone.
4. If specific people must read the document, append their initials at the end, such as `001_배포점검가이드_KM.md`.
5. If multiple people must read it, join initials with hyphens, such as `001_배포점검가이드_KM-JH.md`.
6. If there is no specific required reader, omit the initials and the trailing underscore, such as `002_테라폼검증흐름.md`.
7. Keep existing canonical documents listed under Update Targets at their current names unless the user explicitly asks to rename them.

## Update Targets

1. Product strategy, roadmap, risks, MVP scope, and deferred work belong in `docs/product.md`.
2. Shared model, DTO, AI, Terraform artifact, and Deployment contracts belong in `docs/data-models.md`.
3. Stack, storage, execution boundaries, current API scope, and architecture decisions belong in `docs/architecture.md`.
4. Local development, team AI collaboration, conventions, Git flow, and checks belong in `docs/development.md`.
5. Operational deployment and user Deployment execution/cleanup belong in `docs/deployment.md`.
