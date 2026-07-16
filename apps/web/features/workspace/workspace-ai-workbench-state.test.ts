import assert from "node:assert/strict";
import test from "node:test";
import {
  isWorkspaceAiTranscriptNearBottom,
  removeWorkspaceAiSelectionEntries
} from "./workspace-ai-workbench-state";

test("transcript bottom threshold includes 48px but not 49px", () => {
  assert.equal(
    isWorkspaceAiTranscriptNearBottom({ clientHeight: 300, scrollHeight: 900, scrollTop: 600 }),
    true
  );
  assert.equal(
    isWorkspaceAiTranscriptNearBottom({ clientHeight: 300, scrollHeight: 900, scrollTop: 552 }),
    true
  );
  assert.equal(
    isWorkspaceAiTranscriptNearBottom({ clientHeight: 300, scrollHeight: 900, scrollTop: 551 }),
    false
  );
});

test("scope clear removes only selection entries owned by that scope", () => {
  assert.deepEqual(
    removeWorkspaceAiSelectionEntries(
      {
        "draft-message": ["VPC"],
        "errors-message": ["수정"],
        "preview-message": ["리뷰"]
      },
      new Set(["errors-message"])
    ),
    {
      "draft-message": ["VPC"],
      "preview-message": ["리뷰"]
    }
  );
});
