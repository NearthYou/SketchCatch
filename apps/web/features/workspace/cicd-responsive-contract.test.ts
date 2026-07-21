import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deliveryStyles = readFileSync(new URL("./delivery-center.module.css", import.meta.url), "utf8");
const handoffStyles = readFileSync(new URL("./cicd-handoff.module.css", import.meta.url), "utf8");
const workspaceStyles = readFileSync(new URL("./workspace.module.css", import.meta.url), "utf8");
const targetStyles = readFileSync(
  new URL("./delivery/project-deployment-target-editor.module.css", import.meta.url),
  "utf8"
);

test("uses a three-column section navigation on a 390px viewport", () => {
  assert.match(deliveryStyles, /@media \(max-width: 520px\)[\s\S]*\.sectionNavigation[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("keeps CI/CD controls at least 44px and constrains selects to their panel", () => {
  assert.match(workspaceStyles, /\.cicdRunSelect select[\s\S]*min-height: 44px/);
  assert.match(workspaceStyles, /\.cicdRunSelect select[\s\S]*min-width: 0[\s\S]*width: 100%/);
  assert.match(workspaceStyles, /\.cicdConsole \.deploymentPrimaryButton[\s\S]*min-height: 46px/);
  assert.match(targetStyles, /\.field input,[\s\S]*\.field select[\s\S]*height: 44px/);
  assert.match(handoffStyles, /\.completedReadiness summary[\s\S]*min-height: 44px/);
});

test("uses the accessible error color in all CI/CD styles", () => {
  const combined = [deliveryStyles, handoffStyles, workspaceStyles, targetStyles].join("\n");
  assert.doesNotMatch(combined, /#eb8e90/i);
  assert.match(deliveryStyles, /--workspace-error: var\(--color-error, #b42318\)/);
});
