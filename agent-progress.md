# Agent Progress

Short English-only working log for the current agent context. Older records are archived under `docs/agent-history/`.

## Current Verified State

- Branch: `fix/ck/275-ai-chat-bug-fix`.
- Base: current branch includes the prior AI chat suggestion-locking commit.
- GitHub issue: #275, AI chat bug fixes.
- Scope: prevent stale suggestion reuse, block unrelated free-form AI chat prompts, and keep mobile app requests out of website-specific clarification paths.

## Session Record

2026-07-09:

- Merged latest `origin/dev`, including the harness state-file trim that archives older progress history under `docs/agent-history/`.
- Fixed project deletion order so Git/CI/CD handoff references are removed before project assets and architectures.
- Fixed verified-email OAuth linking so trusted Naver SSO profiles can attach to the existing active user instead of splitting ownership.
- Added a project deletion fallback that allows project metadata deletion after resource-included Terraform destroy planning/execution cannot proceed.
- Clarified AWS connection deletion conflicts when deployment history still references an AWS connection.
- Removed blocking local DB AWS connection/deployment records for user `herry612` at the user's request; this was metadata cleanup only and did not mutate AWS resources.
- Improved AWS Role verification diagnostics so STS `AccessDenied` is reported as an AssumeRole permission problem instead of a generic connection-test failure.
- Fixed AI board conversion so visible DiagramJson resource nodes without saved parameter values still count as architecture resources instead of making the AI chat behave like the board is empty.
- Addressed PR #274 review feedback: guarded destroy warning acknowledgement when `warnings` is missing, made API fallback Terraform names use `node.id` when non-ASCII labels normalize to `resource`, and deleted Git/CI/CD handoffs before deployment rows.
- Fixed AI chat suggestion buttons so previously submitted diagram-generation choices remain selected and disabled, including restored chat history.
- Added an AI chat prompt relevance gate so unrelated or vague free-form messages do not start diagram generation or patch preview requests.
- Fixed Play Store/mobile app prompts so they are treated as mobile app backend architecture requests instead of asking the website type question.
- Fixed AI chat relevance classification so DB deletion requests such as `db 지우고 싶어` enter the Practice Architecture patch flow, while bare resource names such as `db` stay ambiguous instead of executing a modification.
- Fixed Terraform issue AI resolution so applying a suggested fix opens the Terraform code panel at the edited source line, highlights it, and changes the AI chat apply button to a disabled `수정완료` state.
- Updated the low-budget DB follow-up choice from `DB 없이 다시 만들기` to `DB 없이 만들기` and removed the internal "recreate" wording from the regenerated prompt.
- Fixed the Terraform issue AI fix application handshake so the AI chat keeps the original issue request id through the apply request/result cycle, opens the edited source line after the Terraform panel is visible, and keeps the source-line highlight visible longer.
- Fixed Terraform issue AI resolution navigation so the Issues tab `AI resolve` action immediately opens the Terraform source line, and source-line navigation now focuses and scrolls the editor, syntax layer, and line numbers together.
- Fixed the new-project AI start chat so it uses the same prompt relevance gate before draft generation and disables already submitted suggestion choices.
- Fixed the new-project AI start preview edit flow so messages like "add db here" patch the current PREVIEW instead of restarting architecture-draft clarification.
- Fixed the new-project AI start patch-clarification state so the old PREVIEW is hidden while Amazon Q asks for missing DB/resource details, then the revised PREVIEW appears only after the answer is processed.
- Addressed PR #280 review feedback: prevented Terraform editor scroll jumps while typing and kept `web app` prompts out of the mobile-app classification path.
- Cleaned `docs/sw` before the ECS planning work. Removed stale SW spec, plan, smoke, evidence, and one-off agent-rule files from the active docs folder. Kept `spec6.md` as Git/CI/CD implementation-contract reference and updated `docs/sw/README.md`.
- Updated `docs/AGENTS.md` so future documentation work removes stale `docs/sw` workstream files instead of preserving old `spec*`, `plan*`, smoke, and one-off agent-rule documents.
- Marked HARNESS-007 as blocked/deferred because the user decided not to pursue GitHub/AWS live smoke now.
- Removed the fixed selected-answer SketchCatch web deployment draft, fixed diagram fixture, and fixed Terraform Preview marker override so that the web deployment answer path goes through the Amazon Q architecture draft provider flow.
- Removed the web-side fixed-reference layout bypass so ArchitectureJson drafts now use the normal diagram conversion pipeline unless an exact `diagramJson` is explicitly returned by the draft response.
- Fixed intermittent AI chat 400s caused by stale route-level ResourceType enums rejecting generated ArchitectureJson nodes such as `LOAD_BALANCER`.
- Promoted the shared ResourceType list to a runtime `RESOURCE_TYPES` constant and reused it in AI, project architecture, and Reverse Engineering route validation.

Verification:

- `pnpm harness:check` - passed before the #270 code changes.
- `pnpm --filter @sketchcatch/api exec tsx --test src/projects/project-deletion-service.test.ts` - passed after the project deletion fix.
- `pnpm --filter @sketchcatch/api exec tsx --test src/auth/oauth-users.test.ts src/routes/oauth.test.ts` - passed after the SSO account-linking fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/projects/project-delete-flow.test.ts` - passed after the destroy fallback UI/helper changes.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api-client-error-message.test.ts` - passed after AWS connection message updates.
- `pnpm --filter @sketchcatch/api exec tsx --test src/aws-connections/aws-connection-test-service.test.ts` - failed before the AssumeRole mapper change, then passed.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-panel-state.test.ts` - failed before the unconfigured resource conversion fix, then passed.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/diagram-to-architecture.test.ts` - passed after aligning API conversion behavior.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - passed after the conversion change.
- `pnpm --filter @sketchcatch/api exec tsx --test src/projects/project-deletion-service.test.ts src/services/diagram-to-architecture.test.ts` - passed after PR #274 review fixes.
- `pnpm --filter @sketchcatch/web exec tsx --test features/projects/project-delete-flow.test.ts` - passed after PR #274 review fixes.
- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed before merging latest `origin/dev`.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed after the AI chat suggestion locking fix.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the AI chat suggestion locking fix.
- `pnpm lint` - passed after the AI chat suggestion locking fix.
- `pnpm typecheck` - passed after the AI chat suggestion locking fix.
- `pnpm build` - passed after the AI chat suggestion locking fix.
- `pnpm harness:check` - passed after the AI chat suggestion locking fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-chat-routing.test.ts` - failed before adding prompt relevance classification, then passed.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - failed before the chat dock gate, then passed.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the prompt relevance gate.
- `pnpm lint` - passed after the prompt relevance gate.
- `pnpm typecheck` - passed after the prompt relevance gate.
- `pnpm build` - passed after the prompt relevance gate.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` - failed before the Play Store/mobile app clarification fix, then passed.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-chat-routing.test.ts` - failed before adding Play Store/mobile app prompt classification, then passed.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the Play Store/mobile app fix.
- `pnpm --filter @sketchcatch/api typecheck` - passed after the Play Store/mobile app fix.
- `pnpm lint` - passed after the Play Store/mobile app fix.
- `pnpm typecheck` - passed after the Play Store/mobile app fix.
- `pnpm build` - passed after the Play Store/mobile app fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-chat-routing.test.ts` - failed before the DB deletion prompt classification fix, then passed.
- `pnpm lint` - passed after the DB deletion prompt classification fix.
- `pnpm typecheck` - passed after the DB deletion prompt classification fix.
- `pnpm build` - passed after the DB deletion prompt classification fix.
- `pnpm harness:check` - passed after the DB deletion prompt classification fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - failed before the Terraform issue AI fix navigation/button-state change, then passed.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the Terraform issue AI fix navigation/button-state change.
- `pnpm --filter @sketchcatch/web lint` - passed after the Terraform issue AI fix navigation/button-state change.
- `pnpm lint` - passed after the Terraform issue AI fix navigation/button-state change.
- `pnpm typecheck` - passed after the Terraform issue AI fix navigation/button-state change.
- `pnpm build` - passed after the Terraform issue AI fix navigation/button-state change.
- `pnpm harness:check` - passed after the Terraform issue AI fix navigation/button-state change.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-draft-follow-up.test.ts` - passed after the low-budget DB follow-up copy change.
- `pnpm lint` - passed after the low-budget DB follow-up copy change.
- `pnpm typecheck` - passed after the low-budget DB follow-up copy change.
- `pnpm build` - passed after the low-budget DB follow-up copy change.
- `pnpm harness:check` - passed after the low-budget DB follow-up copy change.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - failed before the Terraform issue AI apply handshake/focus fix, then passed.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the Terraform issue AI apply handshake/focus fix.
- `pnpm --filter @sketchcatch/web lint` - passed after the Terraform issue AI apply handshake/focus fix.
- `pnpm lint` - passed after the Terraform issue AI apply handshake/focus fix.
- `pnpm typecheck` - passed after the Terraform issue AI apply handshake/focus fix.
- `pnpm build` - passed after the Terraform issue AI apply handshake/focus fix.
- `pnpm harness:check` - passed after the Terraform issue AI apply handshake/focus fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - failed before the issue-source navigation and deterministic scroll/focus fix, then passed.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the issue-source navigation and deterministic scroll/focus fix.
- `pnpm --filter @sketchcatch/web lint` - passed after the issue-source navigation and deterministic scroll/focus fix.
- `pnpm lint` - passed after the issue-source navigation and deterministic scroll/focus fix.
- `pnpm typecheck` - passed after the issue-source navigation and deterministic scroll/focus fix.
- `pnpm build` - passed after the issue-source navigation and deterministic scroll/focus fix.
- `pnpm harness:check` - passed after the issue-source navigation and deterministic scroll/focus fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-new-project-start-mode.test.ts` - failed before the new-project AI start chat gate/suggestion lock fix, then passed.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-chat-routing.test.ts` - passed after the new-project AI start chat fix.
- `pnpm --filter @sketchcatch/web typecheck` - passed after clearing stale `.next` route types from the `origin/dev` merge and after the new-project AI start chat fix.
- `pnpm --filter @sketchcatch/web lint` - passed after the new-project AI start chat fix.
- `pnpm lint` - passed after the new-project AI start chat fix.
- `pnpm typecheck` - passed after the new-project AI start chat fix.
- `pnpm build` - passed after the new-project AI start chat fix.
- `pnpm harness:check` - passed after the new-project AI start chat fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-new-project-start-mode.test.ts` - passed after the new-project AI start preview edit fix.
- `pnpm --filter @sketchcatch/web exec tsx -e "import { classifyWorkspaceAiChatPrompt } from './features/workspace/workspace-ai-chat-routing.ts'; console.log(classifyWorkspaceAiChatPrompt('여기에 db 추가해줘')); console.log(classifyWorkspaceAiChatPrompt('db 추가해줘'));"` - returned `architecture` for both prompts.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the new-project AI start preview edit fix.
- `pnpm lint` - passed after the new-project AI start preview edit fix.
- `pnpm typecheck` - passed after the new-project AI start preview edit fix.
- `pnpm build` - passed after the new-project AI start preview edit fix.
- `pnpm harness:check` - passed after the new-project AI start preview edit fix.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-new-project-start-mode.test.ts` - failed before hiding stale PREVIEW during patch clarification, then passed.
- `pnpm --filter @sketchcatch/web typecheck` - passed after the patch-clarification preview visibility fix.
- `pnpm lint` - passed after the patch-clarification preview visibility fix.
- `pnpm typecheck` - passed after the patch-clarification preview visibility fix.
- `pnpm build` - passed after the patch-clarification preview visibility fix.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` - passed after PR #280 review feedback fixes.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-right-panel-layout.test.ts` - passed after PR #280 review feedback fixes.
- `pnpm lint` - passed after PR #280 review feedback fixes.
- `pnpm typecheck` - passed after PR #280 review feedback fixes.
- `pnpm build` - passed after PR #280 review feedback fixes.
- `pnpm harness:check` - passed after PR #280 review feedback fixes.
- `pnpm harness:check` - passed after the docs/sw cleanup and harness state repair.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts` - failed before updating the fixed selected-answer regression, then passed.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-preview.test.ts` - passed after removing the fixed Terraform marker override.
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-diagram-adapter.test.ts` - passed after removing the fixed-reference layout bypass.
- `pnpm lint` - passed after removing unused imports from deleted fixed-reference tests.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm harness:check` - passed after progress log update.
- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/aiDesignSimulation.test.ts --test-name-pattern "accepts generated load balancer"` - failed before the ResourceType schema fix, then passed.
- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/aiAwsProviders.test.ts --test-name-pattern "accepts generated load balancer"` - failed before the ResourceType schema fix, then passed.
- `pnpm --filter @sketchcatch/api exec tsx --test src/routes/aiDesignSimulation.test.ts src/routes/aiAwsProviders.test.ts` - passed after the ResourceType schema fix.
- `pnpm --filter @sketchcatch/api typecheck` - passed after the ResourceType schema fix.
- `pnpm lint` - passed after the ResourceType schema fix.
- `pnpm typecheck` - first run failed because it was run concurrently with `pnpm build` while Next.js `.next/types` were being regenerated; reran after build and passed.
- `pnpm build` - passed after the ResourceType schema fix.

Known risks:

- No real AWS IAM, IAM Identity Center, CloudFormation, Terraform apply, or Terraform destroy mutation was performed.
- The user still needs to apply caller-side `sts:AssumeRole` permission in AWS IAM Identity Center and confirm the target Role Trust Policy/External ID.
- Product source code and tests changed only to remove the fixed selected-answer draft/diagram/Terraform override. No package metadata or generated deployment artifacts were intentionally changed.
- Git/CI/CD live smoke evidence is intentionally deferred, so HARNESS-007 remains blocked until the team decides to collect real deployment evidence again.
