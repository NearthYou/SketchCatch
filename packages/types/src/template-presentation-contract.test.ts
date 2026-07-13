import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  templateDefinitions,
  type TemplateId
} from "./template-definitions.js";

type PresentationNodeExpectation = {
  readonly catalogItemId: string;
  readonly parentNodeId?: string;
};

type PresentationEdgeExpectation = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
};

const EXPECTED_PRESENTATION_NODES = {
  "static-web-hosting": {
    user: node("design-user-client"),
    region: node("aws-region")
  },
  "minimal-serverless-api": {
    user: node("design-user-client"),
    region: node("aws-region")
  },
  "full-serverless-web-app": {
    "source-repository": node("design-source-repository", "source-user-group"),
    user: node("design-user-client", "source-user-group"),
    region: node("aws-region"),
    "source-user-group": node("design-group"),
    "frontend-group": node("design-group", "region"),
    "identity-group": node("design-group", "region"),
    "api-group": node("design-group", "region"),
    "compute-group": node("design-group", "region"),
    "data-ops-group": node("design-group", "region"),
    "global-iam-group": node("design-group")
  },
  "three-tier-web-app": {
    internet: node("design-internet"),
    region: node("aws-region"),
    "az-a": node("aws-availability-zone", "vpc"),
    "az-b": node("aws-availability-zone", "vpc")
  },
  "ecs-fargate-container-app": {
    user: node("design-user-client"),
    region: node("aws-region"),
    "az-a": node("aws-availability-zone", "vpc"),
    "az-b": node("aws-availability-zone", "vpc"),
    "definition-ops-group": node("design-group", "region"),
    "global-iam-group": node("design-group")
  },
  "eks-container-app": {
    region: node("aws-region"),
    "az-a": node("aws-availability-zone", "vpc"),
    "az-b": node("aws-availability-zone", "vpc"),
    "global-iam-group": node("design-group")
  }
} as const satisfies Record<TemplateId, Readonly<Record<string, PresentationNodeExpectation>>>;

const EXPECTED_PRESENTATION_EDGES = {
  "static-web-hosting": {
    "user-distribution": edge("user", "distribution")
  },
  "minimal-serverless-api": {
    "user-api": edge("user", "api")
  },
  "full-serverless-web-app": {
    "source-frontend": edge("source-repository", "frontend"),
    "user-frontend": edge("user", "frontend"),
    "user-pool": edge("user", "user-pool")
  },
  "three-tier-web-app": {
    "internet-igw": edge("internet", "internet-gateway")
  },
  "ecs-fargate-container-app": {
    "user-load-balancer": edge("user", "load-balancer")
  },
  "eks-container-app": {}
} as const satisfies Record<TemplateId, Readonly<Record<string, PresentationEdgeExpectation>>>;

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
    "log-group": "region"
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
    "db-subnet-b": "az-b"
  },
  "ecs-fargate-container-app": {
    vpc: "region",
    "subnet-a": "az-a",
    "subnet-b": "az-b",
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
    "cluster-security-group": "vpc",
    "cluster-role": "global-iam-group",
    "cluster-policy": "global-iam-group",
    "node-role": "global-iam-group",
    "node-policy": "global-iam-group",
    "node-cni-policy": "global-iam-group",
    "node-ecr-policy": "global-iam-group"
  }
} as const satisfies Record<TemplateId, Readonly<Record<string, string>>>;

test("six deployable templates keep Design nodes and edges outside their semantic graph", () => {
  // Presentation definitions must stay explicit so Terraform resources cannot be created by accident.
  for (const definition of templateDefinitions) {
    const expectedNodes = EXPECTED_PRESENTATION_NODES[definition.id];
    const expectedEdges = EXPECTED_PRESENTATION_EDGES[definition.id];
    const presentationNodeIds = new Set(definition.presentationNodes.map((nodeDefinition) => nodeDefinition.id));

    assert.deepEqual(
      Object.fromEntries(definition.presentationNodes.map((nodeDefinition) => [
        nodeDefinition.id,
        {
          catalogItemId: nodeDefinition.catalogItemId,
          ...(nodeDefinition.parentNodeId ? { parentNodeId: nodeDefinition.parentNodeId } : {})
        }
      ])),
      expectedNodes,
      `${definition.id} presentation nodes`
    );
    assert.deepEqual(
      Object.fromEntries(definition.presentationEdges.map((edgeDefinition) => [
        edgeDefinition.id,
        {
          sourceNodeId: edgeDefinition.sourceNodeId,
          targetNodeId: edgeDefinition.targetNodeId
        }
      ])),
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
        presentationNodeIds.has(edgeDefinition.sourceNodeId) || presentationNodeIds.has(edgeDefinition.targetNodeId),
        true,
        `${definition.id}/${edgeDefinition.id} must touch a Design node`
      );
    }
  }
});

test("built Template diagrams keep presentation nodes parameterless and parents visual-only", () => {
  // Raw shared diagrams must already be safe when the API uses them without the Web Catalog materializer.
  for (const definition of templateDefinitions) {
    const diagram = buildTemplateDiagramJson(definition.id, {
      projectSlug: "presentation",
      shortId: "contract"
    });
    const nodeById = new Map(diagram.nodes.map((diagramNode) => [diagramNode.id, diagramNode]));
    const presentationNodeIds = new Set(
      definition.presentationNodes.map((nodeDefinition) => `template-${definition.id}-presentation-${nodeDefinition.id}`)
    );

    assert.equal(diagram.nodes.filter((diagramNode) => diagramNode.kind === "resource").length, definition.resources.length);
    assert.equal(diagram.nodes.filter((diagramNode) => diagramNode.kind === "design").length, definition.presentationNodes.length);
    assert.equal(diagram.edges.length, definition.relationships.length + definition.presentationEdges.length);

    for (const presentationNodeId of presentationNodeIds) {
      const diagramNode = nodeById.get(presentationNodeId);

      assert.ok(diagramNode, `${definition.id}/${presentationNodeId}`);
      assert.equal(diagramNode.kind, "design");
      assert.equal(diagramNode.parameters, undefined);
      assert.ok(diagramNode.metadata?.presentationCatalogItemId);
    }

    for (const presentationEdge of definition.presentationEdges) {
      const diagramEdge = diagram.edges.find(
        (candidate) => candidate.id === `template-${definition.id}-presentation-${presentationEdge.id}`
      );

      assert.ok(diagramEdge, `${definition.id}/${presentationEdge.id}`);
      assert.equal(
        presentationNodeIds.has(diagramEdge.sourceNodeId) || presentationNodeIds.has(diagramEdge.targetNodeId),
        true,
        `${definition.id}/${presentationEdge.id} diagram edge must touch a Design node`
      );
    }

    for (const [resourceId, parentNodeId] of Object.entries(EXPECTED_RESOURCE_PARENTS[definition.id])) {
      const resourceNode = nodeById.get(`template-${definition.id}-${resourceId}`);
      const expectedParentId = presentationNodeIds.has(`template-${definition.id}-presentation-${parentNodeId}`)
        ? `template-${definition.id}-presentation-${parentNodeId}`
        : `template-${definition.id}-${parentNodeId}`;

      assert.equal(resourceNode?.metadata?.parentAreaNodeId, expectedParentId, `${definition.id}/${resourceId} parent`);
    }
  }
});

// Test fixtures use the same compact shape as the production presentation contract.
function node(catalogItemId: string, parentNodeId?: string): PresentationNodeExpectation {
  return { catalogItemId, ...(parentNodeId ? { parentNodeId } : {}) };
}

// Presentation edge fixtures intentionally omit labels and routing from the structural assertion.
function edge(sourceNodeId: string, targetNodeId: string): PresentationEdgeExpectation {
  return { sourceNodeId, targetNodeId };
}
