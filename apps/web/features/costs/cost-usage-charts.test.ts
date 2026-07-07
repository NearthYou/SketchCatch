import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
  assert.deepEqual(chart.points, [
    { amount: 2, date: "2026-07-01", x: 0, y: 50 },
    { amount: 4, date: "2026-07-02", x: 100, y: 0 },
    { amount: 1, date: "2026-07-03", x: 200, y: 75 }
  ]);
  assert.equal(chart.path, "M 0 50 L 100 0 L 200 75");
});

test("createServiceCostBars limits rows and scales each bar by the largest service", () => {
  const bars = createServiceCostBars(
    [
      { amount: 20, percentage: 50, service: "Amazon RDS" },
      { amount: 10, percentage: 25, service: "Amazon EC2" },
      { amount: 1, percentage: 2.5, service: "Amazon S3" }
    ],
    2
  );

  assert.deepEqual(bars, [
    { amount: 20, label: "Amazon RDS", percentage: 50, widthPercentage: 100 },
    { amount: 10, label: "Amazon EC2", percentage: 25, widthPercentage: 50 }
  ]);
});

test("sumEstimatedMonthlySavings returns the recommendation total", () => {
  const total = sumEstimatedMonthlySavings([
    {
      actionLabel: "중지 검토",
      estimatedMonthlySavings: {
        amount: 7.5,
        currency: "USD"
      },
      id: "rec-1",
      reason: "low usage",
      severity: "low",
      targetType: "resource",
      title: "EC2 절감"
    },
    {
      actionLabel: "스케일 다운",
      estimatedMonthlySavings: {
        amount: 18,
        currency: "USD"
      },
      id: "rec-2",
      reason: "low cpu",
      severity: "medium",
      targetType: "resource",
      title: "RDS 절감"
    }
  ]);

  assert.equal(total, 25.5);
});
