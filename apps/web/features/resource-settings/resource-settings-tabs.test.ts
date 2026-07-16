import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

test("Templates 탭에서는 Resource 컨트롤 바를 숨긴다", () => {
  assert.match(
    source,
    /activeTab === "resources" \? \(\s*<div className="resourceControlBar">[\s\S]*?<\/div>\s*\) : null/
  );
});
