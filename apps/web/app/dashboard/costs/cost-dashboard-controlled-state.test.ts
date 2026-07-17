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
  assert.match(dashboardSource, /useState<CostDashboardTab>\("estimate"\)/);
  assert.match(dashboardSource, /useState<CostEstimatePeriod>\("month"\)/);
  assert.match(dashboardSource, /useState\(1000\)/);
  assert.match(dashboardSource, /useState\("1000"\)/);
  assert.match(dashboardSource, /useState\(""\)/);
  assert.match(dashboardSource, /useState\(COST_USAGE_ALL_PROJECTS_KEY\)/);
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
