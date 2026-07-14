import assert from "node:assert/strict";
import { test } from "node:test";
import { getRepositoryDraftBlockingIssue } from "./repository-draft-readiness";

test("Repository draft requires a CI/CD connection before any later validation", () => {
  assert.deepEqual(
    getRepositoryDraftBlockingIssue({
      answers: {},
      hasConnectedRepository: false,
      questions: [{ id: "include_frontend" }]
    }),
    {
      field: "ci_cd_connection",
      message: "CI/CD 연결을 완료해야 다음 단계로 이동할 수 있습니다."
    }
  );
});

test("Repository draft validates follow-up answers after CI/CD is connected", () => {
  assert.deepEqual(
    getRepositoryDraftBlockingIssue({
      answers: {},
      hasConnectedRepository: true,
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
      hasConnectedRepository: true,
      questions: [{ id: "include_frontend" }]
    }),
    null
  );
});
