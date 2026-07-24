import assert from "node:assert/strict";
import test from "node:test";
import { buildTemplateDiagramJson, type DiagramNode } from "@sketchcatch/types";
import {
  evaluateAutomaticDiagramLayout,
  layoutAutomaticDiagram,
  layoutAutomaticDiagramCandidates
} from "./automatic-diagram-layout";
import { getAutomaticDiagramSemanticRole } from "./automatic-diagram-layout-provider-mapping";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson
} from "./workspace-ai-diagram-adapter";

test("layoutAutomaticDiagram arranges the primary request flow from left to right", () => {
  const nodes = [
    makeNode("database", "aws_db_instance", 40, 40),
    makeNode("browser", "actor_browser", 720, 420, "design"),
    makeNode("compute", "aws_ecs_service", 80, 500),
    makeNode("entry", "aws_lb", 520, 20)
  ];
  const edges = [
    { id: "browser-entry", sourceId: "browser", targetId: "entry", label: "HTTPS" },
    { id: "entry-compute", sourceId: "entry", targetId: "compute", label: "routes requests" },
    { id: "compute-database", sourceId: "compute", targetId: "database", label: "reads/writes" }
  ];

  const result = layoutAutomaticDiagram({ edges, nodes });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));

  assert.ok(nodeById.get("browser")!.position.x < nodeById.get("entry")!.position.x);
  assert.ok(nodeById.get("entry")!.position.x < nodeById.get("compute")!.position.x);
  assert.ok(nodeById.get("compute")!.position.x < nodeById.get("database")!.position.x);
  assert.deepEqual(layoutAutomaticDiagram({ edges, nodes }), result);
});

test("layoutAutomaticDiagram은 선택 profile마다 기존 후보군을 확장한다", () => {
  const nodes = [
    makeNode("browser", "actor_browser", 0, 0, "design"),
    makeNode("service", "aws_ecs_service", 0, 0)
  ];
  const edges = [{ id: "browser-service", sourceId: "browser", targetId: "service" }];
  const input = {
    edges,
    nodes,
    candidateProfiles: [{ id: "knowledge:compact-service", columnGap: 120, rowGap: 80 }]
  } as Parameters<typeof layoutAutomaticDiagram>[0];

  const result = layoutAutomaticDiagram(input);

  assert.equal(result.candidateCount, 12);
  assert.deepEqual(layoutAutomaticDiagram(input), result);
});

test("layout 후보 목록은 기존 단일 선택을 첫 결과로 유지하고 결정론적으로 정렬한다", () => {
  const nodes = [
    makeNode("browser", "actor_browser", 0, 0, "design"),
    makeNode("service", "aws_ecs_service", 0, 0),
    makeNode("bucket", "aws_s3_bucket", 0, 0)
  ];
  const edges = [
    { id: "browser-service", sourceId: "browser", targetId: "service" },
    { id: "service-bucket", sourceId: "service", targetId: "bucket" }
  ];
  const input = { edges, nodes };

  const selected = layoutAutomaticDiagram(input);
  const candidates = layoutAutomaticDiagramCandidates(input);

  assert(candidates.length > 0);
  assert.deepEqual(candidates[0], selected);
  assert.deepEqual(layoutAutomaticDiagramCandidates(input), candidates);
  assert.equal(new Set(candidates.map((candidate) => candidate.candidateId)).size, candidates.length);
});

test("knowledge spacing profile은 baseline보다 edge/node/containment 이상치를 늘리면 선택하지 않는다", () => {
  const input = {
    edges: createFailureLikeEdges(),
    nodes: createFailureLikeNodes()
  };
  const baseline = layoutAutomaticDiagram(input);
  const result = layoutAutomaticDiagram({
    ...input,
    candidateProfiles: [{ id: "knowledge:risky-tight", columnGap: 8, rowGap: 8 }]
  });

  assert.equal(result.candidateId, baseline.candidateId);
  assert.equal(result.quality.edgeNodeIntersectionCount, baseline.quality.edgeNodeIntersectionCount);
  assert.equal(result.quality.edgeCrossingCount, baseline.quality.edgeCrossingCount);
  assert.equal(result.quality.parentBoundaryViolationCount, baseline.quality.parentBoundaryViolationCount);
});

test("Template에 profile이 edge node 관통을 새로 만들면 낮은 총점이어도 baseline을 유지한다", () => {
  const diagram = buildTemplateDiagramJson("three-tier-web-app", {
    projectSlug: "profile-guard",
    shortId: "profile-guard"
  });
  const input = {
    edges: diagram.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      label: edge.label
    })),
    nodes: diagram.nodes
  };
  const baseline = layoutAutomaticDiagram(input);
  const result = layoutAutomaticDiagram({
    ...input,
    candidateProfiles: [{ id: "knowledge:risky-tight", columnGap: 8, rowGap: 8 }]
  });

  assert.equal(result.candidateId, baseline.candidateId);
  assert.equal(result.quality.edgeNodeIntersectionCount, baseline.quality.edgeNodeIntersectionCount);
  assert.equal(result.quality.edgeCrossingCount, baseline.quality.edgeCrossingCount);
});

test("layoutAutomaticDiagram lays out containment before aligned repeated areas", () => {
  const nodes = [
    makeNode("vpc", "aws_vpc", 600, 500, "resource", { size: { width: 300, height: 200 } }),
    makeNode("subnet-a", "aws_subnet", 40, 40, "resource", {
      parentAreaNodeId: "vpc",
      size: { width: 420, height: 260 }
    }),
    makeNode("subnet-b", "aws_subnet", 80, 80, "resource", {
      parentAreaNodeId: "vpc",
      size: { width: 420, height: 260 }
    }),
    makeNode("compute-a", "aws_ecs_service", 900, 80, "resource", { parentAreaNodeId: "subnet-a" }),
    makeNode("compute-b", "aws_ecs_service", 20, 700, "resource", { parentAreaNodeId: "subnet-b" })
  ];

  const result = layoutAutomaticDiagram({ edges: [], nodes });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const vpc = nodeById.get("vpc")!;
  const subnetA = nodeById.get("subnet-a")!;
  const subnetB = nodeById.get("subnet-b")!;

  assertContains(vpc, subnetA);
  assertContains(vpc, subnetB);
  assertContains(subnetA, nodeById.get("compute-a")!);
  assertContains(subnetB, nodeById.get("compute-b")!);
  assert.equal(overlaps(subnetA, subnetB), false);
  assert.equal(subnetA.position.x, subnetB.position.x);
  assert.deepEqual(subnetA.size, subnetB.size);
});

test("layoutAutomaticDiagram separates support lanes and reports structural quality", () => {
  const nodes = [
    makeNode("browser", "actor_browser", 700, 700, "design"),
    makeNode("entry", "aws_lb", 80, 600),
    makeNode("compute", "aws_ecs_service", 500, 20),
    makeNode("database", "aws_db_instance", 120, 40),
    makeNode("runtime-role", "aws_iam_role", 400, 420),
    makeNode("pipeline", "aws_codepipeline", 40, 300),
    makeNode("logs", "aws_cloudwatch_log_group", 900, 200)
  ];
  const edges = [
    { id: "browser-entry", sourceId: "browser", targetId: "entry", label: "HTTPS" },
    { id: "entry-compute", sourceId: "entry", targetId: "compute", label: "routes requests" },
    { id: "compute-database", sourceId: "compute", targetId: "database", label: "reads/writes" },
    { id: "pipeline-compute", sourceId: "pipeline", targetId: "compute", label: "deploys" },
    { id: "role-compute", sourceId: "runtime-role", targetId: "compute", label: "grants runtime access" },
    { id: "compute-logs", sourceId: "compute", targetId: "logs", label: "writes logs" }
  ];

  const result = layoutAutomaticDiagram({ edges, nodes });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const primaryNodes = ["browser", "entry", "compute", "database"].map((id) => nodeById.get(id)!);
  const primaryLeft = Math.min(...primaryNodes.map((node) => node.position.x));
  const primaryTop = Math.min(...primaryNodes.map((node) => node.position.y));
  const primaryRight = Math.max(...primaryNodes.map((node) => node.position.x + node.size.width));
  const primaryBottom = Math.max(...primaryNodes.map((node) => node.position.y + node.size.height));
  const isOutsidePrimaryBand = (node: DiagramNode): boolean =>
    node.position.x + node.size.width <= primaryLeft ||
    node.position.x >= primaryRight ||
    node.position.y + node.size.height <= primaryTop ||
    node.position.y >= primaryBottom;

  assert.equal(isOutsidePrimaryBand(nodeById.get("pipeline")!), true);
  assert.equal(isOutsidePrimaryBand(nodeById.get("runtime-role")!), true);
  assert.equal(isOutsidePrimaryBand(nodeById.get("logs")!), true);
  assert.equal(result.quality.nodeOverlapCount, 0);
  assert.equal(result.quality.parentBoundaryViolationCount, 0);
  assert.equal(result.quality.backwardEdgeCount, 0);
  assert.ok(result.quality.canvasArea > 0);
  assert.ok(result.candidateCount >= 2);
});

test("provider mapping keeps AWS companion infrastructure out of the primary flow", () => {
  const supportResourceTypes = [
    "aws_appautoscaling_target",
    "aws_db_subnet_group",
    "aws_ecs_task_definition",
    "aws_internet_gateway",
    "aws_nat_gateway",
    "aws_route_table",
    "aws_route_table_association"
  ];

  for (const resourceType of supportResourceTypes) {
    assert.equal(
      getAutomaticDiagramSemanticRole(makeNode(resourceType, resourceType, 0, 0)),
      "support"
    );
  }
  assert.equal(getAutomaticDiagramSemanticRole(makeNode("vpc", "aws_vpc", 0, 0)), "network");
});

test("layoutAutomaticDiagram keeps support routing adjustments within compact board bounds", () => {
  const nodes = [
    makeNode("browser", "actor_browser", 0, 0, "design"),
    makeNode("entry", "aws_lb", 0, 0),
    makeNode("compute", "aws_ecs_service", 0, 0),
    makeNode("database", "aws_db_instance", 0, 0),
    makeNode("pipeline", "aws_codepipeline", 0, 0),
    makeNode("registry", "aws_ecr_repository", 0, 0),
    makeNode("runtime-role", "aws_iam_role", 0, 0),
    makeNode("logs", "aws_cloudwatch_log_group", 0, 0),
    makeNode("alarm", "aws_cloudwatch_metric_alarm", 0, 0)
  ];
  const edges = [
    { id: "browser-entry", sourceId: "browser", targetId: "entry", label: "HTTPS" },
    { id: "entry-compute", sourceId: "entry", targetId: "compute", label: "routes requests" },
    { id: "compute-database", sourceId: "compute", targetId: "database", label: "reads/writes" },
    { id: "pipeline-registry", sourceId: "pipeline", targetId: "registry", label: "publishes image" },
    { id: "registry-compute", sourceId: "registry", targetId: "compute", label: "deploys image" },
    { id: "role-compute", sourceId: "runtime-role", targetId: "compute", label: "grants runtime access" },
    { id: "compute-logs", sourceId: "compute", targetId: "logs", label: "writes logs" },
    { id: "alarm-compute", sourceId: "alarm", targetId: "compute", label: "monitors CPU" }
  ];

  const result = layoutAutomaticDiagram({ edges, nodes });
  const bounds = getBounds(result.nodes);

  assert.equal(result.quality.nodeOverlapCount, 0);
  assert.equal(result.quality.edgeNodeIntersectionCount, 0);
  assert.ok(
    bounds.width <= 900,
    `Expected compact support bounds, received ${bounds.width}x${bounds.height}`
  );
  assert.ok(bounds.height <= 820, `Expected compact support height, received ${bounds.height}`);
});

test("layoutAutomaticDiagram keeps root support resources in a compact rail around a tall workload", () => {
  const nodes = [
    makeNode("browser", "actor_browser", 0, 0, "design"),
    makeNode("entry", "aws_cloudfront_distribution", 0, 0),
    makeNode("vpc", "aws_vpc", 0, 0, "resource", { size: { width: 400, height: 280 } }),
    makeNode("public-a", "aws_subnet", 0, 0, "resource", { parentAreaNodeId: "vpc" }),
    makeNode("public-b", "aws_subnet", 0, 0, "resource", { parentAreaNodeId: "vpc" }),
    makeNode("private-a", "aws_subnet", 0, 0, "resource", { parentAreaNodeId: "vpc" }),
    makeNode("private-b", "aws_subnet", 0, 0, "resource", { parentAreaNodeId: "vpc" }),
    makeNode("database-a", "aws_subnet", 0, 0, "resource", { parentAreaNodeId: "vpc" }),
    makeNode("database-b", "aws_subnet", 0, 0, "resource", { parentAreaNodeId: "vpc" }),
    makeNode("load-balancer", "aws_lb", 0, 0, "resource", { parentAreaNodeId: "public-a" }),
    makeNode("compute-a", "aws_ecs_service", 0, 0, "resource", { parentAreaNodeId: "private-a" }),
    makeNode("compute-b", "aws_ecs_service", 0, 0, "resource", { parentAreaNodeId: "private-b" }),
    makeNode("database-a-instance", "aws_db_instance", 0, 0, "resource", {
      parentAreaNodeId: "database-a"
    }),
    makeNode("database-b-instance", "aws_db_instance", 0, 0, "resource", {
      parentAreaNodeId: "database-b"
    }),
    makeNode("pipeline", "aws_codepipeline", 0, 0),
    makeNode("registry", "aws_ecr_repository", 0, 0),
    makeNode("runtime-role", "aws_iam_role", 0, 0),
    makeNode("logs", "aws_cloudwatch_log_group", 0, 0),
    makeNode("alarm", "aws_cloudwatch_metric_alarm", 0, 0)
  ];
  const edges = [
    { id: "browser-entry", sourceId: "browser", targetId: "entry", label: "HTTPS" },
    { id: "entry-load-balancer", sourceId: "entry", targetId: "load-balancer", label: "API traffic" },
    { id: "load-balancer-compute-a", sourceId: "load-balancer", targetId: "compute-a", label: "routes requests" },
    { id: "load-balancer-compute-b", sourceId: "load-balancer", targetId: "compute-b", label: "routes requests" },
    { id: "compute-a-database", sourceId: "compute-a", targetId: "database-a-instance", label: "reads/writes" },
    { id: "compute-b-database", sourceId: "compute-b", targetId: "database-b-instance", label: "reads" },
    { id: "pipeline-registry", sourceId: "pipeline", targetId: "registry", label: "publishes image" },
    { id: "registry-compute", sourceId: "registry", targetId: "compute-a", label: "deploys image" },
    { id: "role-compute", sourceId: "runtime-role", targetId: "compute-a", label: "grants runtime access" },
    { id: "compute-logs", sourceId: "compute-a", targetId: "logs", label: "writes logs" },
    { id: "alarm-compute", sourceId: "alarm", targetId: "compute-a", label: "monitors CPU" }
  ];

  const result = layoutAutomaticDiagram({ edges, nodes });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const supportNodes = ["pipeline", "registry", "runtime-role", "logs", "alarm"].map(
    (id) => nodeById.get(id)!
  );
  const bounds = getBounds(result.nodes);
  const supportRows = new Set(supportNodes.map((node) => node.position.y));

  assert.ok(supportRows.size <= 2, `Expected at most two support rows, received ${supportRows.size}`);
  assert.ok(
    bounds.height <= 720,
    `Expected a compact support rail, received ${bounds.height}: ${JSON.stringify(
      supportNodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }))
    )}`
  );
  assert.equal(result.quality.supportLaneIntrusionCount, 0);
});

test("layoutAutomaticDiagram wraps dense root support resources into a compact grid", () => {
  const supportNodes = Array.from({ length: 16 }, (_, index) =>
    makeNode(`support-${index}`, index % 2 === 0 ? "aws_iam_role" : "aws_cloudwatch_log_group", 0, 0)
  );
  const nodes = [
    makeNode("vpc", "aws_vpc", 200, 0, "resource", { size: { width: 1000, height: 400 } }),
    makeNode("entry", "aws_lb", 0, 0),
    ...supportNodes
  ];
  const edges = supportNodes.map((node, index) => ({
    id: `support-edge-${index}`,
    sourceId: node.id,
    targetId: "entry",
    label: "supports"
  }));
  const result = layoutAutomaticDiagram({
    edges,
    nodes,
    protectedNodeIds: new Set(["vpc"])
  });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const laidOutSupportNodes = supportNodes.map((node) => nodeById.get(node.id)!);
  const supportRows = new Set(laidOutSupportNodes.map((node) => node.position.y));
  const bounds = getBounds(result.nodes);

  assert.equal(supportRows.size, 2);
  assert.ok(bounds.height <= 760, `Expected a compact dense support grid, received ${bounds.height}`);
  for (let leftIndex = 0; leftIndex < laidOutSupportNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < laidOutSupportNodes.length; rightIndex += 1) {
      assert.equal(overlaps(laidOutSupportNodes[leftIndex]!, laidOutSupportNodes[rightIndex]!), false);
    }
  }
});

test("layoutAutomaticDiagram wraps dense support resources inside an Area", () => {
  const supportNodes = Array.from({ length: 16 }, (_, index) =>
    makeNode(
      `nested-support-${index}`,
      index % 2 === 0 ? "aws_iam_role" : "aws_cloudwatch_log_group",
      0,
      0,
      "resource",
      { parentAreaNodeId: "vpc" }
    )
  );
  const nodes = [
    makeNode("vpc", "aws_vpc", 0, 0, "resource", { size: { width: 1000, height: 400 } }),
    makeNode("entry", "aws_lb", 0, 0, "resource", { parentAreaNodeId: "vpc" }),
    ...supportNodes
  ];
  const edges = supportNodes.map((node, index) => ({
    id: `nested-support-edge-${index}`,
    sourceId: node.id,
    targetId: "entry",
    label: "supports"
  }));
  const result = layoutAutomaticDiagram({ edges, nodes });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const laidOutSupportNodes = supportNodes.map((node) => nodeById.get(node.id)!);
  const supportRows = new Set(laidOutSupportNodes.map((node) => node.position.y));
  const laidOutVpc = nodeById.get("vpc")!;

  assert.equal(supportRows.size, 2);
  assert.ok(
    laidOutVpc.size.height <= 760,
    `Expected a compact nested support grid, received ${laidOutVpc.size.height}`
  );
  for (let leftIndex = 0; leftIndex < laidOutSupportNodes.length; leftIndex += 1) {
    assertContains(laidOutVpc, laidOutSupportNodes[leftIndex]!);
    for (let rightIndex = leftIndex + 1; rightIndex < laidOutSupportNodes.length; rightIndex += 1) {
      assert.equal(overlaps(laidOutSupportNodes[leftIndex]!, laidOutSupportNodes[rightIndex]!), false);
    }
  }
});

test("layoutAutomaticDiagram aligns repeated subnet Areas by tier and availability zone", () => {
  const subnetIds = [
    "public-subnet-a",
    "public-subnet-b",
    "private-app-subnet-a",
    "private-app-subnet-b",
    "private-db-subnet-a",
    "private-db-subnet-b"
  ];
  const nodes = [
    makeNode("vpc", "aws_vpc", 0, 0, "resource", { size: { width: 1000, height: 400 } }),
    ...subnetIds.map((id) =>
      makeNode(id, "aws_subnet", 0, 0, "resource", { parentAreaNodeId: "vpc" })
    )
  ];
  const result = layoutAutomaticDiagram({ edges: [], nodes });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const subnets = subnetIds.map((id) => nodeById.get(id)!);
  const subnetColumns = new Set(subnets.map((node) => node.position.x));
  const subnetRows = new Set(subnets.map((node) => node.position.y));
  const laidOutVpc = nodeById.get("vpc")!;

  assert.equal(subnetColumns.size, 3);
  assert.equal(subnetRows.size, 2);
  assert.ok(
    laidOutVpc.size.height <= 850,
    `Expected a compact repeated subnet grid, received ${laidOutVpc.size.height}`
  );
  for (let leftIndex = 0; leftIndex < subnets.length; leftIndex += 1) {
    assertContains(laidOutVpc, subnets[leftIndex]!);
    for (let rightIndex = leftIndex + 1; rightIndex < subnets.length; rightIndex += 1) {
      assert.equal(overlaps(subnets[leftIndex]!, subnets[rightIndex]!), false);
    }
  }
});

test("layoutAutomaticDiagram keeps Template geometry stable when repeated Area labels change", () => {
  const diagram = buildTemplateDiagramJson("three-tier-web-app", {
    projectSlug: "label-layout-regression",
    shortId: "label-layout-regression"
  });
  const legacyLabelsByResourceName: Readonly<Record<string, string>> = {
    app_subnet_a: "App Subnet A",
    app_subnet_b: "App Subnet B",
    db_subnet_a: "DB Subnet A",
    db_subnet_b: "DB Subnet B"
  };
  const legacyNodes = diagram.nodes.map((node) => ({
    ...node,
    label: legacyLabelsByResourceName[node.parameters?.resourceName ?? ""] ?? node.label
  }));
  const materialize = (nodes: readonly DiagramNode[]) => {
    const architecture = convertDiagramJsonToArchitectureJson({ ...diagram, nodes: [...nodes] });
    return {
      edges: architecture.edges,
      nodes: convertArchitectureJsonToDiagramJson(architecture).nodes
    };
  };
  const friendlyInput = materialize(diagram.nodes);
  const legacyInput = materialize(legacyNodes);
  const projectGeometry = (layoutNodes: readonly DiagramNode[]) =>
    layoutNodes.map(({ id, position, size }) => ({ id, position, size }));

  assert.deepEqual(
    projectGeometry(layoutAutomaticDiagram(friendlyInput).nodes),
    projectGeometry(layoutAutomaticDiagram(legacyInput).nodes)
  );
});

test("layoutAutomaticDiagram preserves protected manual layout while placing new nodes", () => {
  const manualNode: DiagramNode = {
    ...makeNode("manual-entry", "aws_lb", 100, 200, "resource", {
      size: { width: 222, height: 111 }
    }),
    locked: true
  };
  const nodes = [manualNode, makeNode("new-compute", "aws_ecs_service", 100, 200)];
  const result = layoutAutomaticDiagram({
    edges: [
      {
        id: "manual-entry-new-compute",
        sourceId: "manual-entry",
        targetId: "new-compute",
        label: "routes requests"
      }
    ],
    nodes,
    protectedNodeIds: new Set([manualNode.id])
  });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));

  assert.deepEqual(nodeById.get(manualNode.id), manualNode);
  assert.equal(overlaps(nodeById.get(manualNode.id)!, nodeById.get("new-compute")!), false);
});

test("layoutAutomaticDiagram keeps a protected Area position and grows it for additions", () => {
  const protectedArea = makeNode("manual-vpc", "aws_vpc", 500, 300, "resource", {
    size: { width: 260, height: 196 }
  });
  const protectedChild = makeNode("existing-service", "aws_ecs_service", 536, 336, "resource", {
    parentAreaNodeId: protectedArea.id
  });
  const nodes = [
    protectedArea,
    protectedChild,
    makeNode("new-service", "aws_ecs_service", 0, 0, "resource", {
      parentAreaNodeId: protectedArea.id
    })
  ];
  const result = layoutAutomaticDiagram({
    edges: [],
    nodes,
    protectedNodeIds: new Set([protectedArea.id, protectedChild.id])
  });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
  const nextArea = nodeById.get(protectedArea.id)!;

  assert.deepEqual(nextArea.position, protectedArea.position);
  assert.ok(nextArea.size.width >= protectedArea.size.width);
  assert.ok(nextArea.size.height >= protectedArea.size.height);
  assert.deepEqual(nodeById.get(protectedChild.id), protectedChild);
  assertContains(nextArea, nodeById.get("new-service")!);
  assert.equal(result.quality.parentBoundaryViolationCount, 0);
});

test("Reverse Engineering 표시 프레임은 고정하고 각 프레임 안에서만 Resource를 정리한다", () => {
  const frameA = reverseInfrastructureFrame("frame-a", 0, 0, ["a-api", "a-db"]);
  const frameB = reverseInfrastructureFrame("frame-b", 620, 0, ["b-api", "b-db"]);
  const nodes = [
    frameA,
    frameB,
    makeNode("a-api", "aws_ecs_service", 80, 100, "resource", {
      size: { width: 120, height: 72 }
    }),
    makeNode("a-db", "aws_db_instance", 80, 100, "resource", {
      size: { width: 120, height: 72 }
    }),
    makeNode("b-api", "aws_ecs_service", 700, 100, "resource", {
      size: { width: 120, height: 72 }
    }),
    makeNode("b-db", "aws_db_instance", 700, 100, "resource", {
      size: { width: 120, height: 72 }
    })
  ];

  const result = layoutAutomaticDiagram({
    edges: [
      { id: "a-api-db", sourceId: "a-api", targetId: "a-db" },
      { id: "b-api-db", sourceId: "b-api", targetId: "b-db" }
    ],
    nodes
  });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));

  assert.deepEqual(nodeById.get(frameA.id), frameA);
  assert.deepEqual(nodeById.get(frameB.id), frameB);
  assertContains(frameA, nodeById.get("a-api")!);
  assertContains(frameA, nodeById.get("a-db")!);
  assertContains(frameB, nodeById.get("b-api")!);
  assertContains(frameB, nodeById.get("b-db")!);
  assert.equal(overlaps(nodeById.get("a-api")!, nodeById.get("a-db")!), false);
  assert.equal(overlaps(nodeById.get("b-api")!, nodeById.get("b-db")!), false);
  assert.equal(
    nodeById.get("a-api")!.position.x < frameA.position.x + frameA.size.width,
    true
  );
  assert.equal(
    nodeById.get("b-api")!.position.x >= frameB.position.x,
    true
  );
  assert.equal(nodeById.get("a-api")?.metadata?.parentAreaNodeId, undefined);
  assert.equal(nodeById.get("b-api")?.metadata?.parentAreaNodeId, undefined);
});

test("evaluateAutomaticDiagramLayout penalizes portrait canvases", () => {
  const vertical = evaluateAutomaticDiagramLayout({
    edges: [],
    nodes: [makeNode("top", "generic_compute", 0, 0), makeNode("bottom", "generic_data", 0, 1000)]
  });
  const horizontal = evaluateAutomaticDiagramLayout({
    edges: [],
    nodes: [makeNode("left", "generic_compute", 0, 0), makeNode("right", "generic_data", 1000, 0)]
  });

  assert.ok(vertical.canvasAspectRatioPenalty > 0);
  assert.equal(horizontal.canvasAspectRatioPenalty, 0);
  assert.ok(vertical.score > horizontal.score);
});

test("layoutAutomaticDiagram keeps provider-neutral roles on the main flow", () => {
  const nodes = [
    makeNode("customer", "actor_browser", 0, 0, "design"),
    makeNode("gateway", "google_api_gateway_api", 0, 0),
    makeNode("runtime", "google_cloud_run_service", 0, 0),
    makeNode("database", "google_sql_database_instance", 0, 0)
  ];
  const edges = [
    { id: "customer-gateway", sourceId: "customer", targetId: "gateway", label: "HTTPS" },
    { id: "gateway-runtime", sourceId: "gateway", targetId: "runtime", label: "routes requests" },
    { id: "runtime-database", sourceId: "runtime", targetId: "database", label: "reads/writes" }
  ];
  const result = layoutAutomaticDiagram({ edges, nodes });
  const nodeById = new Map(result.nodes.map((node) => [node.id, node]));

  assert.ok(nodeById.get("customer")!.position.x < nodeById.get("gateway")!.position.x);
  assert.ok(nodeById.get("gateway")!.position.x < nodeById.get("runtime")!.position.x);
  assert.ok(nodeById.get("runtime")!.position.x < nodeById.get("database")!.position.x);
});

test("evaluateAutomaticDiagramLayout routes around Area title bands", () => {
  const nodes = [
    makeNode("source", "generic_entry", 0, 0),
    makeNode("area", "aws_vpc", 200, 40, "resource", { size: { width: 200, height: 200 } }),
    makeNode("target", "generic_compute", 500, 0)
  ];
  const quality = evaluateAutomaticDiagramLayout({
    edges: [{ id: "source-target", sourceId: "source", targetId: "target", label: "routes" }],
    nodes
  });

  assert.equal(quality.edgeAreaTitleIntersectionCount, 0);
});

test("layoutAutomaticDiagram improves a failure-like multi-AZ VPC without changing resource semantics", () => {
  const nodes = createFailureLikeNodes();
  const edges = createFailureLikeEdges();
  const before = evaluateAutomaticDiagramLayout({ edges, nodes });
  const originalEdges = structuredClone(edges);
  const result = layoutAutomaticDiagram({ edges, nodes });
  const after = result.quality;

  assert.equal(after.nodeOverlapCount, 0);
  assert.equal(after.siblingAreaOverlapCount, 0);
  assert.equal(after.parentBoundaryViolationCount, 0);
  assert.equal(after.supportLaneIntrusionCount, 0);
  assert.ok(after.canvasArea < before.canvasArea * 0.7, `${after.canvasArea} should be less than ${before.canvasArea}`);
  assert.ok(after.backwardEdgeCount < before.backwardEdgeCount);
  assert.ok(
    after.edgeCrossingCount < before.edgeCrossingCount,
    `crossings ${before.edgeCrossingCount} -> ${after.edgeCrossingCount}`
  );
  assert.equal(after.edgeNodeIntersectionCount, 0);
  assert.ok(after.edgeNodeIntersectionCount <= before.edgeNodeIntersectionCount);
  assert.equal(after.repeatAlignmentError, 0);

  assert.deepEqual(result.nodes.map(withoutLayout), nodes.map(withoutLayout));
  assert.deepEqual(edges, originalEdges);
});

function withoutLayout(node: DiagramNode): Omit<DiagramNode, "position" | "size"> {
  const { position: _position, size: _size, ...semanticNode } = node;

  return semanticNode;
}

function makeNode(
  id: string,
  type: string,
  x: number,
  y: number,
  kind: DiagramNode["kind"] = "resource",
  options: {
    readonly parentAreaNodeId?: string;
    readonly size?: DiagramNode["size"];
  } = {}
): DiagramNode {
  return {
    id,
    kind,
    label: id,
    locked: false,
    position: { x, y },
    size: options.size ?? { width: 160, height: 96 },
    type,
    zIndex: 1,
    ...(options.parentAreaNodeId ? { metadata: { parentAreaNodeId: options.parentAreaNodeId } } : {}),
    ...(kind === "resource"
      ? {
          parameters: {
            fileName: "main",
            resourceName: id,
            resourceType: type,
            terraformBlockType: "resource" as const,
            values: {}
          }
        }
      : {})
  };
}

/** gg: 실제 parent가 아닌 Reverse Engineering 표시 프레임 fixture를 만듭니다. */
function reverseInfrastructureFrame(
  suffix: string,
  x: number,
  y: number,
  memberNodeIds: string[]
): DiagramNode {
  return {
    id: `reverse-infra-frame:project:${suffix}`,
    type: "design_group",
    kind: "design",
    position: { x, y },
    size: { width: 480, height: 300 },
    label: `프로젝트 · ${suffix}`,
    locked: false,
    zIndex: 0,
    metadata: {
      presentationCatalogItemId: "design-group",
      reverseEngineeringInfrastructureFrame: {
        source: "aws_scan",
        groupBy: "project",
        groupKey: suffix,
        memberNodeIds
      }
    }
  };
}

function assertContains(parent: DiagramNode, child: DiagramNode): void {
  assert.ok(child.position.x >= parent.position.x);
  assert.ok(child.position.y >= parent.position.y);
  assert.ok(child.position.x + child.size.width <= parent.position.x + parent.size.width);
  assert.ok(child.position.y + child.size.height <= parent.position.y + parent.size.height);
}

function overlaps(left: DiagramNode, right: DiagramNode): boolean {
  return (
    left.position.x < right.position.x + right.size.width &&
    left.position.x + left.size.width > right.position.x &&
    left.position.y < right.position.y + right.size.height &&
    left.position.y + left.size.height > right.position.y
  );
}

function getBounds(nodes: readonly DiagramNode[]): { readonly width: number; readonly height: number } {
  const left = Math.min(...nodes.map((node) => node.position.x));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const right = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const bottom = Math.max(...nodes.map((node) => node.position.y + node.size.height));

  return {
    height: bottom - top,
    width: right - left
  };
}

function createFailureLikeNodes(): DiagramNode[] {
  return [
    makeNode("browser", "actor_browser", 2200, 100, "design"),
    makeNode("region", "aws_region", 0, 0, "resource", { size: { width: 2600, height: 1900 } }),
    makeNode("vpc", "aws_vpc", 120, 420, "resource", {
      parentAreaNodeId: "region",
      size: { width: 2200, height: 1380 }
    }),
    makeNode("az-a", "aws_availability_zone", 180, 500, "resource", {
      parentAreaNodeId: "vpc",
      size: { width: 1100, height: 760 }
    }),
    makeNode("az-b", "aws_availability_zone", 240, 560, "resource", {
      parentAreaNodeId: "vpc",
      size: { width: 1100, height: 760 }
    }),
    makeNode("public-a", "aws_subnet", 260, 620, "resource", {
      parentAreaNodeId: "az-a",
      size: { width: 520, height: 300 }
    }),
    makeNode("private-a", "aws_subnet", 330, 690, "resource", {
      parentAreaNodeId: "az-a",
      size: { width: 520, height: 300 }
    }),
    makeNode("database-a", "aws_subnet", 400, 760, "resource", {
      parentAreaNodeId: "az-a",
      size: { width: 520, height: 300 }
    }),
    makeNode("public-b", "aws_subnet", 300, 660, "resource", {
      parentAreaNodeId: "az-b",
      size: { width: 520, height: 300 }
    }),
    makeNode("private-b", "aws_subnet", 370, 730, "resource", {
      parentAreaNodeId: "az-b",
      size: { width: 520, height: 300 }
    }),
    makeNode("database-b", "aws_subnet", 440, 800, "resource", {
      parentAreaNodeId: "az-b",
      size: { width: 520, height: 300 }
    }),
    makeNode("cloudfront", "aws_cloudfront_distribution", 2100, 80, "resource", { parentAreaNodeId: "region" }),
    makeNode("load-balancer", "aws_lb", 1880, 1320, "resource", { parentAreaNodeId: "vpc" }),
    makeNode("service-a", "aws_ecs_service", 1900, 1440, "resource", { parentAreaNodeId: "private-a" }),
    makeNode("service-b", "aws_ecs_service", 120, 1520, "resource", { parentAreaNodeId: "private-b" }),
    makeNode("db-a", "aws_db_instance", 1740, 520, "resource", { parentAreaNodeId: "database-a" }),
    makeNode("db-b", "aws_db_instance", 120, 1040, "resource", { parentAreaNodeId: "database-b" }),
    makeNode("pipeline", "aws_codepipeline", 2360, 1660, "resource", { parentAreaNodeId: "region" }),
    makeNode("registry", "aws_ecr_repository", 1940, 1700, "resource", { parentAreaNodeId: "region" }),
    makeNode("runtime-role", "aws_iam_role", 2280, 1540, "resource", { parentAreaNodeId: "region" }),
    makeNode("logs", "aws_cloudwatch_log_group", 80, 1600, "resource", { parentAreaNodeId: "region" }),
    makeNode("alarm", "aws_cloudwatch_metric_alarm", 1740, 520, "resource", { parentAreaNodeId: "region" })
  ];
}

function createFailureLikeEdges() {
  return [
    { id: "browser-cloudfront", sourceId: "browser", targetId: "cloudfront", label: "HTTPS" },
    { id: "cloudfront-alb", sourceId: "cloudfront", targetId: "load-balancer", label: "API traffic" },
    { id: "alb-service-a", sourceId: "load-balancer", targetId: "service-a", label: "routes requests" },
    { id: "alb-service-b", sourceId: "load-balancer", targetId: "service-b", label: "routes requests" },
    { id: "service-a-db-a", sourceId: "service-a", targetId: "db-a", label: "reads/writes" },
    { id: "service-b-db-b", sourceId: "service-b", targetId: "db-b", label: "reads/writes" },
    { id: "pipeline-registry", sourceId: "pipeline", targetId: "registry", label: "publishes image" },
    { id: "registry-service-a", sourceId: "registry", targetId: "service-a", label: "deploys image" },
    { id: "registry-service-b", sourceId: "registry", targetId: "service-b", label: "deploys image" },
    { id: "role-service-a", sourceId: "runtime-role", targetId: "service-a", label: "grants runtime access" },
    { id: "service-a-logs", sourceId: "service-a", targetId: "logs", label: "writes logs" },
    { id: "service-b-logs", sourceId: "service-b", targetId: "logs", label: "writes logs" },
    { id: "alarm-service-a", sourceId: "alarm", targetId: "service-a", label: "monitors CPU" }
  ];
}
