# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch `feat/ck/350-ai-diagram-fallback` generates provider-valid Terraform for the strict `audience-live-check` ECS Fargate Repository draft.
- The generated 25-node, 22-resource artifact passes the Direct Deployment safety gate and `terraform validate` with AWS provider v6.54.0.
- Focused Web, Terraform, and Architecture Draft regressions pass; lint, typecheck, and production build pass.

## Changes This Session

- Preserved authored Terraform identities through the ArchitectureJson-to-DiagramJson adapter.
- Filtered Diagram and Template metadata before HCL rendering.
- Added ECR and CloudFront nested-block support.
- Made the strict CloudFront draft complete and deployable.
- Deferred ALB TLS until a domain and certificate are confirmed instead of generating `api.example.com`.
- Added a public 8080 `/health` smoke container for the first deployment before the repository image reaches ECR.

## Broken Or Unverified

- Real Terraform Plan, Apply, health verification, Destroy Plan, and Destroy have not run.
- Chrome is at the SketchCatch login page. The user must sign in so the saved AWS connection can be selected.
- All local AWS CLI profiles currently fail STS because their sessions are expired.
- Root `pnpm test` has unrelated existing Web assertion failures; changed-path tests pass.

## Best Next Action

- After the user signs in through Chrome, return to the Repository workspace and run the explicit Direct Deployment Plan, approval, Apply, health check, Destroy Plan, approval, and Destroy flow. Verify no deployment-owned resources remain.
