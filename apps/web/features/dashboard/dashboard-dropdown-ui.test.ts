import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const selectFieldSource = readLocalFile("../../components/ui/DashboardSelectField.tsx");
const selectFieldStyles = readLocalFile("../../components/ui/dashboard-select-field.module.css");

const dashboardDropdownSources = [
  "../../app/projects/projects-client.tsx",
  "../../components/templates/TemplateGallery.tsx",
  "../../app/dashboard/costs/cost-estimate-panel.tsx",
  "../../app/dashboard/costs/cost-usage-panel.tsx",
  "../../app/dashboard/settings/settings-dashboard-client.tsx"
].map(readLocalFile);

test("dashboard dropdowns share one light select field component", () => {
  assert.match(selectFieldSource, /tone="surface"/);
  assert.match(selectFieldSource, /size="large"/);
  assert.match(selectFieldStyles, /font-size:\s*11px/);
  assert.match(selectFieldStyles, /font-weight:\s*700/);

  for (const source of dashboardDropdownSources) {
    assert.match(source, /DashboardSelectField/);
    assert.doesNotMatch(source, /<select\b/);
  }
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
