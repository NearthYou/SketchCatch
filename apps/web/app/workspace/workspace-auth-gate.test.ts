import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspacePageSource = readFileSync(join(currentDir, "page.tsx"), "utf8");
const workspaceAuthGateSource = readFileSync(join(currentDir, "workspace-auth-gate.tsx"), "utf8");

test("workspace page delays project workspace mounting until auth bootstrap completes", () => {
  assert.match(workspacePageSource, /import \{ WorkspaceAuthGate \} from "\.\/workspace-auth-gate"/);

  const gateOpenIndex = workspacePageSource.indexOf("<WorkspaceAuthGate>");
  const projectManagerIndex = workspacePageSource.indexOf("<ProjectWorkspaceDraftManager");
  const localManagerIndex = workspacePageSource.indexOf("<WorkspaceDraftManager />");

  assert.notEqual(gateOpenIndex, -1);
  assert.ok(projectManagerIndex > gateOpenIndex);
  assert.ok(localManagerIndex > gateOpenIndex);
});

test("WorkspaceAuthGate renders children only after the user is authenticated", () => {
  assert.match(workspaceAuthGateSource, /const \{ status \} = useAuth\(\)/);
  assert.match(workspaceAuthGateSource, /status === "loading"/);
  assert.match(workspaceAuthGateSource, /status === "unauthenticated"/);
  assert.match(workspaceAuthGateSource, /router\.replace\("\/login"\)/);
  assert.match(workspaceAuthGateSource, /return <>\{children\}<\/>/);
});
