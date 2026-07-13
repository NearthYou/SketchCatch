import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeCostUsageTrendShape,
  createCostUsageLineChart,
  createServiceCostBars,
  sumEstimatedMonthlySavings
} from "./cost-usage-charts";

test("createCostUsageLineChart converts daily costs into stable SVG points", () => {
  const chart = createCostUsageLineChart(
    [
      { amount: 2, date: "2026-07-01" },
      { amount: 4, date: "2026-07-02" },
      { amount: 1, date: "2026-07-03" }
    ],
    {
      height: 100,
      width: 200
    }
  );

  assert.equal(chart.maxAmount, 4);
  assert.equal(chart.width, 200);
  assert.equal(chart.height, 100);
  assert.deepEqual(chart.points, [
    { amount: 2, date: "2026-07-01", x: 44, y: 42 },
    { amount: 4, date: "2026-07-02", x: 116, y: 12 },
    { amount: 1, date: "2026-07-03", x: 188, y: 57 }
  ]);
  assert.deepEqual(chart.xTicks, [
    { date: "2026-07-01", label: "7.1", x: 44 },
    { date: "2026-07-02", label: "7.2", x: 116 },
    { date: "2026-07-03", label: "7.3", x: 188 }
  ]);
  assert.deepEqual(chart.yTicks, [
    { amount: 0, label: "$0", y: 72 },
    { amount: 2, label: "$2", y: 42 },
    { amount: 4, label: "$4", y: 12 }
  ]);
  assert.equal(chart.path, "M 44 42 L 116 12 L 188 57");
});

test("createCostUsageLineChart keeps a readable dollar scale for zero cost data", () => {
  const chart = createCostUsageLineChart([
    { amount: 0, date: "2026-07-01" },
    { amount: 0, date: "2026-07-02" }
  ]);

  assert.deepEqual(
    chart.yTicks.map((tick) => tick.label),
    ["$0", "$2", "$4"]
  );
  assert.equal(chart.points.every((point) => point.y === chart.plot.bottom), true);
});

test("createCostUsageLineChart keeps one-cent axis labels unique", () => {
  const chart = createCostUsageLineChart([
    { amount: 0.01, date: "2026-07-01" }
  ]);

  assert.deepEqual(
    chart.yTicks.map((tick) => tick.label),
    ["$0", "$0.01"]
  );
  assert.equal(new Set(chart.yTicks.map((tick) => tick.amount)).size, chart.yTicks.length);
});

test("createCostUsageLineChart limits long ranges to readable date ticks", () => {
  const dailyTrend = Array.from({ length: 30 }, (_, index) => ({
    amount: index,
    date: `2026-07-${String(index + 1).padStart(2, "0")}`
  }));

  const chart = createCostUsageLineChart(dailyTrend);

  assert.equal(chart.xTicks.length, 6);
  assert.equal(chart.xTicks[0]?.label, "7.1");
  assert.equal(chart.xTicks.at(-1)?.label, "7.30");
});

test("createServiceCostBars limits rows and maps service labels", () => {
  const bars = createServiceCostBars(
    [
      { amount: 20, percentage: 50, service: "Amazon RDS" },
      { amount: 10, percentage: 25, service: "Amazon EC2" },
      { amount: 1, percentage: 2.5, service: "Amazon S3" }
    ],
    2
  );

  assert.deepEqual(bars, [
    { amount: 20, label: "Amazon RDS", percentage: 50 },
    { amount: 10, label: "Amazon EC2", percentage: 25 }
  ]);
});

test("sumEstimatedMonthlySavings returns the recommendation total", () => {
  const total = sumEstimatedMonthlySavings([
    {
      actionLabel: "Stop",
      estimatedMonthlySavings: {
        amount: 7.5,
        currency: "USD"
      },
      id: "rec-1",
      reason: "low usage",
      severity: "low",
      targetType: "resource",
      title: "EC2 savings"
    },
    {
      actionLabel: "Scale down",
      estimatedMonthlySavings: {
        amount: 18,
        currency: "USD"
      },
      id: "rec-2",
      reason: "low cpu",
      severity: "medium",
      targetType: "resource",
      title: "RDS savings"
    }
  ]);

  assert.equal(total, 25.5);
});

test("analyzeCostUsageTrendShape flags a daily cost spike", () => {
  const insight = analyzeCostUsageTrendShape([
    { amount: 5, date: "2026-07-01" },
    { amount: 30, date: "2026-07-02" },
    { amount: 6, date: "2026-07-03" }
  ]);

  assert.equal(insight.severity, "warning");
  assert.equal(insight.title, "일별 비용 급증");
});

test("analyzeCostUsageTrendShape returns a stable trend insight", () => {
  const insight = analyzeCostUsageTrendShape([
    { amount: 5, date: "2026-07-01" },
    { amount: 5.2, date: "2026-07-02" },
    { amount: 5.1, date: "2026-07-03" }
  ]);

  assert.equal(insight.severity, "normal");
  assert.equal(insight.title, "추세 안정");
});
