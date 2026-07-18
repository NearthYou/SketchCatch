import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./workspace-auth-gate.tsx", import.meta.url)),
  "utf8"
);

test("Workspace keeps authenticated content mounted during session revalidation", () => {
  assert.match(source, /shouldShowAuthenticatedShellFallback\(status, user !== null\)/);
  assert.doesNotMatch(source, /if \(status === "loading"\)/);
});
