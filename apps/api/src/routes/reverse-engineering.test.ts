import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  fileURLToPath(new URL("reverse-engineering.ts", import.meta.url)),
  "utf8"
);

test("Reverse Engineering routes expose a projectless preview scan before project creation", () => {
  assert.match(routeSource, /createReverseEngineeringPreviewScan/);
  assert.match(routeSource, /"\/reverse-engineering\/scans\/preview"/);
  assert.match(routeSource, /projectId: params\.projectId/);
});
