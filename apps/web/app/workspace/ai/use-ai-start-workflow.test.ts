import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  AiArchitectureDraftResult,
  ArchitectureBoardCompilationProposal,
  DiagramJson
} from "@sketchcatch/types";
import { WorkspaceAiChatRequestRegistry } from "../../../features/workspace/workspace-ai-chat-request";
import { getAiStartDraftTransport } from "./ai-start-request-policy";
import { resolveFinalArchitectureDiagram } from "./workspace-ai-presentation";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("새 프로젝트는 progress stream, 기존 프로젝트는 JSON transport를 선택한다", () => {
  assert.equal(getAiStartDraftTransport(undefined), "stream");
  assert.equal(getAiStartDraftTransport("project-1"), "json");
});

test("JSON Draft와 patch transport는 같은 request registry에서 취소와 stale 응답을 차단한다", () => {
  const registry = new WorkspaceAiChatRequestRegistry();
  const draftRequest = registry.begin("draft");
  const patchRequest = registry.begin("draft");

  assert.equal(draftRequest.signal.aborted, true);
  assert.equal(registry.isActive("draft", draftRequest), false);
  assert.equal(registry.isActive("draft", patchRequest), true);
  assert.equal(registry.cancel("draft"), true);
  assert.equal(patchRequest.signal.aborted, true);
});

test("Compiler 성공 전에는 final Preview Diagram을 공개하지 않는다", () => {
  const diagram = { edges: [], nodes: [], viewport: { x: 0, y: 0, zoom: 1 } } as DiagramJson;
  const draft: AiArchitectureDraftResult = {
    architectureJson: { edges: [], nodes: [] },
    title: "Compiler boundary test",
    metadata: {
      assumptions: [],
      confidence: "low",
      explanations: [],
      guardrailWarnings: [],
      source: "prompt"
    }
  };
  const proposal = { diagram } as ArchitectureBoardCompilationProposal;

  assert.equal(resolveFinalArchitectureDiagram(null, proposal), null);
  assert.equal(resolveFinalArchitectureDiagram(draft, null), null);
  assert.equal(resolveFinalArchitectureDiagram(draft, proposal), diagram);
});

test("AI 시작 Draft와 Patch는 Compiler proposal과 ProjectDraft revision 승인 경계를 함께 사용한다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");

  assert.match(source, /compileArchitectureDraftProposal/);
  assert.doesNotMatch(source, /getDiagramJsonForArchitectureDraft/);
  assert.match(source, /showDraft\(nextDraft, baseDiagram, createPatchSummary\(response\)\)/);
  assert.match(source, /getProjectDraft\(existingProjectId\)/);
  assert.match(
    source,
    /expectedRevision:\s*existingProjectId \? \(existingProjectDraftRevision \?\? null\) : null/
  );
  assert.match(source, /diagramJson: compilationProposal\.diagram/);
  assert.match(source, /canApprove:[\s\S]*compilationProposal !== null/);
  assert.equal((source.match(/await saveProjectDraft\(/g) ?? []).length, 1);
});
test("두 다이어그램 생성 채팅은 같은 자연어 답변 검증과 선택 표시 경로를 사용한다", () => {
  const aiStartSource = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");
  const workspaceDockSource = readFileSync(
    join(currentDir, "../../../features/workspace/WorkspaceAiChatDock.tsx"),
    "utf8"
  );
  const aiStartTranscriptSource = readFileSync(
    join(currentDir, "conversation-transcript.tsx"),
    "utf8"
  );

  for (const source of [aiStartSource, workspaceDockSource]) {
    assert.match(source, /withArchitectureDraftClarificationAnswer/);
    assert.match(source, /resolveAcceptedArchitectureDraftClarificationSelection/);
    assert.match(source, /questionMessageId/);
  }

  assert.match(aiStartSource, /setAcceptedClarificationSelection/);
  assert.match(workspaceDockSource, /markChatMessageSuggestionsSelected/);
  assert.doesNotMatch(aiStartTranscriptSource, /반영된 답변/);
  assert.doesNotMatch(aiStartTranscriptSource, /suggestionSelected|>선택됨</);
  assert.doesNotMatch(workspaceDockSource, /반영된 답변/);
  assert.match(aiStartTranscriptSource, /requestState === "loading"[\s\S]*WorkspaceAiWorkbenchDraftProgress/);
  assert.doesNotMatch(aiStartTranscriptSource, /progressSnapshot !== null/);
  assert.match(workspaceDockSource, /draftState === "loading"[\s\S]*WorkspaceAiWorkbenchDraftProgress/);
  assert.doesNotMatch(workspaceDockSource, /draftGenerationProgressVisible/);
});

test("설계 제안은 Amazon Q 설명 없이 승인 경계만 표시한다", () => {
  const workspaceDockSource = readFileSync(
    join(currentDir, "../../../features/workspace/WorkspaceAiChatDock.tsx"),
    "utf8"
  );
  const draftProposalSource = workspaceDockSource.slice(
    workspaceDockSource.indexOf('activeChatTab === "draft" && draft !== null'),
    workspaceDockSource.indexOf('activeChatTab === "draft" && patchPreviewModel !== null')
  );

  assert.doesNotMatch(draftProposalSource, /WorkspaceAiWorkbenchExplanation/);
  assert.match(draftProposalSource, /Board 변경 승인/);
});

test("두 다이어그램 생성 채팅은 같은 수정 재질문과 신규 초안 라우팅을 사용한다", () => {
  const aiStartSource = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");
  const workspaceDockSource = readFileSync(
    join(currentDir, "../../../features/workspace/WorkspaceAiChatDock.tsx"),
    "utf8"
  );

  for (const source of [aiStartSource, workspaceDockSource]) {
    assert.match(source, /workspace-ai-patch-clarification/);
    assert.match(source, /shouldStartFreshDraftDuringPatchClarification/);
    assert.match(source, /resolvePendingPreviewChatAction/);
  }

  assert.match(aiStartSource, /isNoResourceAdditionSuggestion/);
  assert.match(aiStartSource, /isServicePurposePatchClarification/);
  assert.match(aiStartSource, /isSkipConnectionSuggestion/);
});
