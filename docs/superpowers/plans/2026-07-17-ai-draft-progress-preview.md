# AI 초안 진행 프리뷰 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 프로젝트의 첫 AI 초안 대화가 진행되는 동안 오른쪽에 서버 기반 요구사항·잠정 Resource 구성을 표시하고, 안전한 후보 제외·되돌리기와 반응형 전환을 제공한다.

**Architecture:** 기존 `POST /api/ai/architecture-draft/stream` NDJSON 경계를 유지하면서 진행 이벤트를 순번이 있는 전체 `ArchitectureDraftProgressSnapshot`으로 확장한다. 새 프로젝트 Web workflow만 전용 스트림 클라이언트를 사용하며, 진행 프리뷰 상태는 최종 `ArchitectureDraft`/Compiler proposal과 분리한다. 후보 제외는 구조화된 요청 계약으로 서버에 전달하고, 실제 Architecture Board에는 최종 사용자 승인 전까지 어떤 변경도 적용하지 않는다.

**Tech Stack:** TypeScript, Fastify, Zod, Next.js 16, React 19, React Flow, CSS Modules, Node test runner/tsx, pnpm workspace

## Global Constraints

- 적용 범위는 새 프로젝트의 첫 `AI 초안 만들기` 대화뿐이다. `existingProject`와 Workspace AI 수정 제안은 기존 동작을 유지한다.
- 오른쪽은 진행 프리뷰다. 확대·축소, 화면 이동, 서버가 허용한 후보 `제외`와 즉시 `되돌리기`만 제공한다.
- Resource 위치·연결·설정 편집, 후보 유지, 승인, Architecture Board 적용은 진행 프리뷰에서 제공하지 않는다.
- Resource 후보는 클라이언트가 추측하지 않고 서버 `ArchitectureDraftProgressSnapshot`에서만 가져온다.
- 각 스냅샷은 증가하는 `sequence`와 현재 전체 상태를 포함하며 같은 요청의 이전 스냅샷을 대체한다.
- 오류·사용자 취소 시 마지막 정상 스냅샷을 유지하고 중단 상태를 표시한다. 재시도는 그 화면에서 다시 갱신한다.
- 최종 `ArchitectureDraft`가 오면 중간 후보와 달라진 부분을 표시한 뒤 최종 Preview가 현재 결과를 대체한다.
- 모바일은 `대화 / 진행 중인 초안` 전환형이고 진행 상태는 항상 보인다. 데스크톱은 두 화면을 동시에 조작할 수 있다.
- 진행 상태는 현재 브라우저 세션에만 존재하며 새로고침·재진입 복원은 추가하지 않는다.
- 기존 JSON `POST /api/ai/architecture-draft` 계약과 Repository Analysis 권한 경로를 변경하지 않는다.
- 새 런타임 의존성과 DB migration을 추가하지 않는다.

---

### Task 1: 공유 타입과 서버 전체 Snapshot 계약

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/services/aiArchitectureDrafts.ts`
- Modify: `apps/api/src/services/aiArchitectureDrafts.test.ts`
- Create: `apps/api/src/routes/ai-architecture-draft-stream.test.ts`
- Modify: `docs/data-models.md`

**Interfaces:**
- Produces: `ArchitectureDraftCandidateExclusion`, `ArchitectureDraftProgressSnapshot`, additive `CreateArchitectureDraftRequest.candidateExclusions`, `ArchitectureDraftStreamEvent.progress.snapshot`.
- Produces: `CreateArchitectureDraftResponseFactory(..., { onProgress(snapshot) })` where every callback receives a complete snapshot.
- Consumes: existing deterministic `createArchitectureDraft(request)` and existing NDJSON stream route.

- [ ] **Step 1: Write failing shared/API tests**

Add assertions equivalent to:

```ts
const snapshots: ArchitectureDraftProgressSnapshot[] = [];
await createAmazonQArchitectureDraftResponse(request, {
  provider,
  creditPolicy: confirmedCreditPolicy,
  onProgress: (snapshot) => snapshots.push(snapshot)
});

assert.deepEqual(snapshots.map(({ sequence }) => sequence), [1, 2, 3, 4, 5]);
assert.ok(snapshots.every((snapshot) => snapshot.confirmedRequirements.length > 0));
assert.ok(snapshots.some((snapshot) => snapshot.provisionalArchitectureJson?.nodes.length));
```

The route test must parse every NDJSON line and assert `progress.snapshot.sequence`, full replacement data, terminal `result`, and terminal `error.statusCode`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts src/routes/ai-architecture-draft-stream.test.ts
```

Expected: FAIL because snapshot and exclusion contracts do not exist.

- [ ] **Step 3: Add the shared contracts**

Implement the contract with these shapes:

```ts
export type ArchitectureDraftCandidateExclusion = {
  candidateId: string;
  resourceType: ResourceType;
  label: string;
};

export type ArchitectureDraftProgressSnapshot = {
  sequence: number;
  stage: ArchitectureDraftProgressStage;
  confirmedRequirements: string[];
  pendingQuestions: string[];
  provisionalArchitectureJson: ArchitectureJson | null;
  excludableCandidateIds: string[];
};
```

Keep the existing `stage` field on progress events and add `snapshot` for transport compatibility. Validate exclusions with Zod limits: maximum 32 entries, non-empty `candidateId`/`label`, and `resourceType: z.enum(RESOURCE_TYPES)`.

- [ ] **Step 4: Emit complete snapshots from the service**

Create one request-scoped reporter that owns `sequence`, last provisional graph, confirmed requirement summaries, pending question, and excludable IDs. Emit at every existing stage callback. Build the provisional graph with existing deterministic server logic after requirements are usable; never infer Resource candidates in Web code. Apply `candidateExclusions` to provisional and final graphs by resource type and remove incident edges. Candidate exclusion/reporting failures must remain observational and must not interrupt final generation.

- [ ] **Step 5: Serialize snapshots through the existing NDJSON route**

Use:

```ts
const onProgress = (snapshot: ArchitectureDraftProgressSnapshot): void => {
  writeEvent({ type: "progress", stage: snapshot.stage, snapshot });
};
```

Do not change the JSON route. Keep terminal errors inside NDJSON after headers are sent.

- [ ] **Step 6: Verify GREEN and typecheck the server boundary**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts src/routes/ai-architecture-draft-stream.test.ts
pnpm --filter @sketchcatch/types typecheck
pnpm --filter @sketchcatch/api typecheck
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/types/src/index.ts apps/api/src/routes/ai.ts apps/api/src/routes/ai-architecture-draft-stream.test.ts apps/api/src/services/aiArchitectureDrafts.ts apps/api/src/services/aiArchitectureDrafts.test.ts docs/data-models.md
git commit -m "feat: stream AI draft progress snapshots"
```

### Task 2: Web NDJSON client and pure progress state model

**Files:**
- Modify: `apps/web/features/workspace/api.ts`
- Modify: `apps/web/features/workspace/workspace-api-abort.test.ts`
- Create: `apps/web/features/workspace/workspace-ai-draft-stream.test.ts`
- Create: `apps/web/app/workspace/ai/ai-draft-progress-model.ts`
- Create: `apps/web/app/workspace/ai/ai-draft-progress-model.test.ts`
- Modify: `apps/web/app/api/ai/architecture-draft/proxy.ts`
- Create: `apps/web/app/api/ai/architecture-draft/proxy.test.ts`

**Interfaces:**
- Consumes: `ArchitectureDraftProgressSnapshot` and `ArchitectureDraftStreamEvent` from Task 1.
- Produces: `createAiArchitectureDraftStream(input, { signal, onProgress })` without changing `createAiArchitectureDraft`.
- Produces: pure helpers for newer-sequence replacement, provisional Diagram filtering, change history, exclusion/undo, and final difference counts.

- [ ] **Step 1: Write failing parser/model tests**

Cover NDJSON split across arbitrary chunks, multiple lines in one chunk, exact terminal `statusCode`, malformed/missing result, AbortError preservation, stale sequence rejection, full snapshot replacement, exclusion, undo, and final added/removed candidate diff.

```ts
assert.equal(acceptProgressSnapshot(current, older), current);
assert.deepEqual(excludeProgressCandidate(snapshot, exclusion).provisionalArchitectureJson?.nodes, expectedNodes);
assert.deepEqual(undoProgressCandidate(excluded, exclusion), snapshot);
```

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-draft-stream.test.ts features/workspace/workspace-api-abort.test.ts app/workspace/ai/ai-draft-progress-model.test.ts app/api/ai/architecture-draft/proxy.test.ts
```

Expected: FAIL because the stream client/model do not exist.

- [ ] **Step 3: Implement the dedicated stream client**

Post to `/ai/architecture-draft/stream` with `Accept: application/x-ndjson`, authenticated browser headers consistent with `postPublicAiJson`, and caller `AbortSignal`. Parse lines incrementally, forward only progress snapshots, throw `ApiClientError(event.error.statusCode, event.error, requestContext)`, and require one terminal result.

- [ ] **Step 4: Implement the pure progress model**

Keep transport state separate from React. Exclusion filters matching provisional nodes and incident edges, records a compact history entry, and can be reversed from the original latest server snapshot. Final difference compares Resource type/label identity without mutating either graph.

- [ ] **Step 5: Forward browser cancellation through the Next proxy**

Combine `request.signal` with the existing 115-second timeout using `AbortSignal.any`. Preserve the existing 503 timeout/connection response for genuine upstream failures and do not convert caller abort into a fake Amazon Q error.

- [ ] **Step 6: Verify GREEN and Web typecheck**

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/workspace-ai-draft-stream.test.ts features/workspace/workspace-api-abort.test.ts app/workspace/ai/ai-draft-progress-model.test.ts app/api/ai/architecture-draft/proxy.test.ts
pnpm --filter @sketchcatch/web typecheck
```

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/web/features/workspace/api.ts apps/web/features/workspace/workspace-api-abort.test.ts apps/web/features/workspace/workspace-ai-draft-stream.test.ts apps/web/app/workspace/ai/ai-draft-progress-model.ts apps/web/app/workspace/ai/ai-draft-progress-model.test.ts apps/web/app/api/ai/architecture-draft/proxy.ts apps/web/app/api/ai/architecture-draft/proxy.test.ts
git commit -m "feat: consume AI draft progress stream"
```

### Task 3: 새 프로젝트 진행 프리뷰와 반응형 상호작용

**Files:**
- Modify: `apps/web/app/workspace/ai/use-ai-start-workflow.ts`
- Modify: `apps/web/app/workspace/ai/use-ai-start-workflow.test.ts`
- Modify: `apps/web/app/workspace/ai/workspace-ai-start-client.tsx`
- Modify: `apps/web/app/workspace/ai/workspace-ai-start-client.test.ts`
- Modify: `apps/web/app/workspace/ai/ai-draft-board-preview.tsx`
- Modify: `apps/web/app/workspace/ai/workspace-ai-start.module.css`

**Interfaces:**
- Consumes: Task 2 stream client/model.
- Produces: workflow fields `progressSnapshot`, `progressStatus`, `progressDiagram`, `progressHistory`, `lastExclusion`, `excludeProgressCandidate`, `undoLastExclusion`, `retryDraft`, `mobilePane`.
- Preserves: existing final `draft`, `compilationProposal`, `previewDiagram`, approval/save flow, Repository existing-project flow.

- [ ] **Step 1: Write failing workflow/source contract tests**

Assert new-project requests use the stream function while `existingProject` uses the existing JSON path, stale aborted requests cannot overwrite the active request, final result clears the current progress view only after computing transition data, and the UI contains mobile tabs, persistent status, candidate exclusion/undo, and no progress-edit actions.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm --filter @sketchcatch/web exec tsx --test app/workspace/ai/ai-start-model.test.ts app/workspace/ai/ai-draft-progress-model.test.ts app/workspace/ai/use-ai-start-workflow.test.ts app/workspace/ai/workspace-ai-start-client.test.ts
```

- [ ] **Step 3: Integrate request identity and progress lifecycle**

Use an `AbortController` ref with monotonically increasing request identity. Excluding a server-approved candidate aborts the active stream, immediately filters the visible snapshot, stores undo data, and starts a new request carrying `candidateExclusions`. Ignore all progress/result/error events from inactive requests. On error/cancel keep the last snapshot and mark it `interrupted`; retry keeps it visible until a newer sequence arrives.

- [ ] **Step 4: Render the desktop progress preview**

Show current stage, confirmed requirement cards, pending question count, provisional graph, “대화에 따라 바뀔 수 있어요” notice, and compact added/removed history. Reuse `AiDraftBoardPreview` with editing disabled. Show `제외` only for `excludableCandidateIds`; do not show `유지`, approval, node dragging, edge creation, or config editing.

- [ ] **Step 5: Add undo and final transition**

After exclusion, render a live-region notice with `되돌리기`. On final result, briefly expose added/removed counts and then render only the existing final Preview/Compiler summary/Board apply footer.

- [ ] **Step 6: Implement mobile pane switching**

At `max-width: 720px`, render one active pane controlled by accessible `대화` and `진행 중인 초안` tabs. Keep the top status visible at `390x844`, remove horizontal overflow, and retain desktop two-column independent scrolling at `1024x768` and `1440x900`.

- [ ] **Step 7: Verify GREEN, app tests, and Web package checks**

```bash
pnpm --filter @sketchcatch/web exec tsx --test app/workspace/ai/ai-start-model.test.ts app/workspace/ai/ai-draft-progress-model.test.ts app/workspace/ai/use-ai-start-workflow.test.ts app/workspace/ai/workspace-ai-start-client.test.ts features/workspace/workspace-ai-draft-stream.test.ts features/workspace/workspace-api-abort.test.ts
pnpm --filter @sketchcatch/web test
pnpm --filter @sketchcatch/web lint
pnpm --filter @sketchcatch/web typecheck
```

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/web/app/workspace/ai/use-ai-start-workflow.ts apps/web/app/workspace/ai/use-ai-start-workflow.test.ts apps/web/app/workspace/ai/workspace-ai-start-client.tsx apps/web/app/workspace/ai/workspace-ai-start-client.test.ts apps/web/app/workspace/ai/ai-draft-board-preview.tsx apps/web/app/workspace/ai/workspace-ai-start.module.css
git commit -m "feat: show live AI draft progress preview"
```

### Task 4: 브라우저 QA, 문서·하네스, 전체 검증과 리뷰

**Files:**
- Modify: `agent-progress.md`
- Modify only if continuation remains: `session-handoff.md`
- Modify if contract wording changed during implementation: `CONTEXT.md`, `docs/adr/0012-structured-draft-progress-view.md`, `docs/data-models.md`

**Interfaces:**
- Consumes: complete implementation from Tasks 1-3.
- Produces: fresh verification evidence, reviewer findings resolved, clean committed branch.

- [ ] **Step 1: Run focused cross-package tests**

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/services/aiArchitectureDrafts.test.ts src/routes/ai-architecture-draft-stream.test.ts
pnpm --filter @sketchcatch/web exec tsx --test app/workspace/ai/ai-start-model.test.ts app/workspace/ai/ai-draft-progress-model.test.ts app/workspace/ai/use-ai-start-workflow.test.ts app/workspace/ai/workspace-ai-start-client.test.ts features/workspace/workspace-ai-draft-stream.test.ts features/workspace/workspace-api-abort.test.ts app/api/ai/architecture-draft/proxy.test.ts
```

- [ ] **Step 2: Run local browser verification**

Start `pnpm dev`, enter through `/workspace/new?fresh=1`, and verify at `1440x900`, `1024x768`, `390x844`, and the `720/721px` boundary: live updates, independent chat/preview navigation, pan/zoom, exclusion/undo, no edit/apply controls before final, interrupted retry, final replacement, mobile pane tabs, and no horizontal overflow. Confirm reload does not restore progress and `existingProject` does not opt into this flow.

- [ ] **Step 3: Run full repository gates**

```bash
pnpm harness:check
pnpm test:core
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Run root `pnpm test` if the local sandbox/Terraform prerequisites are available. Record pre-existing failures exactly instead of marking them passing.

- [ ] **Step 4: Request whole-branch code review and resolve findings**

Review the full branch range from merge base to HEAD against issue #448, ADR 0012, and this plan. Fix all Critical and Important findings, rerun covering tests, and repeat review until approved.

- [ ] **Step 5: Update durable evidence and commit**

Record completed behavior, exact commands, browser sizes, failures, and next action in `agent-progress.md`. Run `pnpm harness:check` again, then commit any review/evidence fixes:

```bash
git add agent-progress.md session-handoff.md CONTEXT.md docs/adr/0012-structured-draft-progress-view.md docs/data-models.md
git commit -m "docs: record AI draft progress verification"
```
