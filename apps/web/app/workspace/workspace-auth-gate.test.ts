import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspacePageSource = readFileSync(join(currentDir, "page.tsx"), "utf8");
const workspaceAuthGateSource = readFileSync(join(currentDir, "workspace-auth-gate.tsx"), "utf8");
const workspaceNewPageSource = readFileSync(join(currentDir, "new", "page.tsx"), "utf8");
const workspaceAiPageSource = readFileSync(join(currentDir, "ai", "page.tsx"), "utf8");

test("workspace page delays project workspace mounting until auth bootstrap completes", () => {
  assert.match(
    workspacePageSource,
    /import \{ WorkspaceAuthGate \} from "\.\/workspace-auth-gate"/
  );
  assert.match(
    workspacePageSource,
    /<WorkspaceAuthGate>\s*<ProjectWorkspaceDraftManager[\s\S]*?<\/WorkspaceAuthGate>/
  );
  assert.match(
    workspacePageSource,
    /<WorkspaceAuthGate>\s*<WorkspaceDraftManager[\s\S]*?<\/WorkspaceAuthGate>/
  );
});

test("WorkspaceAuthGate renders children only after the user is authenticated", () => {
  assert.match(workspaceAuthGateSource, /const \{ status \} = useAuth\(\)/);
  assert.match(workspaceAuthGateSource, /status === "loading"/);
  assert.match(workspaceAuthGateSource, /status === "unauthenticated"/);
  assert.match(workspaceAuthGateSource, /router\.replace\("\/login"\)/);
  assert.match(workspaceAuthGateSource, /return <>\{children\}<\/>/);
});

test("new project and AI draft routes require authentication before rendering", () => {
  for (const routeSource of [workspaceNewPageSource, workspaceAiPageSource]) {
    assert.match(routeSource, /import \{ WorkspaceAuthGate \}/);
    assert.match(routeSource, /<WorkspaceAuthGate>/);
    assert.match(routeSource, /<\/WorkspaceAuthGate>/);
  }
});
