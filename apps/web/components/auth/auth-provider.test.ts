import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const authProviderSource = readFileSync(join(currentDir, "auth-provider.tsx"), "utf8");

test("AuthProvider skips refresh bootstrap when there is no refresh session cookie hint", () => {
  assert.match(authProviderSource, /hasRefreshSessionHint/);
  assert.match(
    authProviderSource,
    /storedSession\s*\?\?\s*\(hasRefreshSessionHint\(\)\s*\?\s*await requestRefreshSession\(\)\s*:\s*null\)/
  );
  assert.doesNotMatch(
    authProviderSource,
    /readStoredAuthSession\(\)\s*\?\?\s*\(await requestRefreshSession\(\)\)/
  );
});
