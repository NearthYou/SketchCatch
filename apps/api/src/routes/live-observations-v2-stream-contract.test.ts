import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./live-observations-v2.ts", import.meta.url), "utf8");

test("streams the Store snapshot before starting provider corroboration", () => {
  const start = routeSource.indexOf("const writeSnapshot = async () =>");
  const end = routeSource.indexOf("input.request.raw.on", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const writeSnapshot = routeSource.slice(start, end);

  const readIndex = writeSnapshot.indexOf("input.service.readSession");
  const writeIndex = writeSnapshot.indexOf("input.reply.raw.write(`event: snapshot");
  const refreshIndex = writeSnapshot.indexOf("void refreshProvider()");

  assert.notEqual(readIndex, -1);
  assert.ok(writeIndex > readIndex);
  assert.ok(refreshIndex > writeIndex);
  assert.doesNotMatch(writeSnapshot, /await input\.refreshObservation/);
});

test("pushes live Store snapshots twice per second without increasing provider polling", () => {
  assert.match(routeSource, /const LIVE_SNAPSHOT_INTERVAL_MS = 500;/);
  assert.match(
    routeSource,
    /setInterval\(\(\) => void writeSnapshot\(\), LIVE_SNAPSHOT_INTERVAL_MS\)/
  );
});
