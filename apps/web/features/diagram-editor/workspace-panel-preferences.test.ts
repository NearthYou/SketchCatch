import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_WORKSPACE_PANEL_PREFERENCES,
  readWorkspacePanelPreferences,
  writeWorkspacePanelPreferences
} from "./workspace-panel-preferences";

function createStorage(entries: readonly (readonly [string, string])[] = []) {
  const values = new Map(entries);

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}

test("panel preferences fall back from corrupted versioned data to legacy widths", () => {
  const storage = createStorage([
    ["sketchcatch.diagramEditor.panelPreferences", "{broken"],
    ["sketchcatch.diagramEditor.leftPanelWidth.brainboardV1", "410"],
    ["sketchcatch.diagramEditor.rightPanelWidth.brainboardV1", "500"]
  ]);

  assert.deepEqual(readWorkspacePanelPreferences(storage), {
    ...DEFAULT_WORKSPACE_PANEL_PREFERENCES,
    leftPanelWidth: 410,
    rightPanelWidth: 500
  });
});

test("panel preference writes merge one field into a valid versioned record", () => {
  const storage = createStorage();

  writeWorkspacePanelPreferences(storage, { leftPanelWidth: 420 });
  writeWorkspacePanelPreferences(storage, { rightPanelWidth: 510 });

  assert.deepEqual(readWorkspacePanelPreferences(storage), {
    ...DEFAULT_WORKSPACE_PANEL_PREFERENCES,
    leftPanelWidth: 420,
    rightPanelWidth: 510
  });
});

test("unknown versions and invalid fields use safe defaults", () => {
  const storage = createStorage([
    [
      "sketchcatch.diagramEditor.panelPreferences",
      JSON.stringify({ version: 99, leftPanelWidth: "wide" })
    ]
  ]);

  assert.deepEqual(readWorkspacePanelPreferences(storage), DEFAULT_WORKSPACE_PANEL_PREFERENCES);
});

test("panel open states round-trip with the stored widths", () => {
  const storage = createStorage();

  writeWorkspacePanelPreferences(storage, {
    leftPanelOpen: false,
    leftPanelWidth: 430,
    rightPanelOpen: false,
    rightPanelWidth: 520
  });

  assert.deepEqual(readWorkspacePanelPreferences(storage), {
    version: 1,
    leftPanelOpen: false,
    leftPanelWidth: 430,
    rightPanelOpen: false,
    rightPanelWidth: 520
  });
});
