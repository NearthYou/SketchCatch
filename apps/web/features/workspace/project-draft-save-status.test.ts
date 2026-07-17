import { test } from "node:test";
import assert from "node:assert/strict";
import { getDirtyProjectServerSaveState, getProjectSaveStatus } from "./project-draft-save-status";

test("project draft conflict requires the latest server state", () => {
  assert.equal(getProjectSaveStatus("local-saved", "server-conflict"), "최신 상태 필요");
});

test("editing after a conflict keeps the server state fixed on conflict", () => {
  assert.equal(getDirtyProjectServerSaveState(true), "server-conflict");
  assert.equal(getDirtyProjectServerSaveState(false), "server-dirty");
});
