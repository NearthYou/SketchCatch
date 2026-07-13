import assert from "node:assert/strict";
import { test } from "node:test";
import { requireSavedProjectDraftRevision } from "./project-deployment-preparation";

test("deployment preparation accepts only a successful persisted project draft", () => {
  assert.equal(
    requireSavedProjectDraftRevision({ ok: true, serverDraft: { revision: 7 } }),
    7
  );
  assert.throws(
    () => requireSavedProjectDraftRevision({ ok: false, serverDraft: null }),
    /저장이 완료되지 않아/
  );
  assert.throws(
    () => requireSavedProjectDraftRevision({ ok: true, serverDraft: { revision: 0 } }),
    /저장이 완료되지 않아/
  );
});
