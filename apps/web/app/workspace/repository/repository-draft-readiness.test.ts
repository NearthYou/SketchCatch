import assert from "node:assert/strict";
import { test } from "node:test";
import { getRepositoryDraftBlockingIssue } from "./repository-draft-readiness";

test("public Repository draft does not require a CI/CD connection", () => {
  assert.deepEqual(
    getRepositoryDraftBlockingIssue({
      answers: { include_frontend: true },
      hasConnectedRepository: false,
      questions: [{ id: "include_frontend" }]
    }),
    null
  );
});

test("Repository draft validates follow-up answers independently from CI/CD", () => {
  assert.deepEqual(
    getRepositoryDraftBlockingIssue({
      answers: {},
      hasConnectedRepository: false,
      questions: [{ id: "include_frontend" }]
    }),
    {
      field: "questions",
      message: "모든 추가 질문에 답한 뒤 보드를 생성해주세요."
    }
  );

  assert.equal(
    getRepositoryDraftBlockingIssue({
      answers: { include_frontend: false },
      hasConnectedRepository: false,
      questions: [{ id: "include_frontend" }]
    }),
    null
  );
});
