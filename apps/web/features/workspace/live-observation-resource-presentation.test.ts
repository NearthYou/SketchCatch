import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, DiagramNode, LiveObservationV2Snapshot } from "@sketchcatch/types";

import { createLiveObservationDiagramModel } from "./live-observation-diagram.js";
import { presentLiveObservationDiagramResourceLabels } from "./live-observation-resource-presentation.js";

type LiveObservationRole = NonNullable<DiagramNode["metadata"]>["liveObservationRole"];

test("internal Terraform labels become stable Korean role names before UI rendering", () => {
  const diagram: DiagramJson = {
    edges: [
      edge("cloudfront", "alb"),
      edge("alb", "target"),
      edge("target", "service"),
      edge("service", "task")
    ],
    nodes: [
      node("cloudfront", "aws_cloudfront_distribution", "cdn_web", 0, "traffic-source"),
      node("alb", "aws_lb", "alb_fixed_template_ecs_fargate_container_app", 200),
      node("target", "aws_lb_target_group", "tg_fixed_template_ecs_fargate_container_app", 400),
      node("service", "aws_ecs_service", "ecs_service_fixed_template_fargate_container_app", 600),
      node("task", "aws_ecs_task_definition", "task_fixed_template_fargate_container_app", 800)
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const model = createLiveObservationDiagramModel(diagram, snapshot());

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;
  assert.deepEqual(
    model.stages.map((stage) => stage.node.label),
    ["웹 배포", "요청 분배", "서버 연결", "앱 서버"]
  );
  assert.equal(model.capacityUnits[0]?.node.label, "실행 서버");
  assert.equal(
    [...model.stages.map((stage) => stage.node.label), ...model.capacityUnits.map((unit) => unit.node.label)]
      .some((label) => label.includes("fixed_template") || label.includes("_")),
    false
  );
});

test("different infrastructure roles stay distinguishable without raw names", () => {
  const diagram: DiagramJson = {
    edges: [],
    nodes: [
      node("gateway", "aws_internet_gateway", "igw_fixed_template_app", 0),
      node("route", "aws_route_table", "rt_fixed_template_app", 200),
      node("policy", "aws_s3_bucket_policy", "bucket_policy_fixed_template_app", 400),
      node("zone", "aws_availability_zone", "ap_northeast_2a", 600)
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const labels = presentLiveObservationDiagramResourceLabels(diagram).nodes.map(
    (resource) => resource.label
  );

  assert.deepEqual(labels, ["인터넷 연결", "라우팅", "파일 접근 정책", "가용 영역"]);
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(labels.some((label) => label.includes("_") || label.includes("fixed_template")), false);
});

test("default AWS names and unknown internal types use simple user-facing names", () => {
  const diagram: DiagramJson = {
    edges: [],
    nodes: [
      node("alb", "aws_lb", "Load Balancer", 0),
      node("target", "aws_lb_target_group", "Target Group", 200),
      node("service", "aws_ecs_service", "ECS Service", 400),
      node("database", "aws_db_instance", "RDS Instance", 600),
      node("nat", "aws_nat_gateway", "nat_gateway_fixed_template_app", 800)
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.deepEqual(
    presentLiveObservationDiagramResourceLabels(diagram).nodes.map((resource) => resource.label),
    ["요청 분배", "서버 연결", "앱 서버", "데이터베이스", "AWS 리소스"]
  );
});

function node(
  id: string,
  resourceType: string,
  label: string,
  x: number,
  liveObservationRole?: LiveObservationRole
): DiagramNode {
  return {
    id,
    kind: "resource",
    label,
    locked: false,
    metadata: liveObservationRole ? { liveObservationRole } : undefined,
    parameters: {
      fileName: "main.tf",
      resourceName: id,
      resourceType,
      values: {}
    },
    position: { x, y: 0 },
    size: { height: 80, width: 80 },
    type: resourceType,
    zIndex: 1
  };
}

function edge(sourceNodeId: string, targetNodeId: string) {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId
  };
}

function snapshot(): LiveObservationV2Snapshot {
  const observedAt = "2026-07-21T01:02:00.000Z";
  return {
    latestObservation: {
      observedAt,
      payload: {
        availability: 100,
        capacity: { desired: 1, healthy: 1, max: 2, running: 1 },
        errorRate: 0,
        logs: [],
        observedAt,
        p95LatencyMs: 100,
        requests: 2,
        state: "available"
      }
    },
    live: {
      acceptedEventCount: 2,
      observedAt,
      pressureLevel: "normal",
      pressurePercent: 10,
      projectedRequestsPerMinute: 2,
      rollingRequestsPerSecond: 0.1
    },
    observationId: "observation-1",
    status: "active",
    terminalAt: null
  };
}
