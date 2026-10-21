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

1. Keep RDS for structured project data and S3 for file artifacts.
2. Prefer templates and policies that are readable by the team over overly clever infrastructure code.
3. Keep SketchCatch production infrastructure separate from user infrastructure resources and user Deployment artifacts.
4. Treat Redis, if provisioned for SketchCatch, as internal Runtime Cache infrastructure for workflow status, polling, and streaming support.
5. Provider Adapter examples may start with AWS, but do not document SketchCatch as an AWS-only product.
6. SketchCatch production infrastructure Terraform must use operator-approved state groups and must not run through user Deployment execution.

## Review Checklist

Before finishing infrastructure changes, check:

1. Could this create ongoing cost?
2. Could this expose public access?
3. Could this grant broader IAM permissions than needed?
4. Could this leak a secret into Git, logs, or generated artifacts?
