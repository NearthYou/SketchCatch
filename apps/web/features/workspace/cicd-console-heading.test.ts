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
const accordionSource = readFileSync(
  new URL("./CicdAccordionSection.tsx", import.meta.url),
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
  assert.match(source, /<h2>CI\/CD 준비<\/h2>/);
  assert.match(source, /<h3 id="cicd-config-title">준비 체크리스트<\/h3>/);
  assert.match(accordionSource, /<h4 className=\{styles\.accordionHeading\}>/);
  assert.doesNotMatch(source, /Project Delivery|INFRASTRUCTURE DEPLOYMENT|>배포 Pull Request</);
  assert.doesNotMatch(source, /<h3 id="cicd-status-title">배포 상태<\/h3>/);
});

test("the task checklist exposes exactly four phase titles", () => {
  for (const label of ["저장소 및 변경 감지", "AWS 배포 대상", "PR 준비", "Pipeline"]) {
    const title = new RegExp(`title="${label}"`, "gu");
    assert.equal(source.match(title)?.length, 1, label);
  }
  for (const phaseNumber of ["01", "02", "03", "04"]) {
    assert.equal(
      source.match(new RegExp(`phaseNumber="${phaseNumber}"`, "gu"))?.length,
      1,
      phaseNumber
    );
  }
});

test("setup editors open in one labelled drawer and preserve their h4 hierarchy", () => {
  assert.match(deliveryCenterSource, /<CicdSettingsDrawer/);
  assert.match(deliveryCenterSource, /onOpenSetup=\{setActiveDrawer\}/);
  assert.match(deliveryCenterSource, /title: "GitHub 저장소 연결"/);
  assert.match(deliveryCenterSource, /title: "변경 감지 설정"/);
  assert.match(deliveryCenterSource, /<h4>자동 확인 결과<\/h4>/);
  assert.match(deliveryCenterSource, /<CicdAutomaticSetupSummary profile=\{profile\} \/>/);
  assert.match(deliveryCenterSource, /headingLevel=\{4\}/g);
  assert.match(deliveryCenterSource, /showHeading=\{false\}/g);
  assert.match(monitoringSource, /headingLevel\?: 2 \| 4/);
  assert.match(targetEditorSource, /headingLevel\?: 2 \| 4/);
  assert.match(monitoringSource, /const Heading = headingLevel === 4 \? "h4" : "h2"/);
  assert.match(targetEditorSource, /const Heading = headingLevel === 4 \? "h4" : "h2"/);
});
