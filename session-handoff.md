# Session Handoff

Use this file only for compact continuation context. Write it in English.

## Currently Verified

- Branch `fix/ck/477-ai-chatting-bug-fix` includes committed all-question validation, both-chat selection synchronization, clarification probes, diagram patch probes, and complete resource alias coverage.
- The running Web-to-API path repeats the frontend question for the reported daily-user-count phrase and the region question for the reported Spring Boot phrase, with explicit unrelated-answer feedback.
- The branch includes the committed Architecture Draft Korean-explanation, `다음 행동` cleanup, and fresh-draft routing fix.

## Changes This Session

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

- Browser interaction was not rerun; verification is focused because the user requested limited testing.

## Best Next Action

- No follow-up is required for this task; continue with the next reported AI chat issue.
- No DB migration, cloud mutation, deployment, or Terraform execution is involved.
