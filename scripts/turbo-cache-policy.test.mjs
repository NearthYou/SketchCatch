import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Turbo build cache excludes Next.js development artifacts", async () => {
  const turboConfig = JSON.parse(
    await readFile(new URL("../turbo.json", import.meta.url), "utf8")
  );
  const buildOutputs = turboConfig.tasks?.build?.outputs ?? [];

  assert.ok(
    buildOutputs.includes("!.next/dev/**"),
    "build outputs must exclude .next/dev so local development caches are not archived"
  );
});
