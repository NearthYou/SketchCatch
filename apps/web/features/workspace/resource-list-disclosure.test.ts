import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ResourceListPanel.tsx", import.meta.url), "utf8");

test("resource cards disclose all parameter details below the Terraform address", () => {
  assert.doesNotMatch(source, /MoreHorizontal|ResourceCardMenu/);
  assert.match(source, /<ChevronDown[\s\S]*aria-hidden="true"/);
  assert.match(source, /aria-expanded=\{isExpanded\}/);
  assert.match(source, /aria-controls=\{detailsId\}/);
  assert.match(source, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(
    source,
    /className=\{styles\.resourceListAddress\}[\s\S]*hidden=\{!isExpanded\}[\s\S]*summaryRows\.map/
  );
  assert.doesNotMatch(source, /RESOURCE_SUMMARY_COLLAPSED_LIMIT|visibleSummaryRows/);
});

test("only the Resource title opens its detail settings", () => {
  assert.match(source, /className=\{styles\.resourceListNameButton\}/);
  assert.match(
    source,
    /className=\{styles\.resourceListNameButton\}[\s\S]*openResourceConfig\(context, item\.nodeId, onViewChange\)/
  );
  assert.equal(source.match(/openResourceConfig\(/g)?.length, 1);
  assert.doesNotMatch(source, /onDoubleClick=\{\(\) => openResourceConfig/);
});
