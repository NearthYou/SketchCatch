import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

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

test("web user-facing text prevents undersized and low-contrast regressions", () => {
  const violations: string[] = [];

  for (const filePath of collectCssFiles()) {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      if (/font-size:\s*(?:8|9|10|11)px/.test(line)) {
        const exceptionContext = `${lines[index - 1] ?? ""} ${line}`;
        const hasDocumentedShapeException =
          exceptionContext.includes("ui-legibility-exception: shape") &&
          exceptionContext.includes("a11y:");

        if (!hasDocumentedShapeException) {
          violations.push(`${relative(webRoot, filePath)}:${index + 1} uses text below 12px`);
        }
      }

      if (
        /(?:^|\s)(?:color|--[\w-]*(?:muted|subtle)[\w-]*)\s*:\s*#(?:777b84|999999|7a7d82)\b/i.test(
          line
        )
      ) {
        violations.push(`${relative(webRoot, filePath)}:${index + 1} uses a low-contrast text color`);
      }
    });
  }

  assert.deepEqual(violations, []);
});

function readWebFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

function collectCssFiles(): string[] {
  return ["app", "components", "features"].flatMap((directory) =>
    walkCssDirectory(join(webRoot, directory))
  );
}

function walkCssDirectory(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkCssDirectory(path);
    }

    return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  });
}
