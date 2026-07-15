import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const terraformIssuesPanelSource = readWorkspaceFile("TerraformIssuesPanel.tsx");
const architectureIssuesPanelSource = readWorkspaceFile("ArchitectureIssuesPanel.tsx");

test("Terraform 이슈 제목 위에 영어 보조 문구를 렌더링하지 않는다", () => {
  assert.doesNotMatch(terraformIssuesPanelSource, /Terraform diagnostics/);
  assert.doesNotMatch(architectureIssuesPanelSource, /Architecture diagnostics/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
