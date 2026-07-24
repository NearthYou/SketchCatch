import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import { LiveObservationFocusedFlow } from "./LiveObservationFocusedFlow";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const architecture = {
  nodes: [
    resourceNode("source", "CLOUDFRONT", "CloudFront", 0),
    resourceNode("alb", "LOAD_BALANCER", "ALB", 200),
    resourceNode("task", "ECS_TASK_DEFINITION", "Fargate Task", 400),
    resourceNode("service", "ECS_SERVICE", "ECS Service", 600),
    {
      ...resourceNode("scaling-target", "APPLICATION_AUTO_SCALING_TARGET", "Auto Scaling", 800),
      config: { maxCapacity: 6, minCapacity: 1 }
    },
    {
      ...resourceNode("scaling-policy", "APPLICATION_AUTO_SCALING_POLICY", "Scaling Policy", 1000),
      config: {
        policyType: "TargetTrackingScaling",
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ALBRequestCountPerTarget"
          },
          targetValue: 5
        }
      }
    }
  ],
  edges: [
    { id: "source-alb", sourceId: "source", targetId: "alb", label: "routes" },
    { id: "alb-service", sourceId: "alb", targetId: "service", label: "targets" },
    { id: "service-task", sourceId: "service", targetId: "task", label: "uses" },
    { id: "service-scaling", sourceId: "service", targetId: "scaling-target", label: "scales" },
    { id: "target-policy", sourceId: "scaling-target", targetId: "scaling-policy", label: "uses" }
  ]
} satisfies ArchitectureJson;

test("does not label a forecast until actual capacity is known", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationFocusedFlow, {
      architecture,
      snapshot: unavailableSnapshot()
    })
  );

  assert.match(html, /실제 확인 중/);
  assert.doesNotMatch(html, /개 예상/);
  assert.doesNotMatch(html, /실제 0/);
});

test("does not label unchanged capacity as expected", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationFocusedFlow, {
      architecture,
      snapshot: availableSnapshot({ projectedRequestsPerMinute: 5, running: 1 })
    })
  );

  assert.match(html, /실제 1개/);
  assert.doesNotMatch(html, /1개 예상/);
  assert.doesNotMatch(html, /예상 중/);
});

test("labels and animates only a real capacity change as expected", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationFocusedFlow, {
      architecture,
      snapshot: availableSnapshot({ projectedRequestsPerMinute: 6, running: 1 })
    })
  );

  assert.match(html, /실제 1개 · 2개 예상 중/);
});

test("shows an early scale-out forecast at one hundred accepted requests", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationFocusedFlow, {
      architecture,
      snapshot: availableSnapshot({
        acceptedEventCount: 100,
        projectedRequestsPerMinute: 0,
        running: 1
      })
    })
  );

  assert.match(html, /data-capacity-forecast="predicted"/);
  assert.match(html, /2/);
});

test("never labels scale-in as an expected Task", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationFocusedFlow, {
      architecture,
      snapshot: availableSnapshot({ projectedRequestsPerMinute: 5, running: 3 })
    })
  );

  assert.match(html, /실제 3개/);
  assert.doesNotMatch(html, /개 예상/);
  assert.doesNotMatch(html, /data-capacity-forecast="scale-in"/);
  assert.doesNotMatch(html, /축소 예상 중/);
});

function resourceNode(
  id: string,
  type: ArchitectureJson["nodes"][number]["type"],
  label: string,
  positionX: number
): ArchitectureJson["nodes"][number] {
  return { config: {}, id, label, positionX, positionY: 0, type };
}

function availableSnapshot({
  acceptedEventCount,
  projectedRequestsPerMinute,
  running
}: {
  readonly acceptedEventCount?: number;
  readonly projectedRequestsPerMinute: number;
  readonly running: number;
}): LiveObservationV2Snapshot {
  const base = unavailableSnapshot();
  const latestObservation = base.latestObservation;
  return {
    ...base,
    live: {
      ...base.live,
      acceptedEventCount: acceptedEventCount ?? base.live.acceptedEventCount,
      projectedRequestsPerMinute,
      rollingRequestsPerSecond: projectedRequestsPerMinute / 60
    },
    latestObservation: latestObservation
      ? {
          ...latestObservation,
          payload: {
            ...latestObservation.payload,
            capacity: { desired: running, healthy: running, max: 6, running },
            state: "available"
          }
        }
      : null
  };
}
function unavailableSnapshot(): LiveObservationV2Snapshot {
  const observedAt = "2026-07-24T00:00:00.000Z";
  return {
    observationId: "observation-1",
    status: "active",
    live: {
      acceptedEventCount: 3,
      observedAt,
      pressureLevel: "normal",
      pressurePercent: 10,
      projectedRequestsPerMinute: 12,
      rollingRequestsPerSecond: 0.2
    },
    latestObservation: {
      observedAt,
      payload: {
        availability: null,
        capacity: { desired: null, healthy: null, max: null, running: null },
        errorRate: null,
        logs: [],
        observedAt,
        p95LatencyMs: null,
        requests: null,
        state: "unavailable"
      }
    },
    terminalAt: null
  };
}
