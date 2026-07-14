import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const landingStyles = readWebFile("features/landing/product-entry.module.css");
const authStyles = readWebFile("components/auth/auth.css");
const dashboardStyles = [
  readWebFile("components/dashboard/dashboard-shell.css"),
  readWebFile("components/dashboard/dashboard-content.css"),
  readWebFile("app/dashboard/dashboard-tools.module.css")
].join("\n");
const workspaceEntryStyles = [
  readWebFile("app/workspace/new/workspace-start.module.css"),
  readWebFile("app/workspace/repository/repository-start.module.css"),
  readWebFile("app/workspace/ai/workspace-ai-start.module.css")
].join("\n");
const workspaceCoreStyles = [
  readWebFile("features/workspace/workspace.module.css"),
  readWebFile("features/workspace/resource-workspace.module.css"),
  readWebFile("features/workspace/WorkspaceIssuesPanel.module.css")
].join("\n");
const architectureBoardStyles = readWebFile(
  "features/diagram-editor/diagram-editor.module.css"
);
const terraformAndImportStyles = [
  readWebFile("features/workspace/reverse-engineering.module.css"),
  readWebFile("features/workspace/TerraformCodeStatus.module.css"),
  readWebFile("features/workspace/TerraformCodeToolbar.module.css"),
  readWebFile("features/workspace/TerraformIssuesPanel.module.css")
].join("\n");

test("landing user-facing text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(landingStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(landingStyles, /#(?:777b84|999999)/i);
});

test("workspace entry text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(workspaceEntryStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(workspaceEntryStyles, /#(?:777b84|999999)/i);
});

test("workspace core panel text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(workspaceCoreStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(workspaceCoreStyles, /#(?:777b84|999999)/i);
});

test("architecture board text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(architectureBoardStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(architectureBoardStyles, /#(?:777b84|999999)/i);
});

test("terraform and cloud import text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(terraformAndImportStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(terraformAndImportStyles, /#(?:777b84|999999)/i);
});

test("dashboard text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(dashboardStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(dashboardStyles, /#(?:777b84|999999)/i);
});

test("authentication text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(authStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(authStyles, /#(?:777b84|999999)/i);
});

function readWebFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}
