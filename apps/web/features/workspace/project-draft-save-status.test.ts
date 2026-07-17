import { test } from "node:test";
import assert from "node:assert/strict";
import { getProjectSaveStatus } from "./project-draft-save-status";

test("project draft conflict requires the latest server state", () => {
  assert.equal(getProjectSaveStatus("local-saved", "server-conflict"), "최신 상태 필요");
});
