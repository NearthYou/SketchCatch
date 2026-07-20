import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./LiveObservationFocusedFlow.tsx", import.meta.url)),
  "utf8"
);
const styles = readFileSync(
  fileURLToPath(new URL("./workspace.module.css", import.meta.url)),
  "utf8"
);

test("keeps idle connector motion separate from real request particles", () => {
  assert.match(
    styles,
    /\.liveObservationPresentationConnector::after[\s\S]*animation:\s*liveObservationConnectorFlow/
  );
  assert.match(
    source,
    /\{burst\s*\?[\s\S]*liveObservationPresentationSegmentParticle/
  );
  assert.match(source, /const visibleParticleCount = burst\?\.visibleParticleCount \?\? 0/);
});

test("keeps idle resources visibly moving and carries real particles into the task group", () => {
  assert.match(
    styles,
    /\.liveObservationFocusedFlow\[data-flowing="false"\][\s\S]*\.liveObservationPresentationNode\s*\{[^}]*animation:\s*liveObservationNodeIdle/
  );
  assert.match(styles, /@keyframes liveObservationNodeIdle/);
  assert.match(
    styles,
    /data-flowing="true"[\s\S]*liveObservationPresentationNode\s*\{[^}]*animation:\s*liveObservationNodeTraffic/
  );
  assert.match(styles, /@keyframes liveObservationNodeTraffic/);
  assert.match(source, /liveObservationCapacityConnector/);
  assert.match(
    source,
    /getLiveObservationDiagramParticleDelayMs\(model\.stages\.length, particleIndex\)/
  );
  assert.match(
    source,
    /animationDelay: `\$\{index \* LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS\}ms`/
  );
});

test("wraps ten task units into a compact five-column capacity deck", () => {
  assert.match(source, /Math\.min\(5, presentedCapacityUnits\.length\)/);
  assert.match(
    styles,
    /grid-template-columns:\s*repeat\(var\(--live-observation-capacity-columns\), var\(--live-observation-capacity-card-width\)\)/
  );
  assert.doesNotMatch(styles, /grid-auto-flow:\s*column/);
  assert.doesNotMatch(source, /관측 시작 후 실제 Task 표시/);
  assert.match(source, /presentedCapacityUnits\.length > 0 \?/);
  assert.match(source, /liveObservationCapacityOrdinal/);
});

test("adds the capacity fleet only when tasks exist and adapts the whole path to density", () => {
  assert.match(source, /const capacityDensity =/);
  assert.match(source, /data-capacity-density=\{capacityDensity\}/);
  assert.match(source, /presentedCapacityUnits\.length > 0 \? \(/);
  assert.doesNotMatch(source, /liveObservationCapacityEmptyHint/);
  assert.doesNotMatch(source, /관측된 Task가 이 영역에 나타납니다/);
  assert.match(
    styles,
    /\.liveObservationFocusedFlow\[data-capacity-density="dense"\]\s*\{[^}]*--live-observation-node-size:\s*52px/
  );
  assert.match(styles, /transition:[^;]*width[^;]*height/);
});

test("keeps developer preview controls out of the live observation header", () => {
  assert.doesNotMatch(source, /DEVELOPMENT_TRAFFIC_STEPS/);
  assert.doesNotMatch(source, /DEVELOPMENT_CAPACITY_STEPS/);
  assert.doesNotMatch(source, /previewTrafficAnimation/);
  assert.doesNotMatch(source, /previewNextCapacity/);
  assert.doesNotMatch(source, /DEV 트래픽|DEV 예상 Task/);
  assert.doesNotMatch(styles, /liveObservationDeveloperPreviewButton/);
  assert.match(source, /data-traffic-intensity=\{trafficIntensity\}/);
  assert.match(source, /liveObservationBurstMeter/);
});

test("focused flow sizes to content and animates task removal", () => {
  assert.match(
    source,
    /className=\{`\$\{styles\.liveObservationDiagramMap\} \$\{styles\.liveObservationFocusedFlow\}`\}/
  );
  assert.match(source, /data-transition=\{unit\.transition\}/);
  assert.match(styles, /\.liveObservationFocusedFlow\s*\{[\s\S]*height:\s*auto/);
  assert.match(styles, /data-transition="exiting"[\s\S]*liveObservationCapacityExit/);
});

test("shows immediate traffic capacity as a forecast without replacing actual tasks", () => {
  assert.match(source, /getLiveObservationCapacityProjection\(architecture, snapshot\)/);
  assert.match(source, /실제 \$\{actualCapacityCount \?\? "확인 중"\} · 예상 \$\{predictedCapacityCount\}/);
  assert.match(source, /data-capacity-forecast=\{getCapacityForecastKind/);
  assert.match(source, /증설 예상/);
  assert.match(source, /축소 예상/);
  assert.match(styles, /data-capacity-forecast="predicted"/);
  assert.match(styles, /data-capacity-forecast="scale-in"/);
});

test("stops traffic and capacity motion when reduced motion is requested", () => {
  const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)", 8_000));
  assert.match(reducedMotion, /data-flowing="true"[\s\S]*liveObservationPresentationNode/);
  assert.match(reducedMotion, /liveObservationBurstMeter/);
  assert.match(reducedMotion, /data-capacity-forecast="predicted"/);
  assert.match(reducedMotion, /liveObservationPresentationSegmentParticle[\s\S]*display:\s*none/);
});
