# Infra Agent Rules

This folder contains infrastructure configuration, AWS templates, IAM policies, and operational examples.

## Safety Rules

1. Use least-privilege IAM.
2. Do not commit secrets, credentials, private keys, account passwords, or real access tokens.
3. Make cost-bearing resources explicit in docs or comments when adding infrastructure.
4. Avoid wildcard permissions unless the reason is documented and scoped by resource, condition, or follow-up.
5. Do not open broad public access without an explicit reason.
6. Do not implement real Terraform apply or destructive AWS operations unless explicitly requested.

## Architecture Rules

1. Production deployment uses Docker, EC2, SSM Run Command, S3 release artifacts, RDS, and Nginx.
2. Production deployment does not use Docker Compose.
3. Keep RDS for structured project data and S3 for file artifacts.
4. Prefer templates and policies that are readable by the team over overly clever infrastructure code.
5. Keep SketchCatch production infrastructure separate from user Practice Architecture Resources and user Deployment artifacts.
6. Treat Redis, if provisioned for SketchCatch, as internal Runtime Cache infrastructure for workflow status, polling, and streaming support.
7. Provider Adapter examples may start with AWS, but do not document SketchCatch as an AWS-only product.

## Review Checklist

Before finishing infrastructure changes, check:

1. Could this create ongoing cost?
2. Could this expose public access?
3. Could this grant broader IAM permissions than needed?
4. Could this leak a secret into Git, logs, or generated artifacts?
