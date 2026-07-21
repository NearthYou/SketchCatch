import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = [
  "DeliveryCenterPanel.tsx",
  "CicdConsoleScreen.tsx",
  "CicdStatusBoard.tsx",
  "CicdHandoffPanel.tsx",
  "CicdPipelineRunsPanel.tsx"
]
  .map((file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8"))
  .join("\n");
const deliveryCenterSource = readFileSync(
  new URL("./DeliveryCenterPanel.tsx", import.meta.url),
  "utf8"
);
const monitoringSource = readFileSync(
  new URL(
    "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client.tsx",
    import.meta.url
  ),
  "utf8"
);
const targetEditorSource = readFileSync(
  new URL("./delivery/ProjectDeploymentTargetEditor.tsx", import.meta.url),
  "utf8"
);

test("CI/CD uses one task-oriented heading hierarchy", () => {
  assert.match(source, /<h2>CI\/CD<\/h2>/);
  assert.match(source, /<h3 id="cicd-status-title">배포 상태<\/h3>/);
  assert.match(source, /<h3 id="cicd-config-title">구성 및 실행<\/h3>/);
  assert.doesNotMatch(source, /Project Delivery|INFRASTRUCTURE DEPLOYMENT|>배포 Pull Request</);
});

test("each CI/CD detail is exposed as one accordion title", () => {
  for (const label of [
    "Delivery 연결",
    "GitOps 감시 설정",
    "프로젝트 배포 타깃",
    "배포 PR",
    "Pipeline"
  ]) {
    const title = new RegExp(`title="${label}"`, "gu");
    assert.equal(source.match(title)?.length, 1, label);
  }
  assert.match(deliveryCenterSource, /<h4>감지된 배포 정보<\/h4>/);
  assert.match(deliveryCenterSource, /<CicdAutomaticSetupSummary profile=\{profile\} \/>/);
});

test("embedded setup editors continue the CI/CD heading hierarchy at h4", () => {
  assert.match(deliveryCenterSource, /headingLevel=\{4\}/g);
  assert.match(monitoringSource, /headingLevel\?: 2 \| 4/);
  assert.match(targetEditorSource, /headingLevel\?: 2 \| 4/);
  assert.match(monitoringSource, /const Heading = headingLevel === 4 \? "h4" : "h2"/);
  assert.match(targetEditorSource, /const Heading = headingLevel === 4 \? "h4" : "h2"/);
});
