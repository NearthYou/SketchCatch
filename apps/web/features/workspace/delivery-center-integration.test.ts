import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("./DeliveryCenterPanel.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./DeploymentConsoleShell.tsx", import.meta.url), "utf8");
const repositorySource = readFileSync(
  new URL("../../app/workspace/repository/repository-start-client.tsx", import.meta.url),
  "utf8"
);

test("Workspace Delivery owns the project delivery configuration sections", () => {
  assert.match(panelSource, /GitHub 연결/);
  assert.match(panelSource, /Source Repository/);
  assert.match(panelSource, /ProjectCicdMonitoringSettingsClient/);
  assert.match(panelSource, /ProjectDeploymentTargetSettingsClient/);
  assert.match(panelSource, /CI\/CD 실행과 기록/);
});

test("deployment modal shows a summary and opens Delivery instead of another CI/CD editor", () => {
  assert.match(shellSource, /DeliveryModalSummary/);
  assert.match(shellSource, /onOpenDelivery/);
  assert.doesNotMatch(shellSource, /CicdConsoleScreen/);
});

test("public Repository analysis defers CI/CD configuration until after Board creation", () => {
  assert.match(repositorySource, /CI\/CD는 보드 생성 후 Delivery에서 연결합니다/);
  assert.doesNotMatch(repositorySource, /function RepositoryCiCdConnection/);
});
