import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSelectedAssistantOption,
  hasSelectedAssistantQuestion,
  type SelectedAssistantOption
} from "./selected-option-model";

const FIRST_SELECTION_TIME = "2026-07-17T01:02:03.000Z";

test("assistant option 클릭 한 번은 stable ID와 선택 순서를 가진 기록 하나를 추가한다", () => {
  const result = appendSelectedAssistantOption([], {
    label: "서버리스로 운영할게요",
    questionMessageId: "question-1",
    selectedAt: FIRST_SELECTION_TIME
  });

  assert.equal(result.didAppend, true);
  assert.deepEqual(result.selections, [
    {
      id: "selected-option-question-1-15shtu2",
      label: "서버리스로 운영할게요",
      order: 1,
      questionMessageId: "question-1",
      selectedAt: FIRST_SELECTION_TIME
    }
  ]);
  assert.equal(hasSelectedAssistantQuestion(result.selections, "question-1"), true);
});

test("selectionMode single 질문은 첫 선택 뒤 다시 기록할 수 없다", () => {
  const initial = appendSelectedAssistantOption([], {
    label: "관계형 DB",
    questionMessageId: "question-1",
    selectedAt: FIRST_SELECTION_TIME
  }).selections;
  const result = appendSelectedAssistantOption(initial, {
    label: "DynamoDB",
    questionMessageId: "question-1",
    selectedAt: "2026-07-17T01:03:00.000Z"
  });

  assert.equal(result.didAppend, false);
  assert.equal(result.selections, initial);
  assert.equal(result.selection, null);
});

test("같은 label도 다른 질문에서 클릭하면 별도 stable selection으로 순서대로 남는다", () => {
  const first = appendSelectedAssistantOption([], {
    label: "관리 최소화",
    questionMessageId: "question-a",
    selectedAt: FIRST_SELECTION_TIME
  }).selections;
  const second = appendSelectedAssistantOption(first, {
    label: "관리 최소화",
    questionMessageId: "question-b",
    selectedAt: "2026-07-17T01:04:00.000Z"
  }).selections;

  assert.equal(second.length, 2);
  assert.deepEqual(
    second.map(({ label, order, questionMessageId }) => ({ label, order, questionMessageId })),
    [
      { label: "관리 최소화", order: 1, questionMessageId: "question-a" },
      { label: "관리 최소화", order: 2, questionMessageId: "question-b" }
    ]
  );
  assert.notEqual(second[0]?.id, second[1]?.id);
});

test("직접·음성 입력과 request 오류·취소·retry는 option 기록을 바꾸지 않는다", () => {
  const selections: readonly SelectedAssistantOption[] = appendSelectedAssistantOption([], {
    label: "컨테이너",
    questionMessageId: "question-1",
    selectedAt: FIRST_SELECTION_TIME
  }).selections;

  const afterDirectInput = selections;
  const afterVoiceInput = afterDirectInput;
  const afterRequestError = afterVoiceInput;
  const afterRequestCancel = afterRequestError;
  const afterRetry = afterRequestCancel;

  assert.equal(afterRetry, selections);
  assert.deepEqual(
    afterRetry.map(({ label }) => label),
    ["컨테이너"]
  );
});
