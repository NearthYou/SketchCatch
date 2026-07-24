# Docs Agent Rules

This folder contains product, architecture, data model, development, and deployment documentation.

## Language

1. Write regular project documents in Korean.
2. Keep code identifiers, commands, API paths, file paths, AWS service names, package names, and environment variable names in their original form.
3. `AGENTS.md` files are the exception: they must be written in English.

## Documentation Rules

1. Do not create duplicate documents.
2. Before adding a new document, check `docs/README.md` and update an existing document if possible.
3. When renaming a canonical document, update `docs/README.md` and every inbound link.
4. Keep the regular reading set small.
5. Remove or merge stale content instead of preserving old versions.
6. Do not create contributor-specific folders. Put test fixtures and generated evidence beside the owning code; keep only historical session records in `agent-history`.
7. Keep product direction aligned with the multi-cloud-ready IaC operations service positioning. MVP implementation is AWS-first and Terraform-first, but the domain model must stay provider-neutral.
8. Keep the first MVP goal explicit: users must be able to move from Requirement Input, Source Repository evidence, or Reverse Engineering input to an infrastructure design, IaC Preview, deployment check, and either an approved managed deployment or CI/CD delivery.
9. Treat presentation flows as Representative Use Journeys. Do not let demo-only wording replace the service's real user journey.
10. Keep safety boundaries explicit: no real cloud apply unless it is explicit Deployment work or approved CI/CD handoff, no secrets, no frontend cloud SDK calls, no AI or voice input state changes without user acceptance.
11. Document Redis as internal Runtime Cache infrastructure only unless a separate product decision turns it into a user infrastructure resource.

## Document Filename Rules

1. Update a canonical document instead of creating a second document for the same responsibility.
2. Name shared reference files by purpose or evidence type, not by contributor initials, branch names, or temporary workstream labels.
3. Use concise English kebab-case filenames that describe document responsibility.
4. Keep the canonical documents listed under Update Targets at their current names unless the user explicitly asks to rename them.

## Update Targets

1. Product strategy, roadmap, risks, MVP scope, and deferred work belong in `docs/product.md`.
2. Shared model, DTO, AI, Terraform artifact, and Deployment contracts belong in `docs/data-models.md`.
3. Stack, storage, execution boundaries, current API scope, and architecture decisions belong in `docs/architecture.md`.
4. Local development, team AI collaboration, conventions, Git flow, and checks belong in `docs/development.md`.
5. Operational deployment and user Deployment execution/cleanup belong in `docs/deployment.md`.
6. Cross-functional service flows and implementation status belong in `docs/service-specification.md`.
