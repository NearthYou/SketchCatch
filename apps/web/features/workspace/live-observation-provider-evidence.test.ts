import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationProviderSnapshot } from "@sketchcatch/types";

import {
  getLiveObservationOperationalAnalysis,
  getLiveObservationProviderEvidence
} from "./live-observation.js";

test("describes fixed ECS capacity with desired capacity as the final value", () => {
  const evidence = getLiveObservationProviderEvidence(
    providerSnapshot({ desired: 2, running: 2, healthy: 2, max: null }),
    "고정 용량"
  );

  assert.equal(evidence.capacityModeLabel, "고정 용량");
  assert.equal(evidence.capacityDetailLabel, "정상 / 실행 / 희망");
  assert.equal(evidence.capacity, "2 / 2 / 2");
});

test("describes Auto Scaling capacity with maximum capacity as the final value", () => {
  const evidence = getLiveObservationProviderEvidence(
    providerSnapshot({ desired: 2, running: 2, healthy: 2, max: 6 }),
    "Auto Scaling"
  );

  assert.equal(evidence.capacityModeLabel, "Auto Scaling");
  assert.equal(evidence.capacityDetailLabel, "정상 / 실행 / 최대");
  assert.equal(evidence.capacity, "2 / 2 / 6");
});

test("keeps the last aggregate provider values when collection is delayed", () => {
  const evidence = getLiveObservationProviderEvidence(
    {
      ...providerSnapshot({ desired: 2, running: 2, healthy: 1, max: null }),
      state: "delayed"
    },
    "고정 용량"
  );

  assert.deepEqual(
    {
      stateLabel: evidence.stateLabel,
      requests: evidence.requests,
      errorRate: evidence.errorRate,
      p95Latency: evidence.p95Latency,
      availability: evidence.availability,
      capacity: evidence.capacity
    },
    {
      stateLabel: "지연",
      requests: "45",
      errorRate: "2.5%",
      p95Latency: "180ms",
      availability: "97.5%",
      capacity: "1 / 2 / 2"
    }
  );
});

test("clears only numeric evidence when the aggregate provider snapshot is unavailable", () => {
  const evidence = getLiveObservationProviderEvidence(
    {
      ...providerSnapshot({ desired: 2, running: 2, healthy: 1, max: null }),
      state: "unavailable"
    },
    "고정 용량"
  );

  assert.equal(evidence.stateLabel, "사용 불가");
  assert.equal(evidence.requests, "—");
  assert.equal(evidence.errorRate, "—");
  assert.equal(evidence.p95Latency, "—");
  assert.equal(evidence.availability, "—");
  assert.equal(evidence.capacity, "—");
  assert.equal(evidence.capacityModeLabel, "고정 용량");
  assert.equal(evidence.capacityDetailLabel, "정상 / 실행 / 희망");
});

test("uses the Architecture mode when provider capacity evidence is empty", () => {
  const evidence = getLiveObservationProviderEvidence(
    {
      ...providerSnapshot({ desired: null, running: null, healthy: null, max: null }),
      state: "delayed"
    },
    "Auto Scaling"
  );

  assert.equal(evidence.capacityModeLabel, "Auto Scaling");
  assert.equal(evidence.capacityDetailLabel, "정상 / 실행 / 최대");
  assert.equal(evidence.capacity, "— / — / —");
});

test("classifies unhealthy tasks as an incident and proposes a concrete Terraform field", () => {
  const analysis = getLiveObservationOperationalAnalysis(
    {
      ...providerSnapshot({ desired: 3, running: 3, healthy: 2, max: 5 }),
      logs: [{ timestamp: "2026-07-16T03:00:00.000Z", message: "service scaled desired count to 3" }]
    },
    "normal"
  );

  assert.equal(analysis.state, "incident");
  assert.equal(analysis.unhealthyTaskCount, 1);
  assert.equal(analysis.scaleEventCount, 1);
  assert.match(analysis.terraformAction, /aws_ecs_service\.health_check_grace_period_seconds/);
  assert.match(analysis.costImpact, /최대 5 Task/);
});

test("keeps recommendations in an evidence-waiting state before observation", () => {
  const analysis = getLiveObservationOperationalAnalysis(null, "normal");

  assert.equal(analysis.state, "awaiting");
  assert.equal(analysis.capacity, "— / — / —");
  assert.equal(analysis.terraformAction, "관측 데이터 수집 후 생성");
});

test("does not classify a provider collection failure as an infrastructure incident", () => {
  const analysis = getLiveObservationOperationalAnalysis(
    {
      ...providerSnapshot({ desired: null, running: null, healthy: null, max: null }),
      requests: null,
      errorRate: null,
      p95LatencyMs: null,
      availability: null,
      observedAt: null,
      state: "unavailable"
    },
    "critical"
  );

  assert.equal(analysis.state, "awaiting");
  assert.doesNotMatch(analysis.terraformAction, /aws_/);
});

test("keeps an all-null delayed snapshot in the evidence-waiting state", () => {
  const analysis = getLiveObservationOperationalAnalysis(
    {
      ...providerSnapshot({ desired: null, running: null, healthy: null, max: null }),
      requests: null,
      errorRate: null,
      p95LatencyMs: null,
      availability: null,
      observedAt: null,
      state: "delayed"
    },
    "normal"
  );

  assert.equal(analysis.state, "awaiting");
  assert.doesNotMatch(analysis.terraformAction, /aws_/);
});

function providerSnapshot(
  capacity: LiveObservationProviderSnapshot["capacity"]
): LiveObservationProviderSnapshot {
  return {
    requests: 45,
    errorRate: 2.5,
    p95LatencyMs: 180,
    availability: 97.5,
    capacity,
    logs: [],
    observedAt: "2026-07-16T03:00:00.000Z",
    state: "available"
  };
}
