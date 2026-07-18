# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch `fix/ck/477-ai-chatting-bug-fix` includes committed all-question validation, both-chat selection synchronization, clarification probes, diagram patch probes, and complete resource alias coverage.
- The running Web-to-API path repeats the frontend question for the reported daily-user-count phrase and the region question for the reported Spring Boot phrase, with explicit unrelated-answer feedback.
- Current uncommitted work adds final-generation-only staged progress in both diagram chats and accepts conversational monthly budget amounts without explicit currency units.

## Changes This Session

- Expanded database storage, country-level region, and conversational photo-upload clarification semantics.
- Verified EC2 sizing, RDS removal, S3 addition, EC2-to-Lambda replacement, and connected CloudFront addition against proposed graph outcomes.
- Added Korean names and generated aliases for every supported resource type, with common service terms and abbreviations. `로드 밸런서 넣어줘` now creates a connected load balancer when one compute target is unambiguous.
- Tightened all required-question free-form validation so numeric and generic words cannot satisfy an unrelated category; rejected answers explain why before repeating the question.
- Both chat surfaces keep the answered question options disabled and selected, without adding standalone accepted-answer receipt messages.
- Shared staged progress appears only after all clarification questions are complete and the server begins generating the final Architecture Draft.
- `한달에 한 30정도로` is accepted as a monthly 30만원 budget and mapped to the normal budget profile; answers with time, traffic, size, or percentage units remain excluded.

## Broken Or Unverified

- Focused Web progress/selection tests pass 11/11 and final focused monthly-budget regressions pass 2/2; the cross-question regression passed earlier. CSS parsing and Next.js compilation pass, while the sandbox blocks the build after compilation with `spawn EPERM`.

## Best Next Action

- Commit UI progress changes, budget parsing changes, and session records as separate logical commits; then verify a clean worktree.
- No DB migration, cloud mutation, deployment, or Terraform execution is involved.
