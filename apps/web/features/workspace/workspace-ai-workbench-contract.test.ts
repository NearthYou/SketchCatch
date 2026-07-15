import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controllerSource = read("WorkspaceAiChatDock.tsx");
const workbenchSource = read("WorkspaceAiWorkbench.tsx");
const workbenchStyles = read("workspace-ai-workbench.module.css");

test("AI chat controller delegates its outer surface to the AI Workbench", () => {
  assert.match(
    controllerSource,
    /import \{ WorkspaceAiWorkbench \} from "\.\/WorkspaceAiWorkbench";/
  );
  assert.match(controllerSource, /<WorkspaceAiWorkbench/);
  assert.doesNotMatch(controllerSource, /styles\.aiChatDock|styles\.aiChatChrome/);
});

test("AI Workbench exposes the desktop mode rail and active work panel accessibly", () => {
  assert.match(workbenchSource, /aria-label="AI 작업"/);
  assert.match(workbenchSource, /className=\{styles\.desktopModeRail\}/);
  assert.match(workbenchSource, /ariaOrientation="vertical"/);
  assert.match(workbenchSource, /aria-orientation=\{ariaOrientation\}/);
  assert.match(workbenchSource, /role="tablist"/);
  assert.match(workbenchSource, /role="tabpanel"/);
  assert.match(workbenchSource, /aria-labelledby=\{`workspace-ai-chat-tab-/);
});

test("AI Workbench owns status, transcript, footer, and nonmodal desktop pointer behavior", () => {
  assert.match(workbenchSource, /aria-live="polite"/);
  assert.match(workbenchSource, /role="status"/);
  assert.match(workbenchSource, /data-terraform-leave-guard-ignore/);
  assert.match(workbenchSource, /ref=\{transcriptRef\}/);
  assert.match(workbenchSource, /\{children\}/);
  assert.match(workbenchSource, /\{footer\}/);
  assert.match(workbenchStyles, /\.overlay\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(workbenchStyles, /\.workWindow\s*\{[^}]*pointer-events:\s*auto;/s);
});

test("AI Workbench shell uses only its dedicated visual token vocabulary", () => {
  assert.match(workbenchStyles, /--ai-workbench-/);
  assert.doesNotMatch(workbenchStyles, /--workspace-/);
  assert.doesNotMatch(workbenchStyles, /gradient\(/);
});

test("AI Workbench becomes an interactive full-screen surface on mobile", () => {
  assert.match(
    workbenchStyles,
    /@media \(max-width:\s*768px\)[\s\S]*\.overlay\s*\{[^}]*pointer-events:\s*auto;/s
  );
  assert.match(
    workbenchStyles,
    /@media \(max-width:\s*768px\)[\s\S]*\.workWindow[^{}]*\{(?=[^}]*inset:\s*0;)(?=[^}]*height:\s*100dvh;)[^}]*\}/s
  );
  assert.match(workbenchStyles, /\.mobileTabList/);
});

function read(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}
