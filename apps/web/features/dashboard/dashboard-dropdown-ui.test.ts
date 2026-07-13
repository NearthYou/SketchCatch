import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dashboardDropdownSources = [
  "../../app/projects/projects-client.tsx",
  "../../components/templates/TemplateGallery.tsx",
  "../../app/dashboard/costs/cost-estimate-panel.tsx",
  "../../app/dashboard/costs/cost-usage-panel.tsx",
  "../../app/dashboard/settings/settings-dashboard-client.tsx"
].map((path) => ({ path, source: readLocalFile(path) }));

test("dashboard dropdowns share one light select field component", () => {
  for (const { path, source } of dashboardDropdownSources) {
    const selectCount = source.match(/<SelectMenu/g)?.length ?? 0;

    assert.ok(selectCount > 0, `${path} must use SelectMenu`);
    assert.equal(source.match(/tone="surface"/g)?.length, selectCount);
    assert.equal(source.match(/size="large"/g)?.length, selectCount);
    assert.doesNotMatch(source, /<select\b/);
  }
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
