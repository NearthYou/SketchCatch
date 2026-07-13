import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createCostRequestCoordinator } from "./cost-request-coordinator";

const clientSource = readFileSync(
  fileURLToPath(new URL("../../app/dashboard/costs/cost-dashboard-client.tsx", import.meta.url)),
  "utf8"
);
const estimatePanelSource = readFileSync(
  fileURLToPath(new URL("../../app/dashboard/costs/cost-estimate-panel.tsx", import.meta.url)),
  "utf8"
);
const usagePanelSource = readFileSync(
  fileURLToPath(new URL("../../app/dashboard/costs/cost-usage-panel.tsx", import.meta.url)),
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

test("cost dashboard separates pre-deployment estimates from deployed usage with tabs", () => {
  assert.match(clientSource, /role="tablist"/);
  assert.match(clientSource, /styles\.costFolder/);
  assert.match(clientSource, /styles\.costFolderPanel/);
  assert.match(clientSource, /예상 비용/);
  assert.match(clientSource, /실제 사용량/);
  assert.match(clientSource, /CostEstimatePanel/);
  assert.match(clientSource, /CostUsagePanel/);
  assert.match(clientSource, /event\.key === "ArrowRight"/);
  assert.match(clientSource, /event\.key === "ArrowLeft"/);
  assert.match(clientSource, /tabIndex=\{activeTab === "estimate" \? 0 : -1\}/);
  assert.match(clientSource, /tabIndex=\{activeTab === "usage" \? 0 : -1\}/);
});

test("both cost panels keep only the newest response", () => {
  for (const source of [estimatePanelSource, usagePanelSource]) {
    assert.match(source, /createCostRequestCoordinator/);
    assert.match(source, /requestCoordinatorRef\.current\.begin\(\)/);
    assert.match(source, /if \(!request\.isCurrent\(\)\) return;/);
    assert.match(source, /request\.signal\.aborted \|\| !request\.isCurrent\(\)/);
    assert.match(source, /requestCoordinatorRef\.current\.dispose\(\)/);
  }
});
