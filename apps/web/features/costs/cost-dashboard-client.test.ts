import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createCostRequestCoordinator } from "./cost-request-coordinator";

const clientSource = readFileSync(
  fileURLToPath(new URL("../../app/dashboard/costs/cost-dashboard-client.tsx", import.meta.url)),
  "utf8"
);

test("cost request coordinator aborts a superseded request and keeps only the newest request current", () => {
  const coordinator = createCostRequestCoordinator();
  const first = coordinator.begin();
  const second = coordinator.begin();

  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);

  coordinator.dispose();

  assert.equal(second.signal.aborted, true);
});

test("cost dashboard uses the coordinator to keep only the newest response", () => {
  assert.match(clientSource, /createCostRequestCoordinator/);
  assert.match(clientSource, /requestCoordinatorRef\.current\.begin\(\)/);
  assert.match(clientSource, /if \(!request\.isCurrent\(\)\) return;/);
  assert.match(clientSource, /request\.signal\.aborted \|\| !request\.isCurrent\(\)/);
  assert.match(clientSource, /requestCoordinatorRef\.current\.dispose\(\)/);
});
