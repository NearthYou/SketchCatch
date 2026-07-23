import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LiveObservationV2Snapshot } from "@sketchcatch/types";
import { LiveObservationTelemetrySummary } from "./LiveObservationTelemetrySummary";

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

test("describes unavailable provider telemetry as a failure that needs checking", () => {
  const html = renderSummary(snapshot({ status: "active", state: "unavailable", running: null }));

  assert.match(html, /AWS 관측 불가/);
  assert.match(html, /연결과 관측 권한을 확인해 주세요/);
  assert.doesNotMatch(html, /AWS 지표 대기/);
});

test("shows actual task capacity even when no forecast can be calculated", () => {
  const html = renderSummary(snapshot({ status: "active", state: "available", running: 3 }));

  assert.match(html, /3개 실제 · 예상 대기/);
});
function renderSummary(value: LiveObservationV2Snapshot | null): string {
  return renderToStaticMarkup(
    createElement(LiveObservationTelemetrySummary, {
      aiState: "idle",
      architecture: null,
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
