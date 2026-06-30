import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldFlushProjectDraftBeforePageExit } from "./project-draft-page-exit";

test("shouldFlushProjectDraftBeforePageExit skips unavailable or active saves", () => {
  assert.equal(
    shouldFlushProjectDraftBeforePageExit({
      draftReady: false,
      hasPendingLocalChanges: true,
      serverDirty: true,
      serverSaving: false
    }),
    false
  );
  assert.equal(
    shouldFlushProjectDraftBeforePageExit({
      draftReady: true,
      hasPendingLocalChanges: true,
      serverDirty: true,
      serverSaving: true
    }),
    false
  );
});

test("shouldFlushProjectDraftBeforePageExit flushes pending local or server dirty drafts", () => {
  assert.equal(
    shouldFlushProjectDraftBeforePageExit({
      draftReady: true,
      hasPendingLocalChanges: true,
      serverDirty: false,
      serverSaving: false
    }),
    true
  );
  assert.equal(
    shouldFlushProjectDraftBeforePageExit({
      draftReady: true,
      hasPendingLocalChanges: false,
      serverDirty: true,
      serverSaving: false
    }),
    true
  );
});

test("shouldFlushProjectDraftBeforePageExit skips clean drafts", () => {
  assert.equal(
    shouldFlushProjectDraftBeforePageExit({
      draftReady: true,
      hasPendingLocalChanges: false,
      serverDirty: false,
      serverSaving: false
    }),
    false
  );
});
