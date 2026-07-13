import assert from "node:assert/strict";
import { test } from "node:test";
import { createCostUsageDisplayCopy } from "./cost-usage-copy";

test("sample usage is clearly separated from actual AWS billing data", () => {
  const copy = createCostUsageDisplayCopy({
    dataSource: "sample",
    hasSelectedProject: false
  });

  assert.equal(copy.controlKicker, "Sample usage");
  assert.equal(copy.summaryKicker, "Sample data");
  assert.equal(copy.summaryTitle, "비용 예시");
  assert.equal(copy.metricCostLabel, "총 비용 예시");
  assert.equal(copy.projectCostTitle, "프로젝트별 비용 예시");
  assert.match(copy.sampleNotice ?? "", /실제 청구액이 아닙니다/);
});

test("Cost Explorer usage keeps the actual billing labels", () => {
  const copy = createCostUsageDisplayCopy({
    dataSource: "aws_cost_explorer",
    hasSelectedProject: true,
    projectSource: "cost_explorer_tag"
  });

  assert.equal(copy.controlKicker, "Actual usage");
  assert.equal(copy.summaryKicker, "Actual cost");
  assert.equal(copy.summaryTitle, "프로젝트 사용 비용");
  assert.equal(copy.metricCostLabel, "프로젝트 실제 비용");
  assert.equal(copy.projectCostTitle, "프로젝트별 실제 비용");
  assert.equal(copy.sampleNotice, null);
});

test("resource-weighted project allocation is not labelled as an actual project bill", () => {
  const copy = createCostUsageDisplayCopy({
    dataSource: "aws_cost_explorer",
    hasSelectedProject: true,
    projectSource: "deployed_resource_estimate"
  });

  assert.equal(copy.metricCostLabel, "프로젝트 비용 배분액");
  assert.equal(
    copy.sampleNotice,
    "프로젝트별 AWS 비용 데이터가 아직 없어, 배포 리소스를 기준으로 비용을 계산했습니다. AWS 비용 반영에는 시간이 걸릴 수 있습니다."
  );
});

test("loading state does not claim that unknown data is actual billing data", () => {
  const copy = createCostUsageDisplayCopy({
    dataSource: null,
    hasSelectedProject: false
  });

  assert.equal(copy.controlKicker, "Usage analysis");
  assert.equal(copy.summaryKicker, "Usage summary");
  assert.equal(copy.summaryTitle, "사용 비용");
  assert.equal(copy.loadingMessage, "사용량 분석 데이터를 불러오는 중입니다.");
});
