import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { DiagramEdge, DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { resourceCatalog } from "../../features/resource-settings/catalog";
import { listBoardTemplates, listLegacyBoardTemplates } from "../../features/resource-settings/template-library";
import { createTemplatePreviewModel } from "./template-preview-model";

test("createTemplatePreviewModel bounds dense diagrams, omits collapsed helpers, and retains catalog icons", () => {
  const vpc = createResourceNode({
    id: "vpc",
    position: { x: 0, y: 0 },
    resourceType: "aws_vpc",
    size: { width: 900, height: 520 }
  });
  const resources = Array.from({ length: 9 }, (_, index) =>
    createResourceNode({
      id: `resource-${index}`,
      position: { x: 80 + index * 84, y: 160 + (index % 3) * 84 }
    })
  );
  const routeAssociation = createResourceNode({
    id: "route-association",
    position: { x: 760, y: 420 },
    resourceType: "aws_route_table_association"
  });
  const diagram = createDiagram(
    [vpc, ...resources, routeAssociation],
    [
      makeEdge("hub-peer-4", "resource-3", "resource-4"),
      makeEdge("hub-peer-5", "resource-3", "resource-5"),
      makeEdge("hub-peer-6", "resource-3", "resource-6"),
      makeEdge("hub-peer-7", "resource-3", "resource-7"),
      makeEdge("collapsed-helper-edge", "route-association", "resource-3")
    ]
  );

  const model = createTemplatePreviewModel(diagram);
  const selectedIds = new Set(model.nodes.map((node) => node.id));

  assert.equal(model.nodes.length, 8);
  assert.ok(selectedIds.has("vpc"));
  assert.ok(selectedIds.has("resource-3"));
  assert.ok(selectedIds.has("resource-0"));
  assert.ok(selectedIds.has("resource-1"));
  assert.ok(!selectedIds.has("resource-2"));
  assert.ok(!selectedIds.has("resource-8"));
  assert.ok(!selectedIds.has("route-association"));
  assert.equal(model.omittedNodeCount, diagram.nodes.length - model.nodes.length);

  for (const node of model.nodes) {
    const sourceNode = diagram.nodes.find((candidate) => candidate.id === node.id);

    assert.equal(node.iconUrl, sourceNode?.iconUrl, `${node.id} must retain its catalog icon URL`);
  }
});

test("createTemplatePreviewModel removes edges with omitted endpoints", () => {
  const connectedNodes = Array.from({ length: 8 }, (_, index) =>
    createResourceNode({ id: `connected-${index}`, position: { x: index * 72, y: 40 } })
  );
  const omittedNode = createResourceNode({ id: "omitted", position: { x: 680, y: 260 } });
  const denseEdges = connectedNodes.flatMap((source, sourceIndex) =>
    connectedNodes.slice(sourceIndex + 1).map((target) => makeEdge(
      `${source.id}-${target.id}`,
      source.id,
      target.id
    ))
  );
  const diagram = createDiagram([
    ...connectedNodes,
    omittedNode
  ], [
    ...denseEdges,
    makeEdge("connected-to-omitted", connectedNodes[0]!.id, omittedNode.id)
  ]);

  const model = createTemplatePreviewModel(diagram);
  const selectedIds = new Set(model.nodes.map((node) => node.id));

  assert.equal(model.nodes.length, 8);
  assert.ok(!selectedIds.has(omittedNode.id));
  assert.ok(!model.edges.some((edge) => edge.id === "connected-to-omitted"));
  assert.ok(model.edges.every(
    (edge) => selectedIds.has(edge.sourceNodeId) && selectedIds.has(edge.targetNodeId)
  ));
});

test("createTemplatePreviewModel returns icon-bearing S3 and CloudFront nodes with their edge", () => {
  const s3 = createResourceNode({
    id: "s3",
    position: { x: 80, y: 120 },
    resourceType: "aws_s3_bucket"
  });
  const cloudFront = createResourceNode({
    id: "cloudfront",
    position: { x: 360, y: 120 },
    resourceType: "aws_cloudfront_distribution"
  });

  const model = createTemplatePreviewModel(createDiagram(
    [s3, cloudFront],
    [makeEdge("s3-cloudfront", s3.id, cloudFront.id)]
  ));

  assert.deepEqual(
    model.nodes.map((node) => ({ iconUrl: node.iconUrl, id: node.id, isArea: node.isArea })),
    [
      { iconUrl: catalogIconUrl("aws_s3_bucket"), id: "s3", isArea: false },
      { iconUrl: catalogIconUrl("aws_cloudfront_distribution"), id: "cloudfront", isArea: false }
    ]
  );
  assert.deepEqual(model.edges, [{
    id: "s3-cloudfront",
    sourceNodeId: "s3",
    targetNodeId: "cloudfront"
  }]);
  assert.equal(model.omittedNodeCount, 0);
});

test("createTemplatePreviewModel projects a large VPC as an in-bounds non-zero area frame", () => {
  const vpc = createResourceNode({
    id: "vpc",
    position: { x: 120, y: 80 },
    resourceType: "aws_vpc",
    size: { width: 760, height: 440 }
  });
  const instance = createResourceNode({
    id: "instance",
    position: { x: 360, y: 260 },
    resourceType: "aws_instance"
  });

  const model = createTemplatePreviewModel(createDiagram([vpc, instance]));
  const area = model.nodes.find((node) => node.id === vpc.id);

  assert.ok(area);
  assert.equal(area.isArea, true);
  assert.ok(area.width > 0);
  assert.ok(area.height > 0);
  assert.ok(area.x >= 0);
  assert.ok(area.y >= 0);
  assert.ok(area.x + area.width <= 100);
  assert.ok(area.y + area.height <= 60);
  assert.equal("label" in area, false);
});

test("createTemplatePreviewModel keeps compact Template resources inside their projected area frames", () => {
  const template = listLegacyBoardTemplates().find((candidate) => candidate.id === "template-api-db");
  assert.ok(template);

  const model = createTemplatePreviewModel(template.diagramJson);
  const vpc = requirePreviewNode(model, "template-api-vpc");
  const subnet = requirePreviewNode(model, "template-api-subnet");
  const ec2 = requirePreviewNode(model, "template-api-ec2");
  const rds = requirePreviewNode(model, "template-api-rds");

  assertProjectedContainment(vpc, subnet);
  assertProjectedContainment(subnet, ec2);
  assertProjectedContainment(subnet, rds);
});

test("Live Observation preview prioritizes the traffic flow over empty network frames", () => {
  const template = listLegacyBoardTemplates().find(
    (candidate) => candidate.id === "template-live-observation"
  );
  assert.ok(template);

  const model = createTemplatePreviewModel(template.diagramJson);
  const selectedIds = new Set(model.nodes.map((node) => node.id));

  assert.ok(selectedIds.has("template-live-vpc"));
  assert.ok(selectedIds.has("template-live-asg"));
  assert.ok(selectedIds.has("template-live-site-config"));
  assert.ok(selectedIds.has("template-live-alb"));
  assert.ok(!selectedIds.has("template-live-subnet-a"));
  assert.ok(!selectedIds.has("template-live-alb-sg"));

  const vpc = requirePreviewNode(model, "template-live-vpc");
  const igw = requirePreviewNode(model, "template-live-igw");
  const alb = requirePreviewNode(model, "template-live-alb");
  const targetGroup = requirePreviewNode(model, "template-live-target-group");
  const asg = requirePreviewNode(model, "template-live-asg");
  const policy = requirePreviewNode(model, "template-live-policy");
  const alarm = requirePreviewNode(model, "template-live-alarm");

  assertProjectedContainment(vpc, igw);
  assertProjectedContainment(vpc, alb);
  assertProjectedContainment(vpc, targetGroup);
  assertProjectedContainment(vpc, asg);
  assert.equal(alb.y, targetGroup.y);
  assert.ok(policy.y < alarm.y);
});

test("dense deployable templates retain their primary runtime flow in the preview", () => {
  const templates = listBoardTemplates();
  const expectations = [
    {
      id: "three-tier-web-app",
      nodeIds: ["load-balancer", "application-group", "database"],
      edgeIds: ["alb-asg", "app-db"]
    },
    {
      id: "ecs-fargate-container-app",
      nodeIds: ["cluster", "service", "task"],
      edgeIds: ["cluster-service", "service-task"]
    },
    {
      id: "eks-container-app",
      nodeIds: ["cluster", "node-group", "deployment", "service"],
      edgeIds: ["cluster-node-group", "deployment-service"]
    }
  ] as const;

  for (const expectation of expectations) {
    const template = templates.find((candidate) => candidate.id === expectation.id);
    assert.ok(template, `Missing ${expectation.id} template`);

    const model = createTemplatePreviewModel(template.diagramJson);
    const selectedIds = new Set(model.nodes.map((node) => node.id));
    const edgeIds = new Set(model.edges.map((edge) => edge.id));

    for (const nodeId of expectation.nodeIds) {
      assert.ok(selectedIds.has(`template-${expectation.id}-${nodeId}`), `${expectation.id}: ${nodeId}`);
    }
    for (const edgeId of expectation.edgeIds) {
      assert.ok(edgeIds.has(`template-${expectation.id}-${edgeId}`), `${expectation.id}: ${edgeId}`);
    }
  }
});

test("TemplateDiagramPreview keeps the SVG icon path label-free and bounded", () => {
  const source = readFileSync(new URL("./TemplateGallery.tsx", import.meta.url), "utf8");
  const previewSource = source.slice(source.indexOf("function TemplateDiagramPreview"));
  const edgeRenderIndex = previewSource.indexOf("model.edges.map");
  const areaRenderIndex = previewSource.indexOf("model.nodes.filter((node) => node.isArea)");
  const resourceRenderIndex = previewSource.indexOf("model.nodes.filter((node) => !node.isArea)");

  assert.match(
    previewSource,
    /const model = createTemplatePreviewModel\(template\.diagramJson\);/
  );
  assert.ok(edgeRenderIndex >= 0);
  assert.ok(areaRenderIndex > edgeRenderIndex);
  assert.ok(resourceRenderIndex > areaRenderIndex);
  assert.match(previewSource, /<image[\s\S]*href=\{node\.iconUrl\}/);
  assert.doesNotMatch(previewSource, /\{node\.label\}/);
  assert.doesNotMatch(previewSource, /title=\{node\.label\}/);
  assert.match(previewSource, /model\.omittedNodeCount > 0/);
  assert.match(previewSource, /aria-label=\{`\$\{model\.omittedNodeCount\}개 노드 생략됨`\}/);
  assert.match(previewSource, />\s*\+\{model\.omittedNodeCount\}\s*<\/span>/);
});

function createDiagram(nodes: DiagramNode[], edges: DiagramEdge[] = []): DiagramJson {
  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createResourceNode({
  id,
  position,
  resourceType = "aws_s3_bucket",
  size = { width: 48, height: 48 }
}: {
  readonly id: string;
  readonly position: DiagramNode["position"];
  readonly resourceType?: string;
  readonly size?: DiagramNode["size"];
}): DiagramNode {
  return {
    iconUrl: catalogIconUrl(resourceType),
    id,
    kind: "resource",
    label: id,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: id.replaceAll("-", "_"),
      resourceType,
      terraformBlockType: "resource",
      values: {}
    },
    position,
    size,
    type: resourceType,
    zIndex: 1
  };
}

function makeEdge(id: string, sourceNodeId: string, targetNodeId: string): DiagramEdge {
  return { id, sourceNodeId, targetNodeId, type: "smoothstep" };
}

function catalogIconUrl(resourceType: string): string {
  const item = resourceCatalog.find((candidate) => candidate.nodeDefaults.type === resourceType);

  assert.ok(item, `Missing catalog resource item: ${resourceType}`);
  return item.iconUrl;
}

function requirePreviewNode(
  model: ReturnType<typeof createTemplatePreviewModel>,
  id: string
) {
  const node = model.nodes.find((candidate) => candidate.id === id);
  assert.ok(node, `Expected ${id} in the Template preview`);
  return node;
}

function assertProjectedContainment(
  parent: ReturnType<typeof requirePreviewNode>,
  child: ReturnType<typeof requirePreviewNode>
): void {
  assert.ok(child.x >= parent.x, `${child.id} must remain inside ${parent.id} on x`);
  assert.ok(child.y >= parent.y, `${child.id} must remain inside ${parent.id} on y`);
  assert.ok(child.x + child.width <= parent.x + parent.width, `${child.id} must remain inside ${parent.id} width`);
  assert.ok(child.y + child.height <= parent.y + parent.height, `${child.id} must remain inside ${parent.id} height`);
}
