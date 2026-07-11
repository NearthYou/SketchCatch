# Deploy Agent Rules

This folder contains deployment scripts for the production deployment flow.

## Deployment Model

1. Production deploys Docker images from GitHub Actions through ECR to ECS/Fargate API, web, and one-off worker tasks.
2. Production deployment must not use Docker Compose.
3. Keep the retired EC2/SSM scripts cold-only; they must not be wired to automatic or routine production deployment.
4. Keep cold rollback paths explicit, disabled by default, and documented.
5. Keep production deployment scripts separate from user Direct Deployment Path and Git/CI/CD Deployment Path workflows.
6. Do not add user cloud resource mutation behavior to production deploy scripts.

## Script Rules

1. Scripts must fail with clear non-zero exit codes.
2. Do not print secrets, database URLs, tokens, or private keys.
3. Keep shell scripts readable by humans; avoid dense shell tricks.
4. Validate required environment variables before using them.
5. Quote paths and variables where appropriate.
6. Avoid destructive operations unless the target path and intent are explicit.

## Operations Rules

1. Do not run database migrations automatically during normal deploy unless the user explicitly requests that behavior.
2. Keep migration execution as a separate, intentional operation.
3. Keep logs useful for diagnosing failed deploys without exposing sensitive values.
