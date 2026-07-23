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
      config: { maxCapacity: 6, minCapacity: 2 }
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

test("shows forecast capacity without inventing zero actual tasks when provider data is unavailable", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationFocusedFlow, {
      architecture,
      snapshot: unavailableSnapshot()
    })
  );

  assert.match(html, /실제 확인 중 · 3개 예상/);
  assert.doesNotMatch(html, /실제 0/);
  assert.doesNotMatch(html, /1개 예상/);
});

function resourceNode(
  id: string,
  type: ArchitectureJson["nodes"][number]["type"],
  label: string,
  positionX: number
): ArchitectureJson["nodes"][number] {
  return { config: {}, id, label, positionX, positionY: 0, type };
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