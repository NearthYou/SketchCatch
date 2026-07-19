import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitecturePatchClarification } from "@sketchcatch/types";
import {
  findPatchClarificationCandidate,
  findPatchClarificationSuggestion,
  getPatchClarificationSuggestions,
  isAddResourceConnectionClarification,
  isNoResourceAdditionSuggestion,
  isServicePurposePatchClarification,
  isSkipConnectionSuggestion
} from "./workspace-ai-patch-clarification";

const connectionClarification = {
  candidates: [
    {
      label: "웹 서버",
      resourceId: "server-1",
      resourceType: "ec2"
    }
  ],
  intent: {
    instruction: "로드 밸런서 넣어줘",
    requestedAction: "add_resource",
    resourceType: "load_balancer"
  },
  question: "어디에 연결할까요?",
  status: "needs_clarification",
  suggestions: ["연결하지 않기"]
} as unknown as ArchitecturePatchClarification;

test("두 채팅에서 자연어로 말한 후보 리소스를 같은 방식으로 찾는다", () => {
  assert.equal(
    findPatchClarificationCandidate(connectionClarification, "웹 서버에 연결해줘")?.resourceId,
    "server-1"
  );
});

test("두 채팅에서 선택지를 포함한 자연어 답변을 같은 선택으로 해석한다", () => {
  assert.equal(
    findPatchClarificationSuggestion(connectionClarification, "이번에는 연결하지 않기로 해줘"),
    "연결하지 않기"
  );
});

test("리소스 연결 재질문은 후보와 건너뛰기 선택지를 함께 보여준다", () => {
  assert.equal(isAddResourceConnectionClarification(connectionClarification), true);
  assert.deepEqual(getPatchClarificationSuggestions(connectionClarification), [
    "웹 서버 (ec2)",
    "연결하지 않기"
  ]);
});

test("서비스 목적 재질문은 후보 대신 API가 준 목적 선택지만 보여준다", () => {
  const clarification = {
    candidates: [],
    intent: {
      instruction: "서버 추가해줘",
      requestedAction: "manual_review"
    },
    question: "어떤 용도인가요?",
    status: "needs_clarification",
    suggestions: ["웹 API 서버", "배치 작업 서버"]
  } as unknown as ArchitecturePatchClarification;

  assert.equal(isServicePurposePatchClarification(clarification), true);
  assert.deepEqual(getPatchClarificationSuggestions(clarification), [
    "웹 API 서버",
    "배치 작업 서버"
  ]);
});

test("추가 취소와 연결 생략 선택지를 두 채팅에서 동일하게 판정한다", () => {
  assert.equal(isNoResourceAdditionSuggestion("추가 안 함"), true);
  assert.equal(isSkipConnectionSuggestion("연결하지 않기"), true);
});
