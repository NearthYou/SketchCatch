import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecorativeAwsOrbit } from "./decorative-aws-orbit";
import { createDecorativeOrbitComposition } from "./option-resource-presentation";

Object.assign(globalThis, { React });

test("Orbit은 원본 목업의 기울어진 타원 바깥 궤도를 유지한다", () => {
  const html = renderToStaticMarkup(
    createElement(DecorativeAwsOrbit, {
      composition: createDecorativeOrbitComposition([]),
      convergenceLevel: 0,
      reactionKey: "initial",
      visibleRingCount: 3
    })
  );

  assert.match(html, /data-orbit-aspect="1\.55"/);
  assert.match(html, /data-orbit-tilt="-11"/);
  assert.match(html, /data-orbit-tilt="8"/);

  for (const layer of [0, 1, 2]) {
    const layerStart = html.indexOf(`data-layer="${layer}"`);
    const nextLayerStart = html.indexOf(`data-layer="${layer + 1}"`, layerStart);
    const layerMarkup = html.slice(layerStart, nextLayerStart < 0 ? undefined : nextLayerStart);

    assert.ok(layerMarkup.indexOf("data-orbit-ring") < layerMarkup.indexOf("data-orbit-track"));
  }
});
