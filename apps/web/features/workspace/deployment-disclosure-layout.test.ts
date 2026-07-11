import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync(new URL("./workspace.module.css", import.meta.url), "utf8");

test("a closed deployment disclosure does not reserve space for its body", () => {
  assert.match(
    styles,
    /\.deploymentDisclosure:not\(\[open\]\) \.deploymentDisclosureBody\s*\{\s*display:\s*none;/
  );
});
