import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  getTemplateDefinitionById,
  REPOSITORY_TEMPLATE_IDS,
  type RepositoryTemplateId
} from "./template-definitions.js";

type PresentationNodeExpectation = {
  readonly catalogItemId: string;
  readonly parentNodeId?: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size?: { readonly width: number; readonly height: number };
};

type PresentationEdgeExpectation = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly sourceHandleId: string;
  readonly targetHandleId: string;
};

const EXPECTED_PRESENTATION_NODES = {
  "static-web-hosting": {
    user: node("design-user-client", 120, 400),
    region: node("aws-region", 480, 240, undefined, { width: 480, height: 480 })
  },
  "minimal-serverless-api": {
    user: node("design-user-client", 80, 520),
    region: node("aws-region", 200, 80, undefined, { width: 1160, height: 880 }),
    "global-iam-group": node("design-group", 1400, 280, undefined, { width: 400, height: 400 })
  },
  "full-serverless-web-app": {
    "source-repository": node("design-source-repository", 160, 440, "source-user-group"),
    user: node("design-user-client", 160, 640, "source-user-group"),
    region: node("aws-region", 360, 80, undefined, { width: 1320, height: 960 }),
    "source-user-group": node("design-group", 80, 320, undefined, { width: 240, height: 480 }),
    "frontend-group": node("design-group", 440, 400, "region", { width: 240, height: 320 }),
    "identity-group": node("design-group", 680, 240, "region", { width: 240, height: 560 }),
    "api-group": node("design-group", 920, 160, "region", { width: 520, height: 720 }),
    "compute-group": node("design-group", 1440, 240, "region", { width: 200, height: 400 }),
    "data-ops-group": node("design-group", 1440, 680, "region", { width: 200, height: 320 }),
    "global-iam-group": node("design-group", 1720, 320, undefined, { width: 400, height: 400 })
  },
  "three-tier-web-app": {
    internet: node("design-internet", 80, 240),
    region: node("aws-region", 200, 40, undefined, { width: 1960, height: 1560 }),
    "az-a": node("aws-availability-zone", 440, 280, "vpc", { width: 560, height: 1120 }),
    "az-b": node("aws-availability-zone", 1400, 280, "vpc", { width: 560, height: 1120 })
  },
  "ecs-fargate-container-app": {
    user: node("design-user-client", 80, 360),
    region: node("aws-region", 240, 40, undefined, { width: 2200, height: 840 }),
    "definition-ops-group": node("design-group", 1840, 480, "region", { width: 560, height: 360 }),
    "global-iam-group": node("design-group", 1840, 120, "region", { width: 400, height: 360 })
  },
  "eks-container-app": {
    region: node("aws-region", 200, 40, undefined, { width: 2120, height: 1320 }),
    "az-a": node("aws-availability-zone", 440, 400, "vpc", { width: 520, height: 280 }),
    "az-b": node("aws-availability-zone", 1200, 400, "vpc", { width: 520, height: 280 }),
    "workloads-group": node("design-group", 520, 800, "vpc", { width: 1120, height: 360 }),
    "global-iam-group": node("design-group", 1880, 200, "region", { width: 360, height: 800 })
  }
} as const satisfies Record<RepositoryTemplateId, Readonly<Record<string, PresentationNodeExpectation>>>;

const EXPECTED_PRESENTATION_EDGES = {
  "static-web-hosting": {
    "user-distribution": edge("user", "distribution", "handle-right", "handle-left")
  },
  "minimal-serverless-api": {
    "user-api": edge("user", "api", "handle-right", "handle-left")
  },
  "full-serverless-web-app": {
    "source-frontend": edge("source-repository", "frontend", "handle-right", "handle-left"),
    "user-frontend": edge("user", "frontend", "handle-right", "handle-left"),
    "user-pool": edge("user", "user-pool", "handle-top", "handle-top")
  },
  "three-tier-web-app": {
    "internet-igw": edge("internet", "internet-gateway", "handle-right", "handle-left")
  },
  "ecs-fargate-container-app": {
    "user-load-balancer": edge("user", "load-balancer", "handle-right", "handle-left")
  },
  "eks-container-app": {}
} as const satisfies Record<RepositoryTemplateId, Readonly<Record<string, PresentationEdgeExpectation>>>;

const EXPECTED_RESOURCE_PARENTS = {
  "static-web-hosting": {
    bucket: "region",
    "index-object": "region",
    "public-access": "region",
    "bucket-policy": "region"
  },
  "minimal-serverless-api": {
    api: "region",
    handler: "region",
    permission: "region",
    table: "region",
    "log-group": "region",
    role: "global-iam-group",
    "role-policy": "global-iam-group"
  },
  "full-serverless-web-app": {
    frontend: "frontend-group",
    "user-pool": "identity-group",
    "user-client": "identity-group",
    api: "api-group",
    handler: "compute-group",
    permission: "compute-group",
    table: "data-ops-group",
    "log-group": "data-ops-group",
    role: "global-iam-group",
    "role-policy": "global-iam-group"
  },
  "three-tier-web-app": {
    vpc: "region",
    "public-subnet-a": "az-a",
    "public-subnet-b": "az-b",
    "app-subnet-a": "az-a",
    "app-subnet-b": "az-b",
    "db-subnet-a": "az-a",
    "db-subnet-b": "az-b",
    "internet-gateway": "region",
    "public-route-table": "vpc",
    "public-route-a": "az-a",
    "public-route-b": "az-b",
    "nat-gateway": "public-subnet-a",
    "nat-eip": "region",
    "app-route-table": "vpc",
    "app-route-a": "az-a",
    "app-route-b": "az-b",
    "db-route-table": "vpc",
    "db-route-a": "az-a",
    "db-route-b": "az-b",
    "alb-security-group": "vpc",
    "app-security-group": "vpc",
    "db-security-group": "vpc",
    "latest-ami": "region",
    "launch-template": "vpc",
    "load-balancer": "vpc",
    "target-group": "vpc",
    listener: "vpc",
    "application-group": "vpc",
    "db-subnet-group": "vpc",
    database: "vpc"
  },
  "ecs-fargate-container-app": {
    vpc: "region",
    "subnet-a": "vpc",
    "subnet-b": "vpc",
    "internet-gateway": "region",
    "route-table": "vpc",
    "route-a": "vpc",
    "route-b": "vpc",
    cluster: "vpc",
    "alb-security-group": "vpc",
    "task-security-group": "cluster",
    "load-balancer": "vpc",
    "target-group": "vpc",
    listener: "vpc",
    service: "cluster",
    repository: "definition-ops-group",
    task: "definition-ops-group",
    "log-group": "definition-ops-group",
    "execution-role": "global-iam-group",
    "execution-policy": "global-iam-group",
    "task-role": "global-iam-group"
  },
  "eks-container-app": {
    vpc: "region",
    "subnet-a": "az-a",
    "subnet-b": "az-b",
    "internet-gateway": "region",
    "route-table": "vpc",
    "route-a": "az-a",
    "route-b": "az-b",
    "cluster-security-group": "vpc",
    cluster: "vpc",
    "node-group": "workloads-group",
    namespace: "workloads-group",
    deployment: "namespace",
    service: "namespace",
    "cluster-role": "global-iam-group",
    "cluster-policy": "global-iam-group",
    "node-role": "global-iam-group",
    "node-policy": "global-iam-group",
    "node-cni-policy": "global-iam-group",
    "node-ecr-policy": "global-iam-group"
  }
} as const satisfies Record<RepositoryTemplateId, Readonly<Record<string, string>>>;

test("six deployable templates keep Design nodes and edges outside their semantic graph", () => {
  // Presentation definitions must stay explicit so Terraform resources cannot be created by accident.
  for (const templateId of REPOSITORY_TEMPLATE_IDS) {
    const definition = getTemplateDefinitionById(templateId);
    const expectedNodes = EXPECTED_PRESENTATION_NODES[templateId];
    const expectedEdges = EXPECTED_PRESENTATION_EDGES[templateId];
    const presentationNodeIds = new Set(definition.presentationNodes.map((nodeDefinition) => nodeDefinition.id));

    assert.deepEqual(
      Object.fromEntries(
        definition.presentationNodes.map((nodeDefinition) => [
          nodeDefinition.id,
          {
            catalogItemId: nodeDefinition.catalogItemId,
            ...(nodeDefinition.parentNodeId ? { parentNodeId: nodeDefinition.parentNodeId } : {}),
            position: nodeDefinition.position,
            ...(nodeDefinition.size ? { size: nodeDefinition.size } : {})
          }
        ])
      ),
      expectedNodes,
      `${definition.id} presentation nodes`
    );
    assert.deepEqual(
      Object.fromEntries(
        definition.presentationEdges.map((edgeDefinition) => [
          edgeDefinition.id,
          {
            sourceNodeId: edgeDefinition.sourceNodeId,
            targetNodeId: edgeDefinition.targetNodeId,
            sourceHandleId: edgeDefinition.sourceHandleId,
            targetHandleId: edgeDefinition.targetHandleId
          }
        ])
      ),
      expectedEdges,
      `${definition.id} presentation edges`
    );
    assert.equal(
      definition.relationships.some((relationship) => relationship.id in expectedEdges),
      false,
      `${definition.id} semantic relationships must exclude presentation edges`
    );

    for (const edgeDefinition of definition.presentationEdges) {
      assert.equal(
        presentationNodeIds.has(edgeDefinition.sourceNodeId) ||
          presentationNodeIds.has(edgeDefinition.targetNodeId),
        true,
        `${definition.id}/${edgeDefinition.id} must touch a Design node`
      );
    }
  }
});

test("built Template diagrams keep presentation nodes parameterless and parents visual-only", () => {
  // Raw shared diagrams must already be safe when the API uses them without the Web Catalog materializer.
  for (const templateId of REPOSITORY_TEMPLATE_IDS) {
    const definition = getTemplateDefinitionById(templateId);
    const diagram = buildTemplateDiagramJson(templateId, {
      projectSlug: "presentation",
      shortId: "contract"
    });
    const nodeById = new Map(diagram.nodes.map((diagramNode) => [diagramNode.id, diagramNode]));
    const presentationNodeIds = new Set(
      definition.presentationNodes.map(
        (nodeDefinition) => `template-${definition.id}-presentation-${nodeDefinition.id}`
      )
    );

    assert.equal(
      diagram.nodes.filter((diagramNode) => diagramNode.kind === "resource").length,
      definition.resources.length
    );
    assert.equal(
      diagram.nodes.filter((diagramNode) => diagramNode.kind === "design").length,
      definition.presentationNodes.length
    );
    assert.equal(
      diagram.edges.length,
      definition.relationships.length + definition.presentationEdges.length
    );

    for (const presentationNodeId of presentationNodeIds) {
      const diagramNode = nodeById.get(presentationNodeId);

      assert.ok(diagramNode, `${definition.id}/${presentationNodeId}`);
      assert.equal(diagramNode.kind, "design");
      assert.equal(diagramNode.parameters, undefined);
      assert.ok(diagramNode.metadata?.presentationCatalogItemId);
    }

    for (const presentationEdge of definition.presentationEdges) {
      const diagramEdge = diagram.edges.find(
        (candidate) =>
          candidate.id === `template-${definition.id}-presentation-${presentationEdge.id}`
      );

      assert.ok(diagramEdge, `${definition.id}/${presentationEdge.id}`);
      assert.equal(
        presentationNodeIds.has(diagramEdge.sourceNodeId) ||
          presentationNodeIds.has(diagramEdge.targetNodeId),
        true,
        `${definition.id}/${presentationEdge.id} diagram edge must touch a Design node`
      );
    }

    for (const [resourceId, parentNodeId] of Object.entries(EXPECTED_RESOURCE_PARENTS[templateId])) {
      const resourceNode = nodeById.get(`template-${definition.id}-${resourceId}`);
      const expectedParentId = presentationNodeIds.has(
        `template-${definition.id}-presentation-${parentNodeId}`
      )
        ? `template-${definition.id}-presentation-${parentNodeId}`
        : `template-${definition.id}-${parentNodeId}`;

      assert.equal(
        resourceNode?.metadata?.parentAreaNodeId,
        expectedParentId,
        `${definition.id}/${resourceId} parent`
      );
    }
  }
});

// Test fixtures use the same compact shape as the production presentation contract.
function node(
  catalogItemId: string,
  x: number,
  y: number,
  parentNodeId?: string,
  size?: PresentationNodeExpectation["size"]
): PresentationNodeExpectation {
  return {
    catalogItemId,
    ...(parentNodeId ? { parentNodeId } : {}),
    position: { x, y },
    size: size ?? { width: 48, height: 48 }
  };
}

// Presentation edge fixtures pin routing because a compact layout depends on predictable edge exits.
function edge(
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandleId: string,
  targetHandleId: string
): PresentationEdgeExpectation {
  return { sourceNodeId, targetNodeId, sourceHandleId, targetHandleId };
}
