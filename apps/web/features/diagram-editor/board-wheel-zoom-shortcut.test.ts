import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBoardWheelZoomShortcut } from "./board-wheel-zoom-shortcut";

test("Ctrl plus an upward or downward wheel gesture resolves to the matching zoom direction", () => {
  const activeModifierKeys = new Set<"Control" | "Meta">(["Control"]);

  assert.equal(
    resolveBoardWheelZoomShortcut({
      activeModifierKeys,
      ctrlKey: true,
      deltaY: -120,
      metaKey: false
    }),
    "zoom_in"
  );
  assert.equal(
    resolveBoardWheelZoomShortcut({
      activeModifierKeys,
      ctrlKey: true,
      deltaY: 120,
      metaKey: false
    }),
    "zoom_out"
  );
});

test("plain wheel and synthetic pinch input do not trigger the physical modifier shortcut", () => {
  assert.equal(
    resolveBoardWheelZoomShortcut({
      activeModifierKeys: new Set(),
      ctrlKey: true,
      deltaY: -8,
      metaKey: false
    }),
    null
  );
  assert.equal(
    resolveBoardWheelZoomShortcut({
      activeModifierKeys: new Set(["Control"]),
      ctrlKey: false,
      deltaY: -120,
      metaKey: false
    }),
    null
  );
});

test("Meta is supported as the macOS analogue and zero-delta input is ignored", () => {
  assert.equal(
    resolveBoardWheelZoomShortcut({
      activeModifierKeys: new Set(["Meta"]),
      ctrlKey: false,
      deltaY: -120,
      metaKey: true
    }),
    "zoom_in"
  );
  assert.equal(
    resolveBoardWheelZoomShortcut({
      activeModifierKeys: new Set(["Control"]),
      ctrlKey: true,
      deltaY: 0,
      metaKey: false
    }),
    null
  );
});
