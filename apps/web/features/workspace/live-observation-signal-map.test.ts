import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getLiveObservationMobilePulsePath,
  getLiveObservationPulsePath,
  getLiveObservationStaticRailPaths
} from "./live-observation-signal-geometry";
import * as signalMapModule from "./live-observation-signal-map";
import {
  getLiveObservationSignalMapLabel,
  getLiveObservationSignalMapSlots,
  getLiveObservationSignalPulseIndexes
} from "./live-observation-signal-map";

const signalMapSource = readWorkspaceFile("live-observation-signal-map.ts");
const liveObservationSource = readWorkspaceFile("live-observation.ts");
const liveObservationTestSource = readWorkspaceFile("live-observation.test.ts");

test("signal map places actual InService markers before other visible slots", () => {
  const slots = getLiveObservationSignalMapSlots([
    { key: "launching", label: "Launching", state: "launching" },
    { key: "in-service", label: "InService", state: "in-service" }
  ]);

  assert.deepEqual(
    slots.map((instance) => instance.key),
    ["in-service", "launching"]
  );
});

test("signal map announces hidden overflow requests through its accessible label", () => {
  assert.equal(getLiveObservationSignalMapLabel(), "실시간 트래픽 신호 흐름");
  assert.equal(
    getLiveObservationSignalMapLabel(7),
    "실시간 트래픽 신호 흐름, 추가 요청 7건"
  );
});

test("signal map keeps other markers after InService slots and limits the map to two", () => {
  const slots = getLiveObservationSignalMapSlots([
    { key: "launching", label: "Launching", state: "launching" },
    { key: "in-service", label: "InService", state: "in-service" },
    { key: "transitioning", label: "Terminating", state: "transitioning" }
  ]);

  assert.deepEqual(
    slots.map((instance) => instance.key),
    ["in-service", "launching"]
  );
});

test("signal-map pulse indexes exclude missing and non-InService target slots", () => {
  assert.deepEqual(
    getLiveObservationSignalPulseIndexes(
      [0, 1, 2],
      [
        { key: "launching", label: "Launching", state: "launching" },
        { key: "i-live", label: "InService", state: "in-service" }
      ]
    ),
    [1]
  );
});

test("signal-map module does not retain the obsolete route-target Y helper", () => {
  assert.doesNotMatch(signalMapSource, /getLiveObservationSignalRouteTargetYs/);
});

test("Live Observation code imports shared contracts through the package interface", () => {
  for (const source of [liveObservationSource, liveObservationTestSource]) {
    assert.match(source, /from "@sketchcatch\/types"/);
    assert.doesNotMatch(source, /packages\/types\/src/);
  }
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

test("burst route selections pair both perimeter lanes for every logical request", () => {
  const getRouteSelections = Reflect.get(
    signalMapModule,
    "getLiveObservationSignalRouteSelections"
  );
  assert.equal(typeof getRouteSelections, "function");
  if (typeof getRouteSelections !== "function") {
    return;
  }

  const desktopSelections = getRouteSelections({
    instanceSlotCount: 2,
    requestTargetIndexes: [0, 1, 0],
    variant: "desktop",
    visibleParticleCount: 3
  });
  assert.deepEqual(
    desktopSelections,
    [
      { lane: "upper", path: getLiveObservationPulsePath({ lane: "upper", slotCount: 2, targetIndex: 0 }), requestIndex: 0, targetIndex: 0 },
      { lane: "lower", path: getLiveObservationPulsePath({ lane: "lower", slotCount: 2, targetIndex: 0 }), requestIndex: 0, targetIndex: 0 },
      { lane: "upper", path: getLiveObservationPulsePath({ lane: "upper", slotCount: 2, targetIndex: 1 }), requestIndex: 1, targetIndex: 1 },
      { lane: "lower", path: getLiveObservationPulsePath({ lane: "lower", slotCount: 2, targetIndex: 1 }), requestIndex: 1, targetIndex: 1 },
      { lane: "upper", path: getLiveObservationPulsePath({ lane: "upper", slotCount: 2, targetIndex: 0 }), requestIndex: 2, targetIndex: 0 },
      { lane: "lower", path: getLiveObservationPulsePath({ lane: "lower", slotCount: 2, targetIndex: 0 }), requestIndex: 2, targetIndex: 0 }
    ]
  );

  const mobileSelections = getRouteSelections({
    instanceSlotCount: 2,
    requestTargetIndexes: [1, 0],
    variant: "mobile",
    visibleParticleCount: 2
  });
  assert.deepEqual(
    mobileSelections,
    [
      { lane: "left", path: getLiveObservationMobilePulsePath({ lane: "left", slotCount: 2, targetIndex: 1 }), requestIndex: 0, targetIndex: 1 },
      { lane: "right", path: getLiveObservationMobilePulsePath({ lane: "right", slotCount: 2, targetIndex: 1 }), requestIndex: 0, targetIndex: 1 },
      { lane: "left", path: getLiveObservationMobilePulsePath({ lane: "left", slotCount: 2, targetIndex: 0 }), requestIndex: 1, targetIndex: 0 },
      { lane: "right", path: getLiveObservationMobilePulsePath({ lane: "right", slotCount: 2, targetIndex: 0 }), requestIndex: 1, targetIndex: 0 }
    ]
  );
});

test("normal-motion arrivals target only the selected EC2 perimeter lane after each pulse", () => {
  const getArrivalFeedback = Reflect.get(
    signalMapModule,
    "getLiveObservationSignalArrivalFeedback"
  );
  assert.equal(typeof getArrivalFeedback, "function");
  if (typeof getArrivalFeedback !== "function") {
    return;
  }

  const routeSelections = [
    { lane: "upper" as const, path: "full-upper-0", requestIndex: 0, targetIndex: 0 },
    { lane: "lower" as const, path: "full-lower-0", requestIndex: 0, targetIndex: 0 },
    { lane: "upper" as const, path: "full-upper-1", requestIndex: 1, targetIndex: 1 }
  ];
  const rails = getLiveObservationStaticRailPaths(2);
  const arrivals = getArrivalFeedback({ rails, routeSelections });

  assert.deepEqual(
    arrivals.map((arrival: { delayMs: number; durationMs: number; lane: string; path: string; targetIndex: number }) => arrival),
    routeSelections.map((selection) => ({
      delayMs: 1_520 + selection.requestIndex * 110,
      durationMs: 240,
      lane: selection.lane,
      path: rails.find(
        (rail) =>
          rail.kind === "perimeter" &&
          rail.lane === selection.lane &&
          rail.nodeId === `ec2-${selection.targetIndex}`
      )?.d,
      targetIndex: selection.targetIndex
    }))
  );
  assert.ok(arrivals.every((arrival: { path: string }) => !arrival.path.startsWith("full-")));
});

test("signal motion uses the requested two-times-slower timing", () => {
  assert.equal(signalMapModule.LIVE_OBSERVATION_SIGNAL_PULSE_DURATION_MS, 1_520);
  assert.equal(signalMapModule.LIVE_OBSERVATION_SIGNAL_STAGGER_MS, 110);
});

test("reduced-motion full-route selections deduplicate repeated lane and target pairs", () => {
  const deduplicateSelections = Reflect.get(
    signalMapModule,
    "getLiveObservationReducedRouteSelections"
  );
  assert.equal(typeof deduplicateSelections, "function");
  if (typeof deduplicateSelections !== "function") {
    return;
  }

  const firstUpper = { lane: "upper", path: "upper-0", requestIndex: 0, targetIndex: 0 } as const;
  const firstLower = { lane: "lower", path: "lower-1", requestIndex: 0, targetIndex: 1 } as const;
  assert.deepEqual(
    deduplicateSelections([
      firstUpper,
      firstLower,
      { lane: "upper", path: "duplicate", requestIndex: 1, targetIndex: 0 },
      { lane: "lower" as const, path: "lower-0", requestIndex: 1, targetIndex: 0 }
    ]),
    [firstUpper, firstLower, { lane: "lower", path: "lower-0", requestIndex: 1, targetIndex: 0 }]
  );
});

test("burst lifetime includes the last staggered arrival feedback", () => {
  const getBurstLifetimeMs = Reflect.get(
    signalMapModule,
    "getLiveObservationSignalBurstLifetimeMs"
  );
  assert.equal(typeof getBurstLifetimeMs, "function");
  if (typeof getBurstLifetimeMs !== "function") {
    return;
  }

  assert.equal(getBurstLifetimeMs(0), 0);
  assert.equal(getBurstLifetimeMs(1), 1_760);
  assert.equal(getBurstLifetimeMs(5), 2_200);
});
