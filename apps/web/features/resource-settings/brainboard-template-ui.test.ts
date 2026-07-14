import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const gallerySource = readSource("../../components/templates/TemplateGallery.tsx");
const resourceSettingsSource = readSource("./index.tsx");
const startSource = readSource("../../app/workspace/new/workspace-start-client.tsx");
const templatesSource = readSource("../../app/templates/templates-client.tsx");

test("unavailable Brainboard evidence is preview-only across gallery and quick-apply surfaces", () => {
  assert.match(gallerySource, /const available = isBoardTemplateAvailable\(template\)/);
  assert.match(
    gallerySource,
    /<dd>\{available \? getBoardTemplateResourceCount\(template\) : "—"\}<\/dd>/
  );
  assert.match(gallerySource, /\{template\.unavailableReason\}/);
  assert.match(gallerySource, /aria-disabled="true" disabled/);
  assert.match(gallerySource, /미리보기만 제공/);
  assert.match(resourceSettingsSource, /disabled=\{!isBoardTemplateAvailable\(template\)\}/);
  assert.match(
    resourceSettingsSource,
    /if \(template && isBoardTemplateAvailable\(template\)\) onTemplateApply\(template\)/
  );
});

test("new-project template selection rejects unavailable IDs and saves exact Terraform files", () => {
  assert.ok(
    (startSource.match(/isBoardTemplateAvailable\(template\)/gu) ?? []).length >= 2,
    "URL and stored-form template IDs must both be availability-checked"
  );
  assert.match(
    startSource,
    /return template && isBoardTemplateAvailable\(template\) \? template : null/
  );
  assert.match(
    startSource,
    /saveProjectDraft\(\{[\s\S]*markTerraformSourceAuthoritative\(selectedTemplate\.diagramJson\)[\s\S]*terraformFiles: selectedTemplate\.terraformFiles\.map/
  );
});

test("template dashboard routes through the project-creation flow and never links unavailable evidence", () => {
  assert.match(templatesSource, /isBoardTemplateAvailable\(template\) \? \(/);
  assert.match(templatesSource, /\/workspace\/new\?mode=template&templateId=/);
  assert.doesNotMatch(templatesSource, /href=\{`\/workspace\?templateId=/);
  assert.match(templatesSource, /<button className="dashboardSecondaryButton" disabled/);
});

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
