import assert from "node:assert/strict";
import { test } from "node:test";
import { getSaveStatusTone, isSaveInProgress } from "./workspace-project-save-status";

test("idle editing is not mistaken for an active save", () => {
  assert.equal(isSaveInProgress("편집 중"), false);
  assert.equal(getSaveStatusTone("편집 중"), "neutral");
});

test("local and server save operations use the pending state", () => {
  assert.equal(isSaveInProgress("저장 중"), true);
  assert.equal(isSaveInProgress("로컬 저장 중"), true);
  assert.equal(isSaveInProgress("서버 저장 중"), true);
  assert.equal(getSaveStatusTone("서버 저장 중"), "pending");
});

test("dirty, saved, and failed labels keep distinct tones", () => {
  assert.equal(getSaveStatusTone("서버 저장 필요"), "pending");
  assert.equal(getSaveStatusTone("저장됨"), "saved");
  assert.equal(getSaveStatusTone("서버 저장 실패"), "error");
});
