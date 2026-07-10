import assert from "node:assert/strict";
import { test } from "node:test";
import { persistViewportAfterMove } from "./viewport-persistence";

test("automatic compact refit does not persist a replacement viewport", () => {
  const persistedViewports: Array<{ x: number; y: number; zoom: number }> = [];
  const automaticViewport = { x: -341.4, y: -128.2, zoom: 1.35 };

  persistViewportAfterMove(7, automaticViewport, (viewport) => {
    persistedViewports.push(viewport);
  });

  assert.deepEqual(persistedViewports, []);
});

test("a user pan or zoom persists the resulting viewport", () => {
  const persistedViewports: Array<{ x: number; y: number; zoom: number }> = [];
  const userViewport = { x: 80, y: 32, zoom: 0.9 };

  persistViewportAfterMove(0, userViewport, (viewport) => {
    persistedViewports.push(viewport);
  });

  assert.deepEqual(persistedViewports, [userViewport]);
});
