import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readSource(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

const dashboardSource = readSource("./cost-dashboard-client.tsx");
const estimatePanelSource = readSource("./cost-estimate-panel.tsx");
const usagePanelSource = readSource("./cost-usage-panel.tsx");

test("Cost Dashboard owns the navigation and filter state", () => {
  assert.match(dashboardSource, /useState<CostDashboardTab>\(\(\) =>/);
  assert.match(dashboardSource, /useState<CostEstimatePeriod>\(\(\) =>/);
  assert.match(dashboardSource, /const \[expectedUserCount,[\s\S]*?useState\(\(\) =>/);
  assert.match(dashboardSource, /const \[expectedUserCountInput,[\s\S]*?useState\(\(\) =>/);
  assert.match(dashboardSource, /const \[selectedConnectionId,[\s\S]*?useState\(\(\) =>/);
  assert.match(dashboardSource, /const \[selectedProjectKey,[\s\S]*?useState\(\(\) =>/);
  assert.match(dashboardSource, /useState<CostUsageAnalysisRange>\("30d"\)/);
});

test("Cost panels receive controlled values and change callbacks", () => {
  assert.doesNotMatch(estimatePanelSource, /useState<CostEstimatePeriod>/);
  assert.match(estimatePanelSource, /readonly onPeriodChange:/);
  assert.match(estimatePanelSource, /readonly onExpectedUserCountChange:/);
  assert.doesNotMatch(usagePanelSource, /useState<CostUsageAnalysisRange>/);
  assert.match(usagePanelSource, /readonly onConnectionChange:/);
  assert.match(usagePanelSource, /readonly onProjectChange:/);
  assert.match(usagePanelSource, /readonly onRangeChange:/);
});
