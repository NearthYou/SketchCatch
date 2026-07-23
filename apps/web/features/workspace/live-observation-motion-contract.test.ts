import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const modalSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationModal.tsx", import.meta.url)),
  "utf8"
);
const flowSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationFocusedFlow.tsx", import.meta.url)),
  "utf8"
);
const helperSource = readFileSync(
  fileURLToPath(new URL("./live-observation.ts", import.meta.url)),
  "utf8"
);
const stylesSource = readFileSync(
  fileURLToPath(new URL("./workspace.module.css", import.meta.url)),
  "utf8"
);

test("renders the live infrastructure motion in the observation modal", () => {
  assert.match(modalSource, /import \{ LiveObservationFocusedFlow \}/);
  assert.match(modalSource, /<LiveObservationFocusedFlow/);
  assert.match(flowSource, /aria-label="실시간 인프라 흐름"/);
  assert.doesNotMatch(flowSource, /실시간 트래픽 · 핵심 데이터 흐름/);
});

test("bounds request particles and keeps their identities stable", () => {
  assert.match(helperSource, /MAX_ANIMATED_REQUEST_PARTICLES = 4/);
  assert.match(flowSource, /appendLiveObservationParticleIds/);
  assert.match(flowSource, /getLiveObservationAnimatedParticleCount/);
});
test("keeps the flow motion active between request burst snapshots", () => {
  assert.match(flowSource, /hasLiveObservationActiveTraffic/);
  assert.match(flowSource, /data-flowing=\{hasActiveTraffic\}/);
  assert.match(
    stylesSource,
    /\.liveObservationFocusedFlow\[data-flowing="true"\] \.liveObservationPresentationNode/
  );
});
