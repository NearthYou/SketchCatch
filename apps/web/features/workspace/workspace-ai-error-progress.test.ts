import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "../../test-css-register.mjs";

Object.assign(globalThis, { React });

test("오류 분석 로딩은 작은 원형 게이지에 예상 퍼센트를 숫자로 표시한다", async () => {
  const { WorkspaceAiWorkbenchTerraformIssueProgress } = await import(
    "./WorkspaceAiWorkbenchResults"
  );
  const markup = renderToStaticMarkup(
    createElement(WorkspaceAiWorkbenchTerraformIssueProgress, { completed: 0, total: 1 })
  );

  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /aria-label="오류 분석 예상 진행률 8%"/);
  assert.match(markup, /aria-valuenow="8"/);
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
  assert.match(markup, />8%<\/span>/);
});
