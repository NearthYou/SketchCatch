# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch `fix/sw/495-live-observation-template` includes `origin/dev` at `75c46ce7`; documentation-only merge conflicts were resolved while preserving both workstreams.
- Branch `fix/sw/495-live-observation-template` now places Design Analysis at the bottom of Live Observation instead of exposing a separate Workspace right-panel mode. It combines current-Board Design Simulation results with Pre-Deployment security findings and recommendations without changing runtime observation controls.
- Focused integration checks pass 33/33; browser QA verifies the actual combined rendering order. Web and root lint/typecheck/build, harness, and diff checks pass. HTTPS 3000 and API 4000 return 200.
- Branch `fix/ck/477-ai-chatting-bug-fix` includes committed all-question validation, both-chat selection synchronization, clarification probes, diagram patch probes, and complete resource alias coverage.
- The running Web-to-API path repeats the frontend question for the reported daily-user-count phrase and the region question for the reported Spring Boot phrase, with explicit unrelated-answer feedback.
- The branch includes the committed Architecture Draft Korean-explanation, `다음 행동` cleanup, and fresh-draft routing fix.

## Changes This Session

- Restored the orphaned Design Simulation capability inside Live Observation instead of a separate right-panel mode or the legacy all-in-one AI panel.
- Added one user-triggered, read-only analysis action for bottlenecks, failures, security risks, estimated cost, and recommendations, including stale-Board feedback.
- Expanded database storage, country-level region, and conversational photo-upload clarification semantics.
- Verified EC2 sizing, RDS removal, S3 addition, EC2-to-Lambda replacement, and connected CloudFront addition against proposed graph outcomes.
- Added Korean names and generated aliases for every supported resource type, with common service terms and abbreviations. `로드 밸런서 넣어줘` now creates a connected load balancer when one compute target is unambiguous.
- Tightened all required-question free-form validation so numeric and generic words cannot satisfy an unrelated category; rejected answers explain why before repeating the question.
- Both chat surfaces keep the answered question options disabled and selected, without adding standalone accepted-answer receipt messages.
- Shared staged progress appears only after all clarification questions are complete and the server begins generating the final Architecture Draft.
- `한달에 한 30정도로` is accepted as a monthly 30만원 budget and mapped to the normal budget profile; answers with time, traffic, size, or percentage units remain excluded.
- Equal Board prop replacements keep the proposal revision stable; real Board content changes continue to invalidate proposals.
- Board approval copy and actions use separate rows in the narrow Workbench.
- Diagram AI results no longer render a separate `다음 행동` section in either chat surface.
- Amazon Q is instructed to return Korean user-facing prose; English `Architecture Draft` suffixes and known English highlights are normalized, while unknown English-only highlights fall back to a Korean resource summary.
- Focused API tests pass 86/86, Workbench contract tests pass 22/22, and API/Web typechecks pass.
- A pending patch clarification no longer captures explicit fresh-draft requests such as `다이어그램 생성하고 싶어`; resource answers such as `서버 만들고 싶어` remain patch answers.
- Focused fresh-draft routing tests pass 2/2 and Web typecheck passes.
- Selecting a chat option re-enables transcript following so the newly appended question scrolls into view without changing manual scroll preservation for other updates.
- Workbench contract tests pass 22/22 and Web typecheck passes.
- Both diagram-generation chats now use one patch-clarification matcher and option presenter, plus the same fresh-draft routing and special-answer handling.
- Focused routing/clarification tests pass 13/13, including five shared examples; Web typecheck passes.

## Broken Or Unverified

- A populated Board analysis run was not repeated; the integrated empty-Board presentation and enabled action were verified in the browser.

## Best Next Action

1. Review PR #491 after CI and merge it into `dev` when approved.
2. Keep real Live Observation scale-out acceptance blocked until a newly approved non-production Plan/Apply/traffic/Destroy cycle.
3. Merge the production runtime drift-review PR only after a current review-only Plan passes; never use a targeted Apply.

## Production Runtime Plan Review

- Review-only production runtime Plan 29498864502 at `c8b107d3` succeeded with 3 add, 7 change, and 2 task-definition replacement destroys. It injects the GitHub App Secret into API and worker and preserves the Live Observation capability Secret; no Secret value was recorded.
- Branch `fix/sw/production-runtime-plan-drift` stores the existing capability ARN as a dedicated production-infra-plan Environment Secret and overlays it into the runtime tfvars without replacing `PRODUCTION_INFRA_RUNTIME_TFVARS_JSON`.

## PR #439 Follow-up Review

- Pending follow-up branch scopes the static Secret checks to their declared Terraform sets, selects the named worker container in the Terraform test, and removes an unnecessary `tolist` conversion.
- The nullable worker Secret list is normalized with `try(..., [])` so the test remains safe when `secrets` is absent or null.
- Harness, structure check, Terraform formatting, lint, typecheck, build, and diff check pass. Local Terraform validate/test cannot load the uncached AWS provider 6.54.0; no cloud mutation was performed.

## Live Observation Sandbox Run

- Approved sandbox Deployment `49911285-260e-4fce-a645-a4ca9efa098f` attempted the exact `+36` Plan, failed at `application-autoscaling:RegisterScalableTarget`, and is now `DESTROYED` after a successful 34-resource partial-state cleanup. Direct AWS checks found no remaining target VPC, ALB, ECS cluster, CloudFront distribution, ECR repository, log group, or generated web bucket. Preserve `sketchcatch-control-614935468487-apne2-7cccab4b` and `SketchCatchTerraformExecutionRole`.
- `apps/api/src/live-observations/aws-live-observation-snapshot-provider.ts` shortens the STS session prefix from `sketchcatch-live-observation-` to `sketchcatch-live-obs-`; focused tests and all required root checks pass.
- The Live Observation changes are assigned to `fix/ys/479-uiux-수정`; `apps/web/next-env.d.ts` matches the index, and the requested local servers remain on HTTPS 3000 and HTTP 4000.
- The focused linear Live Observation UI is restored on top of v2: accepted requests and fresh CloudWatch ALB request snapshots trigger particles, while provider `running/desired/max` drives Fargate Task slots. The full immutable Architecture map remains available in a collapsed disclosure.
- The built-in ECS Fargate Template now emits CloudFront HTTPS -> ALB -> ECS traffic plus bounded Application Auto Scaling (`min=1`, `max=3`, `ALBRequestCountPerTarget=10`). Template graph/render regressions and Terraform init/validate pass.
- The current work is linked to issue #495, branch `fix/sw/495-live-observation-template`, and Draft PR #497. Do not claim live scale-out. Before another approved cycle, add the required Application Auto Scaling actions to `SketchCatchTerraformExecutionRole` and create or permit creation of `AWSServiceRoleForApplicationAutoScaling_ECSService`; the latest cycle sent no traffic and completed cleanup.
