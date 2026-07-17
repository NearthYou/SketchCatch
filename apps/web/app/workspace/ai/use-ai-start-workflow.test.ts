import assert from "node:assert/strict";
import test from "node:test";
import type {
  AiArchitectureDraftResult,
  ArchitectureBoardCompilationProposal,
  DiagramJson
} from "@sketchcatch/types";
import { WorkspaceAiChatRequestRegistry } from "../../../features/workspace/workspace-ai-chat-request";
import { getAiStartDraftTransport } from "./ai-start-request-policy";
import { resolveFinalArchitectureDiagram } from "./workspace-ai-presentation";

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
