import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MAX_ANIMATED_REQUEST_PARTICLES } from "./live-observation.js";

const stylesSource = readFileSync(
  fileURLToPath(new URL("./workspace.module.css", import.meta.url)),
  "utf8"
);
const focusedFlowSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationFocusedFlow.tsx", import.meta.url)),
  "utf8"
);

test("keeps high-traffic particles within a compositor-friendly animation budget", () => {
  const particleRule = extractCssBlock(".liveObservationPresentationSegmentParticle");
  const particleKeyframes = extractCssBlock(
    "@keyframes liveObservationPresentationSegmentParticle"
  );

  assert.ok(
    MAX_ANIMATED_REQUEST_PARTICLES <= 6,
    `high traffic renders ${MAX_ANIMATED_REQUEST_PARTICLES} particles per connector`
  );
  assert.match(particleRule, /will-change:\s*transform,\s*opacity/);
  assert.doesNotMatch(particleKeyframes, /\bleft\s*:/);
  assert.match(particleKeyframes, /transform:\s*translate3d\(/);
});

test("keeps animated traffic inside fixed scroll geometry", () => {
  const connectorRule = extractCssBlock(".liveObservationPresentationConnector");
  const forecastRule = extractCssBlock(
    '.liveObservationCapacityUnit[data-capacity-forecast="predicted"]'
  );
  const scaleInForecastRule = extractCssBlock(
    '.liveObservationCapacityUnit[data-capacity-forecast="scale-in"]'
  );

  assert.match(connectorRule, /overflow:\s*hidden/);
  assert.match(forecastRule, /animation:[^;]*infinite/);
  assert.match(forecastRule, /will-change:\s*transform,\s*opacity/);
  assert.match(scaleInForecastRule, /animation:[^;]*infinite/);
  assert.match(scaleInForecastRule, /will-change:\s*transform,\s*opacity/);
  assert.doesNotMatch(
    focusedFlowSource,
    /capacityStageWidth\s*=\s*[^;]*presentedCapacityUnits\.length/
  );
});
function extractCssBlock(selector: string): string {
  const start = stylesSource.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS block: ${selector}`);

  let depth = 0;
  for (let index = stylesSource.indexOf("{", start); index < stylesSource.length; index += 1) {
    if (stylesSource[index] === "{") depth += 1;
    if (stylesSource[index] === "}") depth -= 1;
    if (depth === 0) return stylesSource.slice(start, index + 1);
  }

  assert.fail(`unterminated CSS block: ${selector}`);
}
