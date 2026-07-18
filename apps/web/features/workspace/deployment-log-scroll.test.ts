import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const deploymentScreenSource = readFileSync(
  new URL("./DirectDeploymentScreen.tsx", import.meta.url),
  "utf8"
);
const workspaceStyles = readFileSync(new URL("./workspace.module.css", import.meta.url), "utf8");

test("long deployment logs scroll inside the log panel instead of extending the modal", () => {
  assert.match(
    deploymentScreenSource,
    /<ol aria-label="Deployment logs" className=\{styles\.deploymentLogList\} tabIndex=\{0\}>/
  );
  assert.match(
    workspaceStyles,
    /\.deploymentLogList\s*\{[^}]*max-height:\s*min\([^;]+;[^}]*overflow-y:\s*auto;/s
  );
  assert.match(workspaceStyles, /\.deploymentLogList\s*\{[^}]*overscroll-behavior:\s*contain;/s);
});
