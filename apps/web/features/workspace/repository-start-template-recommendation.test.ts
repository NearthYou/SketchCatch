import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Repository start screen exposes deployment, CI/CD, and template recommendation controls", async () => {
  const source = await readFile(
    new URL("../../app/workspace/repository/repository-start-client.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /recommendRepositoryTemplate/);
  assert.match(source, /EC2\/VM based/);
  assert.match(source, /Container based/);
  assert.match(source, /Serverless based/);
  assert.match(source, /Use CI\/CD handoff/);
  assert.match(source, /Recommend templates/);
  assert.match(source, /questions\?\.slice\(0, 5\)/);
});
