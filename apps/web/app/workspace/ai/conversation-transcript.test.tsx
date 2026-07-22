import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ArchitectureDraftProgressSnapshot } from "@sketchcatch/types";
import { ConversationTranscript } from "./conversation-transcript";

Object.assign(globalThis, { React });

const progressSnapshot: ArchitectureDraftProgressSnapshot = {
  sequence: 1,
  provisionalArchitectureJson: {
    edges: [],
    nodes: [
      {
        config: {},
        id: "candidate-lambda",
        label: "API 처리",
        positionX: 0,
        positionY: 0,
        type: "LAMBDA"
      }
    ]
  },
  excludableCandidateIds: ["candidate-lambda"]
};

test("대화 기록은 진행 후보가 있어도 제외 control을 표시하지 않는다", () => {
  const propsWithLegacyCandidateSnapshot = {
    hasFinalPreview: false,
    isInteractionLocked: false,
    isSuggestionInputBlocked: false,
    lastExclusion: null,
    messages: [],
    onCancelRequest: () => undefined,
    onExcludeCandidate: () => undefined,
    onOpenPreview: () => undefined,
    onRetry: async () => undefined,
    onSuggestionSelect: () => undefined,
    onUndoExclusion: () => undefined,
    progressSnapshot,
    requestState: "idle" as const,
    selections: []
  };
  const html = renderToStaticMarkup(
    createElement(ConversationTranscript, propsWithLegacyCandidateSnapshot)
  );

  assert.doesNotMatch(html, /추천 후보 제외/);
  assert.doesNotMatch(html, />제외</);
});
