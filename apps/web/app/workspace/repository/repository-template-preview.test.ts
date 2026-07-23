import assert from "node:assert/strict";
import test from "node:test";

import { getRepositoryTemplatePreviewIndex } from "./repository-template-preview";

test("Template preview navigation moves one candidate at a time and stops at each edge", () => {
  assert.equal(getRepositoryTemplatePreviewIndex(0, 3, "next"), 1);
  assert.equal(getRepositoryTemplatePreviewIndex(1, 3, "next"), 2);
  assert.equal(getRepositoryTemplatePreviewIndex(2, 3, "next"), 2);
  assert.equal(getRepositoryTemplatePreviewIndex(2, 3, "previous"), 1);
  assert.equal(getRepositoryTemplatePreviewIndex(0, 3, "previous"), 0);
});

test("Template preview navigation stays on the only candidate", () => {
  assert.equal(getRepositoryTemplatePreviewIndex(0, 1, "next"), 0);
  assert.equal(getRepositoryTemplatePreviewIndex(0, 1, "previous"), 0);
  assert.equal(getRepositoryTemplatePreviewIndex(4, 0, "next"), 0);
});
