import assert from "node:assert/strict";
import test from "node:test";

import { simulateDesign } from "./aiDesignSimulation.js";

test("recommends a bounded max-capacity increase from live traffic pressure", async () => {
  const result = await simulateDesign({
    architectureJson: {
      nodes: [
        {
          id: "service",
          type: "ECS_SERVICE",
          positionX: 0,
          positionY: 0,
          config: {}
        },
        {
          id: "scaling-target",
          type: "APPLICATION_AUTO_SCALING_TARGET",
          positionX: 0,
          positionY: 0,
          config: { minCapacity: 1, maxCapacity: 2 }
        },
        {
          id: "scaling-policy",
          type: "APPLICATION_AUTO_SCALING_POLICY",
          positionX: 0,
          positionY: 0,
          config: {
            policyType: "TargetTrackingScaling",
            targetTrackingScalingPolicyConfiguration: {
              targetValue: 10,
              predefinedMetricSpecification: [{ predefinedMetricType: "ALBRequestCountPerTarget" }]
            }
          }
        }
      ],
      edges: [
        { id: "service-target", sourceId: "service", targetId: "scaling-target" },
        { id: "target-policy", sourceId: "scaling-target", targetId: "scaling-policy" }
      ]
    },
    budgetLevel: "normal",
    expectedUserCount: 1000,
    liveObservation: {
      acceptedEventCount: 7,
      pressureLevel: "high",
      pressurePercent: 70,
      projectedRequestsPerMinute: 42
    },
    period: "month",
    region: "ap-northeast-2",
    trafficLevel: "normal"
  });

  assert.equal(result.bottlenecks.at(0)?.title, "ECS Auto Scaling 상한 도달 위험");
  assert.match(result.bottlenecks.at(0)?.description ?? "", /분당 42건.*최대 2개 Task/);
  assert.ok(
    result.recommendations.includes(
      "aws_appautoscaling_target.max_capacity를 2에서 3으로 늘리고 새 Terraform Plan으로 재배포하세요."
    )
  );
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Live Observation")));
});
