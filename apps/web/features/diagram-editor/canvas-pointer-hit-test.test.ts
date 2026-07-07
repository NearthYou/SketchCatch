import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAreaBlankInteractionTarget,
  getTemporaryPanReleaseMode,
  isCanvasInteractiveElementTarget
} from "./canvas-pointer-hit-test";

test("isCanvasInteractiveElementTarget protects nested resource nodes and controls", () => {
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget(".react-flow__node:not(.diagramAreaFlowNode)")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget(".react-flow__handle")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget(".react-flow__edge")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget("button")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget("input")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget("select")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget("textarea")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget("[contenteditable]")), true);
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget(".nodrag")), true);
});

test("isCanvasInteractiveElementTarget allows pane and area-node blank-space targets", () => {
  assert.equal(isCanvasInteractiveElementTarget(makeClosestTarget(null)), false);
  assert.equal(isCanvasInteractiveElementTarget(null), false);
});

test("getAreaBlankInteractionTarget returns the target only for selectable left-click blank space", () => {
  const target = makeClosestTarget(null);

  assert.equal(
    getAreaBlankInteractionTarget({
      button: 0,
      ctrlKey: false,
      interactionMode: "select",
      metaKey: false,
      shiftKey: false,
      target,
      temporaryPanPreviousMode: null
    }),
    "blank-space"
  );
});

test("getAreaBlankInteractionTarget skips modifiers, pan mode, non-left clicks, and interactive targets", () => {
  const blankTarget = makeClosestTarget(null);

  assert.equal(
    getAreaBlankInteractionTarget({
      button: 0,
      ctrlKey: false,
      interactionMode: "pan",
      metaKey: false,
      shiftKey: false,
      target: blankTarget,
      temporaryPanPreviousMode: null
    }),
    null
  );
  assert.equal(
    getAreaBlankInteractionTarget({
      button: 1,
      ctrlKey: false,
      interactionMode: "select",
      metaKey: false,
      shiftKey: false,
      target: blankTarget,
      temporaryPanPreviousMode: null
    }),
    null
  );
  assert.equal(
    getAreaBlankInteractionTarget({
      button: 0,
      ctrlKey: true,
      interactionMode: "select",
      metaKey: false,
      shiftKey: false,
      target: blankTarget,
      temporaryPanPreviousMode: null
    }),
    null
  );
  assert.equal(
    getAreaBlankInteractionTarget({
      button: 0,
      ctrlKey: false,
      interactionMode: "select",
      metaKey: false,
      shiftKey: false,
      target: blankTarget,
      temporaryPanPreviousMode: "select"
    }),
    null
  );
  assert.equal(
    getAreaBlankInteractionTarget({
      button: 0,
      ctrlKey: false,
      interactionMode: "select",
      metaKey: false,
      shiftKey: false,
      target: makeClosestTarget("button"),
      temporaryPanPreviousMode: null
    }),
    null
  );
});

test("getTemporaryPanReleaseMode restores the previous mode when the middle button is released", () => {
  assert.equal(
    getTemporaryPanReleaseMode({
      button: 1,
      buttons: 0,
      previousMode: "select"
    }),
    "select"
  );
  assert.equal(
    getTemporaryPanReleaseMode({
      button: 0,
      buttons: 0,
      previousMode: "select"
    }),
    "select"
  );
});

test("getTemporaryPanReleaseMode waits while the middle button is still held", () => {
  assert.equal(
    getTemporaryPanReleaseMode({
      button: 0,
      buttons: 4,
      previousMode: "select"
    }),
    null
  );
  assert.equal(
    getTemporaryPanReleaseMode({
      button: 1,
      buttons: 0,
      previousMode: null
    }),
    null
  );
});

function makeClosestTarget(matchedSelector: string | null) {
  return {
    closest: (selector: string) => (matchedSelector && selector.includes(matchedSelector) ? {} : null)
  };
}
