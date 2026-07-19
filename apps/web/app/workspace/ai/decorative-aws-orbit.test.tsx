import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecorativeAwsOrbit } from "./decorative-aws-orbit";
import { createDecorativeOrbitComposition } from "./option-resource-presentation";

Object.assign(globalThis, { React });

test("Orbit은 데스크톱 원형 계약과 기존 모바일 타원 정보를 함께 가진다", () => {
  const html = renderToStaticMarkup(
    createElement(DecorativeAwsOrbit, {
      composition: createDecorativeOrbitComposition([]),
      convergenceLevel: 0,
      reactionKey: "initial",
      visibleRingCount: 3
    })
  );

  assert.equal(html.match(/data-desktop-orbit-shape="circle"/g)?.length, 3);

  const aspects = [...html.matchAll(/data-orbit-aspect="([\d.]+)"/g)].map((match) =>
    Number(match[1])
  );

  assert.deepEqual(aspects, [1.25, 1.4, 1.55]);
  assert.match(html, /data-orbit-tilt="-11"/);
  assert.match(html, /data-orbit-tilt="8"/);

  for (const layer of [0, 1, 2]) {
    const layerStart = html.indexOf(`data-layer="${layer}"`);
    const nextLayerStart = html.indexOf(`data-layer="${layer + 1}"`, layerStart);
    const layerMarkup = html.slice(layerStart, nextLayerStart < 0 ? undefined : nextLayerStart);

    assert.ok(layerMarkup.indexOf("data-orbit-ring") < layerMarkup.indexOf("data-orbit-track"));
  }
});
