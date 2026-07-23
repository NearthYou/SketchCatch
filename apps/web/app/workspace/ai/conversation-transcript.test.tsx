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

test("질문 응답을 기다리는 loading에는 다이어그램 생성 안내를 표시하지 않는다", () => {
  const html = renderToStaticMarkup(
    createElement(ConversationTranscript, {
      hasFinalPreview: false,
      isInteractionLocked: false,
      isSuggestionInputBlocked: false,
      messages: [],
      onCancelRequest: () => undefined,
      onOpenPreview: () => undefined,
      onRetry: async () => undefined,
      onSuggestionSelect: () => undefined,
      progressSnapshot: null,
      requestState: "loading",
      selections: []
    })
  );

  assert.doesNotMatch(html, /role="status"/);
});

test("서버가 생성 progress를 보낸 뒤에만 다이어그램 생성 안내를 표시한다", () => {
  const html = renderToStaticMarkup(
    createElement(ConversationTranscript, {
      hasFinalPreview: false,
      isInteractionLocked: false,
      isSuggestionInputBlocked: false,
      messages: [],
      onCancelRequest: () => undefined,
      onOpenPreview: () => undefined,
      onRetry: async () => undefined,
      onSuggestionSelect: () => undefined,
      progressSnapshot,
      requestState: "loading",
      selections: []
    })
  );

  assert.match(html, /role="status"/);
});
