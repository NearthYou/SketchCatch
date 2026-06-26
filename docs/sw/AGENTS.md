# SW Docs Agent Rules

This folder contains SW-owned Terraform conversion specifications and implementation plans.

## Language

1. Write regular SW documents in Korean.
2. Keep code identifiers, TypeScript types, API paths, Terraform terms, and AWS service names unchanged.
3. Keep `AGENTS.md` files in English.

## Scope

1. Keep SW docs focused on DiagramJson-to-Terraform conversion, editor validation, and diagram synchronization.
2. Do not duplicate canonical product, architecture, data model, development, or deployment docs.
3. Treat Terraform as the primary IaC target.
4. Separate pure conversion work from DB loading, S3 artifact storage, and RDS metadata persistence.

## Safety

1. The first converter milestone must stay a deterministic pure function.
2. Do not add real Terraform `apply` or `destroy` behavior unless a current task explicitly requests it.
3. Terraform CLI validation may be added later only through backend or worker work with temp directory, state, credential, and log masking policy.
4. Do not describe frontend AWS SDK or frontend Terraform CLI execution as an acceptable architecture.
