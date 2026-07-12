import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const clientSource = readFileSync(
  resolve(process.cwd(), "app/live-observation-demo/live-observation-demo-client.tsx"),
  "utf8"
);

test("local Live Observation demo page sends real traffic before recording a receipt", () => {
  assert.match(clientSource, /params\.get\("collector"\)/);
  assert.match(clientSource, /params\.get\("observation"\)/);
  assert.match(clientSource, /params\.get\("traffic"\)/);
  assert.doesNotMatch(clientSource, /\$\{collector\}\/api\/traffic/);
  assert.match(clientSource, /fetch\(config\.trafficUrl,\s*\{\s*method: "POST"\s*\}\)/);
  assert.match(clientSource, /if \(!trafficResponse\.ok\)/);
  assert.match(clientSource, /\/api\/live-observations\/public\//);
  assert.match(clientSource, /crypto\.randomUUID\(\)/);
});

test("local Live Observation demo labels receipt-only fallback as simulation", () => {
  assert.match(clientSource, /const isSimulation = !config\.trafficUrl/);
  assert.match(clientSource, /시뮬레이션/);
  assert.match(clientSource, /if \(config\.trafficUrl\)/);
});
