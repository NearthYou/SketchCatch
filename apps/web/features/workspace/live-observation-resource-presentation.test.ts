import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";

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

  const labels = presentLiveObservationDiagramResourceLabels(diagram).nodes.map(
    (resource) => resource.label
  );

  assert.deepEqual(labels, ["웹 배포", "로드 밸런서", "앱 트래픽 대상", "앱 서버", "실행 서버"]);
  assert.equal(
    labels.some((label) => label.includes("fixed_template") || label.includes("_")),
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
