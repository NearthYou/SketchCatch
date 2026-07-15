import assert from "node:assert/strict";
import test from "node:test";

import { resolvePublicRepositoryRevision } from "./ai.js";

test("public Repository analysis resolves the selected branch head SHA", () => {
  assert.equal(
    resolvePublicRepositoryRevision(
      [
        { name: "main", revision: "a".repeat(40) },
        { name: "develop", revision: "b".repeat(40) }
      ],
      "develop"
    ),
    "b".repeat(40)
  );
});

test("public Repository analysis rejects a branch without a commit SHA", () => {
  assert.equal(resolvePublicRepositoryRevision([{ name: "main", revision: null }], "main"), null);
});
