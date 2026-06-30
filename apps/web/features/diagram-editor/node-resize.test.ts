import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateNodeResize } from "./node-resize";
import type { NodeResizeBounds } from "./node-resize-bounds";

const bounds: NodeResizeBounds = {
  minWidth: 80,
  minHeight: 60,
  maxWidth: 260,
  maxHeight: 180
};

const startPosition = { x: 100, y: 80 };
const startSize = { width: 200, height: 120 };

test("calculateNodeResize keeps the position fixed when resizing from the bottom-right handle", () => {
  const result = calculateNodeResize({
    bounds,
    delta: { x: 40, y: 20 },
    handlePosition: "bottom-right",
    startPosition,
    startSize,
    zoom: 2
  });

  assert.deepEqual(result, {
    position: { x: 100, y: 80 },
    size: { width: 220, height: 130 }
  });
});

test("calculateNodeResize moves the top-left boundary while keeping the opposite corner fixed", () => {
  const result = calculateNodeResize({
    bounds,
    delta: { x: 40, y: 20 },
    handlePosition: "top-left",
    startPosition,
    startSize,
    zoom: 2
  });

  assert.deepEqual(result, {
    position: { x: 120, y: 90 },
    size: { width: 180, height: 110 }
  });
});

test("calculateNodeResize moves only the top boundary when resizing from the top-right handle", () => {
  const result = calculateNodeResize({
    bounds,
    delta: { x: 40, y: 20 },
    handlePosition: "top-right",
    startPosition,
    startSize,
    zoom: 2
  });

  assert.deepEqual(result, {
    position: { x: 100, y: 90 },
    size: { width: 220, height: 110 }
  });
});

test("calculateNodeResize moves only the left boundary when resizing from the bottom-left handle", () => {
  const result = calculateNodeResize({
    bounds,
    delta: { x: 40, y: 20 },
    handlePosition: "bottom-left",
    startPosition,
    startSize,
    zoom: 2
  });

  assert.deepEqual(result, {
    position: { x: 120, y: 80 },
    size: { width: 180, height: 130 }
  });
});

test("calculateNodeResize preserves the opposite edge when the top-left handle hits min bounds", () => {
  const result = calculateNodeResize({
    bounds,
    delta: { x: 400, y: 300 },
    handlePosition: "top-left",
    startPosition,
    startSize,
    zoom: 1
  });

  assert.deepEqual(result, {
    position: { x: 220, y: 140 },
    size: { width: 80, height: 60 }
  });
});

test("calculateNodeResize preserves the opposite edge when the top-left handle hits max bounds", () => {
  const result = calculateNodeResize({
    bounds,
    delta: { x: -300, y: -200 },
    handlePosition: "top-left",
    startPosition,
    startSize,
    zoom: 1
  });

  assert.deepEqual(result, {
    position: { x: 40, y: 20 },
    size: { width: 260, height: 180 }
  });
});

test("calculateNodeResize keeps resource resizing square from the bottom-right handle", () => {
  const result = calculateNodeResize({
    bounds: {
      minWidth: 80,
      minHeight: 80,
      maxWidth: 260,
      maxHeight: 260
    },
    delta: { x: 50, y: 20 },
    handlePosition: "bottom-right",
    resizeMode: "square",
    startPosition: { x: 100, y: 80 },
    startSize: { width: 120, height: 120 },
    zoom: 1
  });

  assert.deepEqual(result, {
    position: { x: 100, y: 80 },
    size: { width: 170, height: 170 }
  });
});

test("calculateNodeResize keeps the opposite corner fixed for square top-left resizing", () => {
  const result = calculateNodeResize({
    bounds: {
      minWidth: 80,
      minHeight: 80,
      maxWidth: 260,
      maxHeight: 260
    },
    delta: { x: 30, y: 10 },
    handlePosition: "top-left",
    resizeMode: "square",
    startPosition: { x: 100, y: 80 },
    startSize: { width: 120, height: 120 },
    zoom: 1
  });

  assert.deepEqual(result, {
    position: { x: 130, y: 110 },
    size: { width: 90, height: 90 }
  });
});

test("calculateNodeResize converts rectangular resource sizes to a square during resize", () => {
  const result = calculateNodeResize({
    bounds: {
      minWidth: 80,
      minHeight: 80,
      maxWidth: 260,
      maxHeight: 260
    },
    delta: { x: 20, y: 0 },
    handlePosition: "bottom-right",
    resizeMode: "square",
    startPosition: { x: 100, y: 80 },
    startSize: { width: 112, height: 108 },
    zoom: 1
  });

  assert.deepEqual(result, {
    position: { x: 100, y: 80 },
    size: { width: 132, height: 132 }
  });
});
