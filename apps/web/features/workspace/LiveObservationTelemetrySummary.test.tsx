import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import { LiveObservationTelemetrySummary } from "./LiveObservationTelemetrySummary";

const architecture: ArchitectureJson = {
  edges: [
    { id: "service-target", sourceId: "service", targetId: "target" },
    { id: "target-policy", sourceId: "target", targetId: "policy" }
  ],
  nodes: [
    {
      id: "service",
      type: "ECS_SERVICE",
      positionX: 0,
      positionY: 0,
      config: { terraformResourceName: "service" }
    },
    {
      id: "target",
      type: "APPLICATION_AUTO_SCALING_TARGET",
      positionX: 0,
      positionY: 0,
      config: { maxCapacity: 3, minCapacity: 1, terraformResourceName: "target" }
    },
    {
      id: "policy",
      type: "APPLICATION_AUTO_SCALING_POLICY",
      positionX: 0,
      positionY: 0,
      config: {
        policyType: "TargetTrackingScaling",
        terraformResourceName: "policy",
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 60,
          predefinedMetricSpecification: [
            { predefinedMetricType: "ALBRequestCountPerTarget" }
          ]
        }
      }
    }
  ]
};

test("marks a stopped observation as ended instead of presenting its final payload as live", () => {
  const html = renderSummary(snapshot({ status: "stopped", state: "available", running: 2 }));

  assert.match(html, /관측 종료/);
  assert.match(html, /마지막으로 확인한 값/);
  assert.doesNotMatch(html, /AWS 지표 수신/);
});

test("marks an expired observation as historical", () => {
  const html = renderSummary(snapshot({ status: "expired", state: "available", running: 2 }));

  assert.match(html, /관측 만료/);
  assert.match(html, /마지막으로 확인한 값/);
  assert.doesNotMatch(html, /AWS 지표 수신/);
});

test("keeps unavailable provider telemetry out of the primary infrastructure summary", () => {
  const html = renderSummary(snapshot({ status: "active", state: "unavailable", running: null }));

  assert.doesNotMatch(html, /AWS 관측 불가/);
  assert.doesNotMatch(html, /연결과 관측 권한을 확인해 주세요/);
  assert.match(html, /실행 확인 중/);
  assert.doesNotMatch(html, /CloudWatch/);
});

test("shows only infrastructure design signals in the primary summary", () => {
  const html = renderSummary(snapshot({ status: "active", state: "available", running: 2 }));

  assert.match(html, /예상 부하/);
  assert.match(html, /Task 변화/);
  assert.match(html, /설계 분석/);
  assert.doesNotMatch(html, /수집 요청/);
  assert.doesNotMatch(html, /최근 속도/);
  assert.doesNotMatch(html, /1분 환산/);
  assert.doesNotMatch(html, /AWS 지표 수신/);
});

test("shows provider traffic and the design forecast without waiting for Store pressure", () => {
  const value = snapshot({ status: "active", state: "available", running: 1 });
  value.live = {
    ...value.live,
    projectedRequestsPerMinute: 0,
    pressureLevel: "normal",
    pressurePercent: 0,
    rollingRequestsPerSecond: 0
  };
  if (value.latestObservation) {
    value.latestObservation.payload.requests = 540;
  }

  const html = renderSummary(value, architecture);

  assert.match(html, /540 req\/min · 위험/);
  assert.match(html, /실행 1개 · 예상 3개/);
});
test("uses provider desired capacity as the expected task count when design projection is unavailable", () => {
  const html = renderSummary(snapshot({ status: "active", state: "available", running: 3 }));

  assert.match(html, /실행 3개 · 예상 3개/);
});
function renderSummary(
  value: LiveObservationV2Snapshot | null,
  selectedArchitecture: ArchitectureJson | null = null
): string {
  return renderToStaticMarkup(
    createElement(LiveObservationTelemetrySummary, {
      aiState: "idle",
      architecture: selectedArchitecture,
      snapshot: value
    })
  );
}

function snapshot({
  running,
  state,
  status
}: {
  readonly running: number | null;
  readonly state: "available" | "delayed" | "unavailable";
  readonly status: "active" | "stopped" | "expired";
}): LiveObservationV2Snapshot {
  const observedAt = "2026-07-23T00:00:00.000Z";
  return {
    observationId: "observation-1",
    status,
    live: {
      acceptedEventCount: 37,
      observedAt,
      pressureLevel: "high",
      pressurePercent: 78,
      projectedRequestsPerMinute: 468,
      rollingRequestsPerSecond: 7.8
    },
    latestObservation: {
      observedAt,
      payload: {
        availability: null,
        capacity: { desired: running, healthy: running, max: 4, running },
        errorRate: null,
        logs: [],
        observedAt,
        p95LatencyMs: null,
        requests: null,
        state
      }
    },
    terminalAt: status === "active" ? null : "2026-07-23T00:01:00.000Z"
  };
}
