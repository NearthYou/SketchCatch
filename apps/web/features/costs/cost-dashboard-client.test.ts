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
const dashboardToolsCss = readFileSync(
  fileURLToPath(new URL("../../app/dashboard/dashboard-tools.module.css", import.meta.url)),
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
  assert.match(
    clientSource,
    /프로젝트의 예상 비용과 실제 사용량을 한곳에서 비교하고 관리합니다\./
  );
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

test("estimated user count accepts direct numeric input", () => {
  assert.match(estimatePanelSource, /type="number"/);
  assert.match(estimatePanelSource, /normalizeExpectedUserCount/);
  assert.match(estimatePanelSource, /onBlur=\{applyExpectedUserCount\}/);
  assert.match(estimatePanelSource, /aria-invalid=\{expectedUserCountError \? true : undefined\}/);
  assert.match(estimatePanelSource, /1명 이상 1,000,000명 이하/);
});

test("both cost panels expose refresh and disable duplicate refresh while loading", () => {
  for (const source of [estimatePanelSource, usagePanelSource]) {
    assert.match(source, /data-loading=\{loadState === "loading"\}/);
    assert.match(source, /disabled=\{loadState === "loading"\}/);
    assert.match(source, /title=\{loadState === "loading" \? "새로고침 중" : "새로고침"\}/);
  }

  assert.match(usagePanelSource, /title="배포된 프로젝트가 없습니다"/);
  assert.match(usagePanelSource, /\{loadState === "loading" \? "새로고침 중" : "새로고침"\}/);
});

test("folder tabs do not create a scroll container", () => {
  const costTabsRule = dashboardToolsCss.match(/\.costTabs\s*\{[^}]+\}/)?.[0] ?? "";

  assert.doesNotMatch(costTabsRule, /overflow/);
  assert.match(dashboardToolsCss, /\.costTab\s*\{\s*min-width:\s*0;\s*flex:\s*1 1 0;/);
});

test("actual usage chart renders readable axes with compact data points", () => {
  assert.match(usagePanelSource, /chart\.xTicks\.map/);
  assert.match(usagePanelSource, /chart\.yTicks\.map/);
  assert.match(usagePanelSource, /className=\{styles\.chartAxisLabel\}/);
  assert.match(usagePanelSource, /className=\{styles\.chartPoint\}/);
  assert.match(usagePanelSource, /r="2"/);
  assert.match(dashboardToolsCss, /\.chartGridLine\s*\{/);
  assert.match(dashboardToolsCss, /\.chartAxisLabel\s*\{/);
});

test("actual usage chart keeps service-sized labels without stretching the SVG", () => {
  const chartRule = dashboardToolsCss.match(/\.costChart\s*\{[^}]+\}/)?.[0] ?? "";
  const axisLabelRule = dashboardToolsCss.match(/\.chartAxisLabel\s*\{[^}]+\}/)?.[0] ?? "";

  assert.match(usagePanelSource, /new ResizeObserver/);
  assert.match(usagePanelSource, /createCostUsageLineChart\(dailyTrend, \{ width: chartWidth \}\)/);
  assert.match(chartRule, /height:\s*220px/);
  assert.doesNotMatch(chartRule, /min-height/);
  assert.match(axisLabelRule, /font-size:\s*13px/);
});
