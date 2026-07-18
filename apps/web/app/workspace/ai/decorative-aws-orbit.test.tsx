import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecorativeAwsOrbit } from "./decorative-aws-orbit";
import { createDecorativeOrbitComposition } from "./option-resource-presentation";

Object.assign(globalThis, { React });

test("Orbit의 세 궤도는 모두 서로 다른 타원으로 표시된다", () => {
  const html = renderToStaticMarkup(
    createElement(DecorativeAwsOrbit, {
      composition: createDecorativeOrbitComposition([]),
      convergenceLevel: 0,
      reactionKey: "initial",
      visibleRingCount: 3
    })
  );

  const aspects = [...html.matchAll(/data-orbit-aspect="([\d.]+)"/g)].map((match) =>
    Number(match[1])
  );

  assert.deepEqual(aspects, [1.25, 1.4, 1.55]);
  assert.ok(aspects.every((aspect) => aspect > 1));
  assert.match(html, /data-orbit-tilt="-11"/);
  assert.match(html, /data-orbit-tilt="8"/);

  for (const layer of [0, 1, 2]) {
    const layerStart = html.indexOf(`data-layer="${layer}"`);
    const nextLayerStart = html.indexOf(`data-layer="${layer + 1}"`, layerStart);
    const layerMarkup = html.slice(layerStart, nextLayerStart < 0 ? undefined : nextLayerStart);

    assert.ok(layerMarkup.indexOf("data-orbit-ring") < layerMarkup.indexOf("data-orbit-track"));
  }
});
