import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { buildTemplateDiagramJson, templateDefinitions } from "../../../../packages/types/src/template-definitions";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { isRenderableDiagramNode } from "../diagram-editor/diagram-node-visibility";
import { resourceCatalog } from "./catalog";
import {
  hydrateCatalogResourceNodes,
  materializeTemplateDiagram
} from "./template-resource-materializer";
import { buildBoardTemplateDiagram, listBoardTemplates } from "./template-library";

test("materializeTemplateDiagram gives an S3 template node the catalog icon and resource kind", () => {
  const diagram = materializeTemplateDiagram(createDiagram([createTemplateNode("aws_s3_bucket")]));
  const s3 = diagram.nodes[0];
  const catalogItem = requireCatalogItem("aws_s3_bucket");

  assert.equal(s3?.iconUrl, catalogItem.iconUrl);
  assert.equal(s3?.kind, "resource");
});

test("materializeTemplateDiagram gives a CloudFront template node the catalog icon", () => {
  const diagram = materializeTemplateDiagram(
    createDiagram([createTemplateNode("aws_cloudfront_distribution")])
  );
  const cloudFront = diagram.nodes[0];
  const catalogItem = requireCatalogItem("aws_cloudfront_distribution");

  assert.equal(cloudFront?.iconUrl, catalogItem.iconUrl);
});

test("materializeTemplateDiagram retains explicit template identity, Terraform values, and oversized VPC area", () => {
  const sourceNode: DiagramNode = {
    id: "template-production-vpc",
    kind: "design",
    label: "Production VPC",
    locked: true,
    metadata: { parentAreaNodeId: "environment-area" },
    parameters: {
      fileName: "network",
      resourceName: "production",
      resourceType: "aws_vpc",
      terraformBlockType: "resource",
      values: {
        cidrBlock: "10.42.0.0/16",
        enableDnsSupport: false
      }
    },
    position: { x: 120, y: 80 },
    size: { width: 720, height: 420 },
    style: { borderColor: "#8a2be2", borderStyle: "dashed" },
    type: "aws_vpc",
    zIndex: 6
  };

  const diagram = materializeTemplateDiagram(createDiagram([sourceNode]));
  const vpc = diagram.nodes[0];

  assert.deepEqual(vpc, {
    ...sourceNode,
    iconUrl: requireCatalogItem("aws_vpc").iconUrl,
    kind: "resource",
    position: { x: 120, y: 120 },
    zIndex: 2,
    parameters: {
      ...sourceNode.parameters,
      values: {
        cidrBlock: "10.42.0.0/16",
        enableDnsSupport: false,
        instanceTenancy: "default"
      }
    }
  });
});

test("materializeTemplateDiagram reports the missing Terraform identity for an unknown resource", () => {
  assert.throws(
    () =>
      materializeTemplateDiagram(
        createDiagram([
          createTemplateNode("aws_not_available", {
            fileName: "main",
            resourceName: "not_available",
            resourceType: "aws_not_available",
            terraformBlockType: "resource",
            values: {}
          })
        ])
      ),
    /resource\/aws_not_available/
  );
});

test("hydrateCatalogResourceNodes retains unknown legacy nodes and adds a catalog icon to known nodes", () => {
  const unknownLegacyNode = createTemplateNode("aws_legacy_unknown");
  const iconlessKnownNode = createTemplateNode("aws_s3_bucket");

  const diagram = hydrateCatalogResourceNodes(createDiagram([unknownLegacyNode, iconlessKnownNode]));

  assert.equal(diagram.nodes[0], unknownLegacyNode);
  assert.deepEqual(diagram.nodes[0], unknownLegacyNode);
  assert.equal(diagram.nodes[1]?.iconUrl, requireCatalogItem("aws_s3_bucket").iconUrl);
});

test("template-library entry points return strict catalog-materialized diagrams", () => {
  const staticBoardTemplate = listBoardTemplates().find(
    (template) => template.id === "static-web-hosting"
  );
  const repositoryTemplate = buildBoardTemplateDiagram("static-web-hosting", {
    projectSlug: "materializer-qa",
    shortId: "workspace"
  });

  assert.equal(
    staticBoardTemplate?.diagramJson.nodes.find((node) => node.type === "aws_s3_bucket")?.iconUrl,
    requireCatalogItem("aws_s3_bucket").iconUrl
  );
  assert.equal(
    repositoryTemplate?.nodes.find((node) => node.type === "aws_cloudfront_distribution")?.iconUrl,
    requireCatalogItem("aws_cloudfront_distribution").iconUrl
  );
});

test("deployable Template materialization preserves reviewed geometry while draft hydration preserves coordinates", () => {
  for (const template of listBoardTemplates()) {
    assertCompactContainedAreas(template.diagramJson);

    const definition = templateDefinitions.find((candidate) => candidate.id === template.id);
    assert.ok(definition, `Missing definition for ${template.id}`);
    const authored = buildTemplateDiagramJson(definition.id, {
      projectSlug: "sketchcatch",
      shortId: definition.id
    });

    for (const sourceNode of authored.nodes) {
      const materialized = template.diagramJson.nodes.find((node) => node.id === sourceNode.id);

      assert.deepEqual(materialized?.position, sourceNode.position, `${template.id}/${sourceNode.id}`);
    }
  }

  const savedDraft = createDiagram([createTemplateNode("aws_s3_bucket")]);
  const hydratedDraft = hydrateCatalogResourceNodes(savedDraft);

  assert.deepEqual(hydratedDraft.nodes[0]?.position, savedDraft.nodes[0]?.position);
});

test("reviewed API, ECS, and Namespace resources become real visual containers", () => {
  const templates = listBoardTemplates();
  const requiredContainers = [
    ["minimal-serverless-api", "aws_api_gateway_rest_api"],
    ["full-serverless-web-app", "aws_api_gateway_rest_api"],
    ["ecs-fargate-container-app", "aws_ecs_cluster"],
    ["eks-container-app", "kubernetes_namespace"]
  ] as const;

  for (const [templateId, resourceType] of requiredContainers) {
    const node = templates
      .find((template) => template.id === templateId)
      ?.diagramJson.nodes.find((candidate) => candidate.parameters?.resourceType === resourceType);

    assert.ok(node, `${templateId}/${resourceType}`);
    assert.equal(isAreaNode(node), true, `${templateId}/${resourceType}`);
  }
});

test("ASG and EKS control plane materialize as ordinary 48px Resource tiles", () => {
  const templates = listBoardTemplates();
  const expectedTiles = [
    ["three-tier-web-app", "aws_autoscaling_group"],
    ["eks-container-app", "aws_eks_cluster"]
  ] as const;

  for (const [templateId, resourceType] of expectedTiles) {
    const node = templates
      .find((template) => template.id === templateId)
      ?.diagramJson.nodes.find((candidate) => candidate.parameters?.resourceType === resourceType);

    assert.ok(node, `${templateId}/${resourceType}`);
    assert.equal(isAreaNode(node), false, `${templateId}/${resourceType}`);
    assert.deepEqual(node.size, { width: 48, height: 48 }, `${templateId}/${resourceType}`);
  }
});

test("Template presentation nodes materialize exact Catalog items without Terraform parameters", () => {
  // Design nodes reuse the real panel payload even when Region and AZ normally create resource parameters on drag.
  for (const template of listBoardTemplates()) {
    const definition = templateDefinitions.find((candidate) => candidate.id === template.id);

    assert.ok(definition, `Missing definition for ${template.id}`);
    for (const presentationNode of definition.presentationNodes) {
      const diagramNode = template.diagramJson.nodes.find(
        (candidate) => candidate.id === `template-${template.id}-presentation-${presentationNode.id}`
      );
      const catalogItem = requireCatalogItemById(presentationNode.catalogItemId);

      assert.ok(diagramNode, `${template.id}/${presentationNode.id}`);
      assert.equal(diagramNode.type, catalogItem.nodeDefaults.type);
      assert.equal(diagramNode.iconUrl, catalogItem.iconUrl);
      assert.equal(diagramNode.kind, "design");
      assert.equal(diagramNode.parameters, undefined);
    }
  }
});

function createDiagram(nodes: DiagramNode[]): DiagramJson {
  return {
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createTemplateNode(
  type: string,
  parameters?: DiagramNode["parameters"]
): DiagramNode {
  return {
    id: `template-${type}`,
    kind: "resource",
    label: type,
    locked: false,
    parameters,
    position: { x: 16, y: 24 },
    size: { width: 112, height: 112 },
    type,
    zIndex: 1
  };
}

function requireCatalogItem(resourceType: string) {
  const catalogItem = resourceCatalog.find(
    (candidate) => candidate.nodeDefaults.type === resourceType
  );

  assert.ok(catalogItem, `Missing resource catalog item: ${resourceType}`);
  return catalogItem;
}

// Presentation materialization is keyed by stable Catalog id because Region and AZ are not Terraform resources.
function requireCatalogItemById(catalogItemId: string) {
  const catalogItem = resourceCatalog.find((candidate) => candidate.id === catalogItemId);

  assert.ok(catalogItem, `Missing resource catalog item: ${catalogItemId}`);
  return catalogItem;
}

function assertCompactContainedAreas(diagram: DiagramJson): void {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));

  for (const node of diagram.nodes) {
    if (!isRenderableDiagramNode(node)) {
      continue;
    }

    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId) {
      continue;
    }

    const parent = nodeById.get(parentAreaNodeId);
    assert.ok(parent, `${node.id} must have a real parent area`);
    assert.ok(node.position.x >= parent.position.x, `${node.id} must remain inside ${parent.id} on x`);
    assert.ok(node.position.y >= parent.position.y, `${node.id} must remain inside ${parent.id} on y`);
    assert.ok(
      node.position.x + node.size.width <= parent.position.x + parent.size.width,
      `${node.id} must remain inside ${parent.id} width`
    );
    assert.ok(
      node.position.y + node.size.height <= parent.position.y + parent.size.height,
      `${node.id} must remain inside ${parent.id} height`
    );
  }
}
