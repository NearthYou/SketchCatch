import assert from "node:assert/strict";
import test from "node:test";
import { isBoardTemplateAvailable, listBoardTemplates } from "../../../features/resource-settings/template-library";
import {
  createTemplateProjectDraft,
  createWorkspaceStartTemplateHref,
  createWorkspaceStartTemplateSelection,
  resolveWorkspaceStartTemplateView,
  resolveWorkspaceStartTemplate
} from "./workspace-start-template-flow";
import { hasAuthoritativeTerraformSource } from "../../../features/workspace/terraform-panel-utils";

test("Template 시작 선택은 ID와 현재 version을 함께 유지하고 오래된 선택은 복원하지 않는다", () => {
  const template = getAvailableTemplate("brainboard-aws-asg-lb-vpc-subnets");
  const selection = createWorkspaceStartTemplateSelection(template);

  assert.deepEqual(resolveWorkspaceStartTemplate(listBoardTemplates(), selection), template);
  assert.equal(
    resolveWorkspaceStartTemplate(listBoardTemplates(), {
      ...selection,
      templateVersion: "v-stale"
    }),
    null
  );
});

test("Template 프로젝트 생성 draft는 선택한 Board와 Terraform 파일을 그대로 저장한다", () => {
  const template = getAvailableTemplate("brainboard-aws-asg-lb-vpc-subnets");
  const draft = createTemplateProjectDraft({ projectId: "project-123", template });

  assert.equal(draft.projectId, "project-123");
  assert.deepEqual(draft.terraformFiles, template.terraformFiles);
  assert.notEqual(draft.terraformFiles, template.terraformFiles);
  assert.equal(hasAuthoritativeTerraformSource(draft.diagramJson), true);

  const { terraformSourceFingerprint: _fingerprint, ...presentation } =
    draft.diagramJson.presentation ?? {};
  assert.deepEqual({ ...draft.diagramJson, presentation }, template.diagramJson);
});

test("선택한 Template으로 시작하면 상세 화면을 바로 연다", () => {
  const template = getAvailableTemplate("brainboard-aws-asg-lb-vpc-subnets");

  assert.equal(resolveWorkspaceStartTemplateView("template", template), "detail");
  assert.equal(resolveWorkspaceStartTemplateView("template", null), "catalog");
  assert.equal(resolveWorkspaceStartTemplateView("ai", template), null);
});

test("Dashboard Template links carry the exact selected revision", () => {
  const template = getAvailableTemplate("brainboard-aws-asg-lb-vpc-subnets");
  const selection = createWorkspaceStartTemplateSelection(template);
  const url = new URL(createWorkspaceStartTemplateHref(template), "https://sketchcatch.local");

  assert.equal(url.pathname, "/workspace/new");
  assert.equal(url.searchParams.get("mode"), "template");
  assert.equal(url.searchParams.get("templateId"), selection.templateId);
  assert.equal(url.searchParams.get("templateVersion"), selection.templateVersion);
});

function getAvailableTemplate(templateId: string) {
  const template = listBoardTemplates().find((candidate) => candidate.id === templateId);

  assert.ok(template && isBoardTemplateAvailable(template));
  if (!template || !isBoardTemplateAvailable(template)) {
    throw new Error(`Available template not found: ${templateId}`);
  }

  return template;
}
