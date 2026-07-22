import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  ArchitectureJson,
  LiveObservationProviderState,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";

import { createLiveObservationArchitectureModel } from "./live-observation-architecture.js";

const diagramMapSource = readFileSync(
  new URL("./LiveObservationDiagramMap.tsx", import.meta.url),
  "utf8"
);
const workspaceCssSource = readFileSync(
  new URL("./workspace.module.css", import.meta.url),
  "utf8"
);

const architecture = {
  nodes: [
    resourceNode("cloudfront", "CLOUDFRONT", "CloudFront", 0, 0),
    resourceNode("bucket", "S3", "S3", 200, 0),
    resourceNode("vpc", "VPC", "VPC", 400, 0),
    resourceNode("subnet", "SUBNET", "Subnet", 600, 0),
    resourceNode("iam", "IAM_ROLE", "ECS IAM Role", 800, 0),
    resourceNode("alb", "LOAD_BALANCER", "ALB", 1_000, 0),
    resourceNode("target-group", "LOAD_BALANCER_TARGET_GROUP", "Target Group", 1_200, 0),
    resourceNode("cluster", "ECS_CLUSTER", "ECS Cluster", 1_400, 0),
    resourceNode("service", "ECS_SERVICE", "ECS Service", 1_600, 0),
    resourceNode("logs", "CLOUDWATCH_LOG_GROUP", "Log Group", 1_800, 0)
  ],
  edges: [
    { id: "cloudfront-bucket", sourceId: "cloudfront", targetId: "bucket", label: "serves" },
    { id: "cloudfront-alb", sourceId: "cloudfront", targetId: "alb", label: "routes" },
    { id: "alb-target", sourceId: "alb", targetId: "target-group", label: "forwards" },
    { id: "target-service", sourceId: "target-group", targetId: "service", label: "targets" },
    { id: "service-logs", sourceId: "service", targetId: "logs", label: "writes" },
    { id: "vpc-subnet", sourceId: "vpc", targetId: "subnet", label: "contains" }
  ]
} satisfies ArchitectureJson;

test("keeps every deployed Architecture Resource and edge endpoint in the read-only model", () => {
  const model = createLiveObservationArchitectureModel(architecture, null);

  const diagramNodeIds = new Set(model.diagram.nodes.map((node) => node.id));
  assert.deepEqual(
    architecture.nodes.filter((node) => !diagramNodeIds.has(node.id)),
    []
  );
  assert.deepEqual(
    model.resources.map((resource) => resource.id),
    architecture.nodes.map((node) => node.id)
  );

  const edgeById = new Map(model.diagram.edges.map((edge) => [edge.id, edge]));
  for (const edge of architecture.edges) {
    assert.equal(edgeById.get(edge.id)?.sourceNodeId, edge.sourceId);
    assert.equal(edgeById.get(edge.id)?.targetNodeId, edge.targetId);
  }
});

test("replaces internal Terraform resource labels with stable Korean role names", () => {
  const internalLabels = new Map([
    ["cloudfront", "cdn_web"],
    ["alb", "alb_fixed_template_ecs_fargate_container_app"],
    ["target-group", "tg_fixed_template_ecs_fargate_container_app"],
    ["service", "ecs_service_fixed_template_fargate_container_app"]
  ]);
  const internalArchitecture: ArchitectureJson = {
    ...architecture,
    nodes: architecture.nodes.map((node) => ({
      ...node,
      label: internalLabels.get(node.id) ?? node.label
    }))
  };

  const model = createLiveObservationArchitectureModel(internalArchitecture, null);
  const diagramLabelById = new Map(model.diagram.nodes.map((node) => [node.id, node.label]));
  const resourceLabelById = new Map(model.resources.map((resource) => [resource.id, resource.label]));

  assert.equal(diagramLabelById.get("cloudfront"), "웹 배포");
  assert.equal(diagramLabelById.get("alb"), "로드 밸런서");
  assert.equal(diagramLabelById.get("target-group"), "앱 트래픽 대상");
  assert.equal(diagramLabelById.get("service"), "앱 서버");
  assert.equal(resourceLabelById.get("service"), "앱 서버");
  assert.equal(
    [...diagramLabelById.values(), ...resourceLabelById.values()].some((label) =>
      label.includes("fixed_template")
    ),
    false
  );
});

test("marks supported resources configured before a session and keeps unsupported resources visible", () => {
  const model = createLiveObservationArchitectureModel(architecture, null);
  const stateById = new Map(
    model.resources.map((resource) => [resource.id, resource.observationState])
  );

  for (const resourceId of [
    "cloudfront",
    "bucket",
    "alb",
    "target-group",
    "cluster",
    "service",
    "logs"
  ]) {
    assert.equal(stateById.get(resourceId), "configured");
  }
  for (const resourceId of ["vpc", "subnet", "iam"]) {
    assert.equal(stateById.get(resourceId), "not_supported");
  }
});

test("maps the one aggregate provider state onto every observable resource", () => {
  const expectedStates = {
    available: "observed",
    delayed: "delayed",
    unavailable: "unavailable"
  } as const;

  for (const [providerState, observationState] of Object.entries(expectedStates)) {
    const model = createLiveObservationArchitectureModel(
      architecture,
      providerSnapshot(providerState as LiveObservationProviderState)
    );

    assert.equal(model.aggregateObservationState, observationState);
    assert.ok(
      model.resources
        .filter((resource) => resource.observable)
        .every((resource) => resource.observationState === observationState)
    );
    assert.equal(
      model.resources.find((resource) => resource.id === "vpc")?.observationState,
      "not_supported"
    );
  }
});

test("requires an ECS Service to Application Auto Scaling Target edge before labeling pre-session capacity Auto Scaling", () => {
  const fixedModel = createLiveObservationArchitectureModel(architecture, null);
  assert.equal(fixedModel.capacityModeLabel, "고정 용량");

  const scalingTarget = resourceNode(
    "scaling-target",
    "APPLICATION_AUTO_SCALING_TARGET",
    "ECS Scaling Target",
    2_000,
    0
  );
  const targetWithoutServiceEdge = createLiveObservationArchitectureModel({
    ...architecture,
    nodes: [...architecture.nodes, scalingTarget]
  }, null);
  assert.equal(targetWithoutServiceEdge.capacityModeLabel, "고정 용량");

  const unrelatedAsg = createLiveObservationArchitectureModel({
    ...architecture,
    nodes: [
      ...architecture.nodes,
      resourceNode("ec2-asg", "AUTO_SCALING_GROUP", "EC2 ASG", 2_200, 0),
      resourceNode("ec2-asg-policy", "AUTO_SCALING_POLICY", "EC2 ASG Policy", 2_400, 0)
    ]
  }, null);
  assert.equal(unrelatedAsg.capacityModeLabel, "고정 용량");

  const scalingModel = createLiveObservationArchitectureModel({
    ...architecture,
    nodes: [...architecture.nodes, scalingTarget],
    edges: [
      ...architecture.edges,
      {
        id: "service-scaling-target",
        sourceId: "service",
        targetId: "scaling-target",
        label: "scales"
      }
    ]
  }, null);
  assert.equal(scalingModel.capacityModeLabel, "Auto Scaling");
});

test("uses matched provider capacity max as the authoritative post-session mode", () => {
  const fixedArchitectureWithScalingEdge = {
    ...architecture,
    nodes: [
      ...architecture.nodes,
      resourceNode(
        "scaling-target",
        "APPLICATION_AUTO_SCALING_TARGET",
        "ECS Scaling Target",
        2_000,
        0
      )
    ],
    edges: [
      ...architecture.edges,
      {
        id: "service-scaling-target",
        sourceId: "service",
        targetId: "scaling-target",
        label: "scales"
      }
    ]
  } satisfies ArchitectureJson;

  assert.equal(
    createLiveObservationArchitectureModel(
      fixedArchitectureWithScalingEdge,
      providerSnapshot("available", null)
    ).capacityModeLabel,
    "고정 용량"
  );
  assert.equal(
    createLiveObservationArchitectureModel(
      architecture,
      providerSnapshot("available", 6)
    ).capacityModeLabel,
    "Auto Scaling"
  );
});

test("falls back to the immutable Architecture mode when provider capacity evidence is empty", () => {
  const autoScalingArchitecture = {
    ...architecture,
    nodes: [
      ...architecture.nodes,
      resourceNode(
        "scaling-target",
        "APPLICATION_AUTO_SCALING_TARGET",
        "ECS Scaling Target",
        2_000,
        0
      )
    ],
    edges: [
      ...architecture.edges,
      {
        id: "service-scaling-target",
        sourceId: "service",
        targetId: "scaling-target",
        label: "scales"
      }
    ]
  } satisfies ArchitectureJson;
  const delayedWithoutCapacity = providerSnapshot("delayed");

  if (!delayedWithoutCapacity.latestObservation) {
    throw new Error("Expected provider observation fixture");
  }
  delayedWithoutCapacity.latestObservation.payload.capacity = {
    desired: null,
    running: null,
    healthy: null,
    max: null
  };

  assert.equal(
    createLiveObservationArchitectureModel(
      autoScalingArchitecture,
      delayedWithoutCapacity
    ).capacityModeLabel,
    "Auto Scaling"
  );
});

test("shows validated Service Auto Scaling capacity and target tracking details on their nodes", () => {
  const serviceAutoScalingArchitecture = createServiceAutoScalingArchitecture();
  const model = createLiveObservationArchitectureModel(serviceAutoScalingArchitecture, null);
  const resourceById = new Map(model.resources.map((resource) => [resource.id, resource]));

  assert.deepEqual(resourceById.get("scaling-target")?.detailLines, [
    "최소 1 · 최대 4"
  ]);
  assert.deepEqual(resourceById.get("scaling-policy")?.detailLines, [
    "ECS 평균 CPU 사용률 · 목표 60"
  ]);
});

test("recovers the immutable observation path from unambiguous Terraform references when saved edges are missing", () => {
  const model = createLiveObservationArchitectureModel(
    createReferenceOnlyLiveObservationArchitecture(),
    null
  );
  const edgePairs = new Set(
    model.diagram.edges.map((edge) => `${edge.sourceNodeId}->${edge.targetNodeId}`)
  );

  for (const pair of [
    "cloudfront->alb",
    "alb->listener",
    "listener->target-group",
    "target-group->service",
    "service->task",
    "service->scaling-target",
    "scaling-target->scaling-policy"
  ]) {
    assert.ok(edgePairs.has(pair), `Missing recovered observation edge ${pair}`);
  }
  assert.equal(model.capacityModeLabel, "Auto Scaling");
  assert.ok(
    (model.resources.find((resource) => resource.id === "scaling-target")?.detailLines.length ?? 0) > 0
  );
});

test("does not infer an observation edge from an ambiguous Terraform reference", () => {
  const architecture = createReferenceOnlyLiveObservationArchitecture();
  architecture.nodes.push({
    ...resourceNode("alb-duplicate", "LOAD_BALANCER", "Duplicate ALB", 200, 200),
    config: { terraformResourceName: "app" }
  });

  const model = createLiveObservationArchitectureModel(architecture, null);

  assert.equal(
    model.diagram.edges.some((edge) => edge.sourceNodeId === "cloudfront"),
    false
  );
});

test("does not show partial Service Auto Scaling details from invalid Architecture config", () => {
  const validArchitecture = createServiceAutoScalingArchitecture();
  const invalidArchitecture = {
    ...validArchitecture,
    nodes: validArchitecture.nodes.map((node) =>
      node.id === "scaling-target"
        ? { ...node, config: { ...node.config, maxCapacity: "4" } }
        : node
    )
  } satisfies ArchitectureJson;
  const model = createLiveObservationArchitectureModel(invalidArchitecture, null);

  assert.ok(model.resources.every((resource) => resource.detailLines.length === 0));
});

test("provides hidden noninteractive source and target handles to every custom map node", () => {
  assert.match(diagramMapSource, /<Handle[\s\S]*type="target"/);
  assert.match(diagramMapSource, /<Handle[\s\S]*type="source"/);
  assert.equal(
    diagramMapSource.match(/<LiveObservationEdgeEndpoints \/>/g)?.length,
    2
  );
  assert.match(diagramMapSource, /isConnectable=\{false\}/);
  assert.match(
    workspaceCssSource,
    /\.liveObservationArchitectureEdgeHandle\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s
  );
});

test("renders the original Resource type inside the area-node branch", () => {
  const areaBranchStart = diagramMapSource.indexOf("if (area) {");
  const areaBranchEnd = diagramMapSource.indexOf("\n  return (", areaBranchStart);
  const areaBranch = diagramMapSource.slice(areaBranchStart, areaBranchEnd);

  assert.ok(areaBranchStart >= 0 && areaBranchEnd > areaBranchStart);
  assert.match(areaBranch, /resource\.resourceType/);
});

test("renders validated Architecture detail lines inside scaling Resource nodes", () => {
  assert.match(diagramMapSource, /resource\?\.detailLines\.map/);
  assert.match(diagramMapSource, /liveObservationArchitectureResourceDetail/);
  assert.match(
    workspaceCssSource,
    /\.liveObservationArchitectureResourceDetail\s*\{[^}]*overflow-wrap:\s*anywhere;/s
  );
});

test("uses observation-only readable cards and collision-free reference-layout spacing", () => {
  assert.match(diagramMapSource, /getLiveObservationMapNodeLayout/);
  assert.match(diagramMapSource, /LIVE_OBSERVATION_RESOURCE_WIDTH = 148/);
  assert.match(diagramMapSource, /LIVE_OBSERVATION_RESOURCE_HEIGHT = 104/);
  assert.match(diagramMapSource, /LIVE_OBSERVATION_DETAIL_RESOURCE_WIDTH = 184/);
  assert.match(diagramMapSource, /LIVE_OBSERVATION_DETAIL_RESOURCE_HEIGHT = 124/);
  assert.match(diagramMapSource, /LIVE_OBSERVATION_LAYOUT_SCALE = 2\.75/);
  assert.match(
    diagramMapSource,
    /position:\s*layout\.position[\s\S]*height:\s*layout\.height[\s\S]*width:\s*layout\.width/
  );
  assert.match(diagramMapSource, /<ResourceIcon node=\{node\} size=\{28\} \/>/);
  assert.match(
    diagramMapSource,
    /height:\s*hasDetailLines[\s\S]*LIVE_OBSERVATION_DETAIL_RESOURCE_HEIGHT[\s\S]*LIVE_OBSERVATION_RESOURCE_HEIGHT[\s\S]*width:\s*hasDetailLines[\s\S]*LIVE_OBSERVATION_DETAIL_RESOURCE_WIDTH[\s\S]*LIVE_OBSERVATION_RESOURCE_WIDTH/
  );
  assert.doesNotMatch(diagramMapSource, /Math\.max\(\s*node\.size\.(?:height|width)/);
  assert.doesNotMatch(
    diagramMapSource,
    /height:\s*hasDetailLines\s*\?\s*Math\.max\(node\.size\.height,\s*104\)/
  );

  const referenceColumnDistance = 1_056 - 972;
  const scaledColumnDistance = referenceColumnDistance * 2.75;
  const detailCardWidth = 184;
  assert.ok(
    scaledColumnDistance > detailCardWidth,
    "Reference-layout detail cards must retain a visible horizontal gap"
  );
  assert.match(
    diagramMapSource,
    /height:\s*node\.size\.height \* LIVE_OBSERVATION_LAYOUT_SCALE[\s\S]*width:\s*node\.size\.width \* LIVE_OBSERVATION_LAYOUT_SCALE/
  );
});

test("keeps the initial map readable while preserving pan, zoom, and MiniMap exploration", () => {
  assert.match(diagramMapSource, /\bMiniMap\b/);
  assert.match(diagramMapSource, /<MiniMap[\s\S]*pannable[\s\S]*zoomable/);
  assert.match(
    diagramMapSource,
    /fitViewOptions=\{\{ maxZoom: 1\.2, minZoom: 0\.8, padding: 0\.16 \}\}/
  );
  assert.match(diagramMapSource, /panOnDrag/);
  assert.match(
    diagramMapSource,
    /지원 Resource에는 AWS 세션의\s+집계 상태를 표시합니다\. 개별 Resource API 성공을 의미하지 않습니다\. 전체 구조는\s+미니맵과 드래그로 이동하고 \+\/-로 확대·축소할 수 있습니다\./
  );
  assert.match(
    workspaceCssSource,
    /\.liveObservationArchitectureHeader p\s*\{[^}]*font-size:\s*calc\(6px \+ var\(--presentation-font-size-increase\)\);[^}]*max-width:\s*610px;/s
  );
  assert.doesNotMatch(
    workspaceCssSource,
    /\.liveObservationArchitectureHeader p\s*\{[^}]*line-clamp:/s
  );
  assert.match(
    workspaceCssSource,
    /\.liveObservationArchitectureResourceNode > strong\s*\{[^}]*font-size:\s*calc\(9px \+ var\(--presentation-font-size-increase\)\);/s
  );
  assert.match(
    workspaceCssSource,
    /\.liveObservationArchitectureResourceNode > small\s*\{[^}]*font-size:\s*calc\(7px \+ var\(--presentation-font-size-increase\)\);/s
  );
  assert.match(
    workspaceCssSource,
    /\.liveObservationArchitectureResourceDetail\s*\{[^}]*font-size:\s*calc\(7px \+ var\(--presentation-font-size-increase\)\);/s
  );
  assert.match(
    workspaceCssSource,
    /\.liveObservationArchitectureStateBadge\s*\{[^}]*font-size:\s*calc\(6px \+ var\(--presentation-font-size-increase\)\);[^}]*line-height:\s*1\.25;/s
  );
});

function createServiceAutoScalingArchitecture(): ArchitectureJson {
  return {
    ...architecture,
    nodes: [
      ...architecture.nodes,
      {
        ...resourceNode(
          "scaling-target",
          "APPLICATION_AUTO_SCALING_TARGET",
          "ECS Scaling Target",
          2_000,
          0
        ),
        config: { minCapacity: 1, maxCapacity: 4 }
      },
      {
        ...resourceNode(
          "scaling-policy",
          "APPLICATION_AUTO_SCALING_POLICY",
          "ECS CPU Target Tracking",
          2_200,
          0
        ),
        config: {
          policyType: "TargetTrackingScaling",
          targetTrackingScalingPolicyConfiguration: {
            targetValue: 60,
            predefinedMetricSpecification: [
              { predefinedMetricType: "ECSServiceAverageCPUUtilization" }
            ]
          }
        }
      }
    ],
    edges: [
      ...architecture.edges,
      {
        id: "service-scaling-target",
        sourceId: "service",
        targetId: "scaling-target",
        label: "scales"
      },
      {
        id: "target-scaling-policy",
        sourceId: "scaling-target",
        targetId: "scaling-policy",
        label: "uses"
      }
    ]
  };
}

function createReferenceOnlyLiveObservationArchitecture(): ArchitectureJson {
  return {
    nodes: [
      {
        ...resourceNode("cloudfront", "CLOUDFRONT", "CloudFront", 0, 0),
        config: {
          terraformResourceName: "web",
          origin: [{ domainName: "aws_lb.app.dns_name" }]
        }
      },
      {
        ...resourceNode("alb", "LOAD_BALANCER", "ALB", 200, 0),
        config: { terraformResourceName: "app" }
      },
      {
        ...resourceNode("listener", "LOAD_BALANCER_LISTENER", "Listener", 400, 0),
        config: {
          terraformResourceName: "http",
          loadBalancerArn: "aws_lb.app.arn",
          defaultAction: { targetGroupArn: "aws_lb_target_group.app.arn" }
        }
      },
      {
        ...resourceNode(
          "target-group",
          "LOAD_BALANCER_TARGET_GROUP",
          "Target Group",
          600,
          0
        ),
        config: { terraformResourceName: "app" }
      },
      {
        ...resourceNode("service", "ECS_SERVICE", "ECS Service", 800, 0),
        config: {
          terraformResourceName: "audience_service",
          loadBalancer: { targetGroupArn: "aws_lb_target_group.app.arn" },
          taskDefinition: "aws_ecs_task_definition.audience.arn"
        }
      },
      {
        ...resourceNode("task", "ECS_TASK_DEFINITION", "Task Definition", 1_000, 0),
        config: { terraformResourceName: "audience" }
      },
      {
        ...resourceNode(
          "scaling-target",
          "APPLICATION_AUTO_SCALING_TARGET",
          "Scaling Target",
          1_200,
          0
        ),
        config: {
          terraformResourceName: "audience_service",
          minCapacity: 1,
          maxCapacity: 4,
          resourceId:
            "service/${aws_ecs_cluster.audience.name}/${aws_ecs_service.audience_service.name}"
        }
      },
      {
        ...resourceNode(
          "scaling-policy",
          "APPLICATION_AUTO_SCALING_POLICY",
          "Scaling Policy",
          1_400,
          0
        ),
        config: {
          terraformResourceName: "audience_service",
          resourceId: "${aws_appautoscaling_target.audience_service.resource_id}",
          policyType: "TargetTrackingScaling",
          targetTrackingScalingPolicyConfiguration: {
            targetValue: 60,
            predefinedMetricSpecification: [
              { predefinedMetricType: "ALBRequestCountPerTarget" }
            ]
          }
        }
      }
    ],
    edges: []
  };
}

function resourceNode(
  id: string,
  type: ArchitectureJson["nodes"][number]["type"],
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return { config: {}, id, label, positionX, positionY, type };
}

function providerSnapshot(
  state: LiveObservationProviderState,
  maxCapacity: number | null = null
): LiveObservationV2Snapshot {
  return {
    observationId: "observation-1",
    status: "active",
    live: {
      acceptedEventCount: 3,
      rollingRequestsPerSecond: 0.5,
      projectedRequestsPerMinute: 30,
      pressurePercent: 50,
      pressureLevel: "normal",
      observedAt: "2026-07-16T03:00:00.000Z"
    },
    latestObservation: {
      observedAt: "2026-07-16T03:00:00.000Z",
      payload: {
        requests: 30,
        errorRate: 0,
        p95LatencyMs: 120,
        availability: 100,
        capacity: { desired: 2, running: 2, healthy: 2, max: maxCapacity },
        logs: [],
        observedAt: "2026-07-16T03:00:00.000Z",
        state
      }
    },
    terminalAt: null
  };
}
