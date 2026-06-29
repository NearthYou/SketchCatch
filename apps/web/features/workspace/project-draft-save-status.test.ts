import { test } from "node:test";
import assert from "node:assert/strict";
import { getProjectSaveStatus } from "./project-draft-save-status";

test("getProjectSaveStatus shows save needed while server has unsaved changes", () => {
  assert.equal(getProjectSaveStatus("local-pending", "server-dirty"), "저장 필요");
  assert.equal(getProjectSaveStatus("local-saved", "server-dirty"), "저장 필요");
});

test("getProjectSaveStatus distinguishes active server saves from local pending saves", () => {
  assert.equal(getProjectSaveStatus("local-saved", "server-saving"), "서버 저장 중");
  assert.equal(getProjectSaveStatus("local-pending", "server-checkpoint-pending"), "서버 저장 중");
  assert.equal(getProjectSaveStatus("local-pending", "server-idle"), "로컬 저장 중");
});

test("getProjectSaveStatus keeps failures and saved states explicit", () => {
  assert.equal(getProjectSaveStatus("local-failed", "server-dirty"), "저장 실패");
  assert.equal(getProjectSaveStatus("local-saved", "server-failed"), "저장 실패");
  assert.equal(getProjectSaveStatus("local-saved", "server-saved"), "저장됨");
  assert.equal(getProjectSaveStatus("idle", "server-idle"), "편집 중");
});
