import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientSourceUrl = new URL("../../app/workspace/new/workspace-start-client.tsx", import.meta.url);
const dashboardSourceUrl = new URL("../../components/dashboard/built-in-template-library.tsx", import.meta.url);
const cssSourceUrl = new URL("../../app/workspace/new/workspace-start.module.css", import.meta.url);

test("Dashboard Template entry opens the selected detail with naming beside its start action", async () => {
  const [clientSource, dashboardSource, cssSource] = await Promise.all([
    readFile(clientSourceUrl, "utf8"),
    readFile(dashboardSourceUrl, "utf8"),
    readFile(cssSourceUrl, "utf8")
  ]);

  assert.match(
    dashboardSource,
    /\/workspace\/new\?mode=template&templateId=\$\{encodeURIComponent\(template\.id\)\}/
  );
  assert.match(
    clientSource,
    /resolveWorkspaceStartTemplateView\(initialStartKind, initialTemplate\)/
  );

  const templateDetail = clientSource.slice(clientSource.indexOf("function TemplateDetail"));
  assert.ok(templateDetail.indexOf("styles.detailHeading") < templateDetail.indexOf("<ProjectNameField"));
  assert.ok(templateDetail.indexOf("<ProjectNameField") < templateDetail.indexOf("styles.detailStartAction"));
  assert.ok(templateDetail.indexOf("styles.detailStartAction") < templateDetail.indexOf("styles.detailStats"));
  assert.ok(templateDetail.indexOf("styles.detailContent") < templateDetail.indexOf("styles.detailPreviewFrame"));

  assert.match(cssSource, /grid-template-areas: "preview content";/);
  assert.match(cssSource, /grid-template-areas: "content" "preview";/);
});
