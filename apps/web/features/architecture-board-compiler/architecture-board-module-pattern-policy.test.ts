import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramEdge, DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
  ARCHITECTURE_BOARD_MODULE_PATTERN_EXTRACTOR_VERSION,
  type ArchitectureBoardKnowledgeArtifact,
  type ArchitectureBoardModulePattern
} from "./architecture-board-knowledge-contract";
import { applyArchitectureBoardModulePatternKnowledge } from ".";

const pattern = createPattern();

test("pattern knowledge는 directed edge와 containment가 같은 subgraph에 상대 geometry와 route를 적용한다", () => {
  const diagram = {
    ...createMatchingDiagram(),
    nodes: createMatchingDiagram().nodes.map((node) =>
      node.id === "board-api" ? { ...node, size: { width: 72, height: 60 } } : node
    )
  };
  const before = structuredClone(diagram);

  const result = applyArchitectureBoardModulePatternKnowledge(diagram, createArtifact(pattern));

  assert.ok(result);
  assert.deepEqual(diagram, before);
  assert.deepEqual(result.matchedPatternIds, ["test-request-path"]);
  assert.deepEqual(result.representativeTemplateIds, ["repository:test-template"]);
  assert.deepEqual(result.referenceTemplateIds, [
    "brainboard:test-template",
    "repository:test-template"
  ]);
  assert.deepEqual(result.matches[0]?.nodeIdByPatternNodeId, {
    "pattern-api": "board-api",
    "pattern-function": "board-function",
    "pattern-vpc": "board-vpc"
  });

  const nodeById = new Map(result.diagram.nodes.map((node) => [node.id, node]));
  assert.deepEqual(nodeById.get("board-vpc")?.position, { x: 1000, y: 500 });
  assert.deepEqual(nodeById.get("board-vpc")?.size, { width: 400, height: 280 });
  assert.deepEqual(nodeById.get("board-api")?.position, { x: 1060, y: 580 });
  assert.deepEqual(nodeById.get("board-api")?.size, { width: 72, height: 60 });
  assert.deepEqual(nodeById.get("board-function")?.position, { x: 1240, y: 580 });
  assert.equal(nodeById.get("board-api")?.metadata?.parentAreaNodeId, "board-vpc");
  assert.equal(nodeById.get("board-function")?.metadata?.parentAreaNodeId, "board-vpc");

  const edge = result.diagram.edges[0];
  assert.equal(result.diagram.edges.length, diagram.edges.length);
  assert.equal(edge?.id, "board-api-function");
  assert.equal(edge?.sourceNodeId, "board-api");
  assert.equal(edge?.targetNodeId, "board-function");
  assert.equal(edge?.label, "invokes");
  assert.deepEqual(edge?.metadata, { presentationRole: "primary" });
  assert.equal(edge?.sourceHandleId, "handle-right");
  assert.equal(edge?.targetHandleId, "handle-left");
  assert.deepEqual(edge?.route?.sourcePoint, { x: 1108, y: 604 });
  assert.deepEqual(edge?.route?.targetPoint, { x: 1240, y: 604 });
  assert.deepEqual(edge?.route?.labelPosition, { x: 1174, y: 604 });
  assert.equal(edge?.route?.svgPath, "M 1108 604 L 1240 604");
});

test("pattern knowledge는 node type만 같고 directed edge가 다르면 geometry 후보를 만들지 않는다", () => {
  const matching = createMatchingDiagram();
  const reversed: DiagramJson = {
    ...matching,
    edges: matching.edges.map((edge) => ({
      ...edge,
      sourceNodeId: edge.targetNodeId,
      targetNodeId: edge.sourceNodeId
    }))
  };
  const missingRelationship: DiagramJson = { ...matching, edges: [] };

  assert.equal(
    applyArchitectureBoardModulePatternKnowledge(reversed, createArtifact(pattern)),
    null
  );
  assert.equal(
    applyArchitectureBoardModulePatternKnowledge(missingRelationship, createArtifact(pattern)),
    null
  );
  const typeOnlyPattern: ArchitectureBoardModulePattern = {
    ...pattern,
    id: "type-only",
    nodes: [pattern.nodes.find(({ id }) => id === "pattern-api")!],
    edges: []
  };
  assert.equal(
    applyArchitectureBoardModulePatternKnowledge(
      {
        ...missingRelationship,
        nodes: missingRelationship.nodes.filter(({ id }) => id === "board-api")
      },
      createArtifact(typeOnlyPattern)
    ),
    null
  );
});

test("pattern knowledge는 containment가 다르거나 잠긴 node가 포함된 match를 건너뛴다", () => {
  const matching = createMatchingDiagram();
  const wrongContainment: DiagramJson = {
    ...matching,
    nodes: matching.nodes.map((node) =>
      node.id === "board-function"
        ? { ...node, metadata: { ...node.metadata, parentAreaNodeId: undefined } }
        : node
    )
  };
  const locked: DiagramJson = {
    ...matching,
    nodes: matching.nodes.map((node) =>
      node.id === "board-api" ? { ...node, locked: true } : node
    )
  };

  assert.equal(
    applyArchitectureBoardModulePatternKnowledge(wrongContainment, createArtifact(pattern)),
    null
  );
  assert.equal(applyArchitectureBoardModulePatternKnowledge(locked, createArtifact(pattern)), null);
});

test("pattern knowledge는 반복 구조를 node ID 순서로 결정해 겹치지 않게 모두 적용한다", () => {
  const first = createMatchingDiagram("a", 100, 200);
  const second = createMatchingDiagram("b", 900, 700);
  const diagram: DiagramJson = {
    nodes: [...second.nodes, ...first.nodes],
    edges: [...second.edges, ...first.edges],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = applyArchitectureBoardModulePatternKnowledge(diagram, createArtifact(pattern));

  assert.ok(result);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map(({ nodeIdByPatternNodeId }) => nodeIdByPatternNodeId["pattern-api"]),
    ["a-api", "b-api"]
  );
  assert.equal(
    new Set(
      result.matches.flatMap(({ nodeIdByPatternNodeId }) => Object.values(nodeIdByPatternNodeId))
    ).size,
    6
  );
});

test("presentation node가 없는 Board는 resource edge와 resource containment projection으로 match한다", () => {
  const projectedPattern = createPresentationPattern();
  const diagram = createProjectedResourceDiagram();

  const result = applyArchitectureBoardModulePatternKnowledge(
    diagram,
    createArtifact(projectedPattern)
  );

  assert.ok(result);
  assert.equal(result.matches[0]?.projection, "resource");
  const nodeById = new Map(result.diagram.nodes.map((node) => [node.id, node]));
  assert.deepEqual(nodeById.get("board-api")?.position, { x: 1000, y: 500 });
  assert.deepEqual(nodeById.get("board-function")?.position, { x: 1180, y: 500 });
  assert.deepEqual(result.diagram.edges[0]?.route?.sourcePoint, { x: 1048, y: 524 });
  assert.deepEqual(result.diagram.edges[0]?.route?.targetPoint, { x: 1180, y: 524 });
});

test("presentation node까지 존재하면 resource projection보다 full pattern match를 우선한다", () => {
  const projectedPattern = createPresentationPattern();
  const resources = createProjectedResourceDiagram();
  const fullDiagram: DiagramJson = {
    ...resources,
    nodes: [
      createNode("board-region", "aws_region", 800, 300, {
        kind: "design",
        size: { width: 600, height: 400 }
      }),
      ...resources.nodes.map((node) => ({
        ...node,
        metadata: { ...node.metadata, parentAreaNodeId: "board-region" }
      }))
    ]
  };

  const result = applyArchitectureBoardModulePatternKnowledge(
    fullDiagram,
    createArtifact(projectedPattern)
  );

  assert.ok(result);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.projection, "full");
});

test("strict pattern match는 edge의 semantic metadata를 구분한다", () => {
  const semanticPattern: ArchitectureBoardModulePattern = {
    ...pattern,
    edges: pattern.edges.map((edge) => ({
      ...edge,
      type: "smoothstep",
      metadata: {
        managedBy: "parameter-reference",
        parameterPath: "integrationUri",
        presentationRole: "detail"
      }
    }))
  };
  const matching: DiagramJson = {
    ...createMatchingDiagram(),
    edges: createMatchingDiagram().edges.map((edge) => ({
      ...edge,
      type: "smoothstep",
      metadata: {
        managedBy: "parameter-reference",
        parameterPath: "integrationUri",
        presentationRole: "detail"
      }
    }))
  };
  assert.ok(
    applyArchitectureBoardModulePatternKnowledge(matching, createArtifact(semanticPattern))
  );

  const falseMatches: DiagramJson[] = [
    {
      ...matching,
      edges: matching.edges.map((edge) => ({
        ...edge,
        metadata: { ...edge.metadata, managedBy: undefined }
      }))
    },
    {
      ...matching,
      edges: matching.edges.map((edge) => ({
        ...edge,
        metadata: { ...edge.metadata, parameterPath: "otherPath" }
      }))
    },
    {
      ...matching,
      edges: matching.edges.map((edge) => ({
        ...edge,
        label: "publishes"
      }))
    }
  ];
  for (const falseMatch of falseMatches) {
    assert.equal(
      applyArchitectureBoardModulePatternKnowledge(falseMatch, createArtifact(semanticPattern)),
      null
    );
  }
});

test("compiler roundtrip projection은 시각 edge 표현이 달라져도 남은 Resource graph를 match한다", () => {
  const presentationPattern = createPresentationPattern();
  const genericDiagram: DiagramJson = {
    ...createProjectedResourceDiagram(),
    edges: createProjectedResourceDiagram().edges.map((edge) => ({
      ...edge,
      type: "smoothstep",
      metadata: undefined
    }))
  };

  const result = applyArchitectureBoardModulePatternKnowledge(
    genericDiagram,
    createArtifact(presentationPattern),
    { projection: "compiler-roundtrip" }
  );

  assert.ok(result);
  assert.equal(result.matches[0]?.projection, "resource");

  const reversed: DiagramJson = {
    ...genericDiagram,
    edges: genericDiagram.edges.map((edge) => ({
      ...edge,
      sourceNodeId: edge.targetNodeId,
      targetNodeId: edge.sourceNodeId
    }))
  };
  assert.equal(
    applyArchitectureBoardModulePatternKnowledge(reversed, createArtifact(presentationPattern), {
      projection: "compiler-roundtrip"
    }),
    null
  );
});

test("pattern route는 현재 edge의 arrowDirection을 바꾸지 않는다", () => {
  const diagram = createMatchingDiagram();
  diagram.edges[0] = {
    ...diagram.edges[0]!,
    route: {
      svgPath: "M 0 0 L 1 1",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 1, y: 1 },
      waypoints: [],
      arrowDirection: "bidirectional"
    }
  };

  const result = applyArchitectureBoardModulePatternKnowledge(diagram, createArtifact(pattern));

  assert.ok(result);
  assert.equal(result.diagram.edges[0]?.route?.arrowDirection, "bidirectional");
});

function createArtifact(
  modulePattern: ArchitectureBoardModulePattern
): ArchitectureBoardKnowledgeArtifact {
  return {
    version: ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
    hash: "test-pattern-artifact",
    cases: [],
    modulePatterns: [modulePattern],
    unavailableTemplateIds: []
  };
}

function createPattern(): ArchitectureBoardModulePattern {
  const nodes: DiagramNode[] = [
    createNode("pattern-vpc", "aws_vpc", 0, 0, {
      kind: "resource",
      size: { width: 400, height: 280 }
    }),
    createNode("pattern-api", "aws_api_gateway_rest_api", 60, 80, {
      parentAreaNodeId: "pattern-vpc"
    }),
    createNode("pattern-function", "aws_lambda_function", 240, 80, {
      parentAreaNodeId: "pattern-vpc"
    })
  ];
  const edges: DiagramEdge[] = [
    {
      id: "pattern-api-function",
      sourceNodeId: "pattern-api",
      targetNodeId: "pattern-function",
      label: "invokes",
      metadata: { presentationRole: "primary" },
      sourceHandleId: "handle-right",
      targetHandleId: "handle-left",
      route: {
        svgPath: "M 108 104 L 240 104",
        sourcePoint: { x: 108, y: 104 },
        targetPoint: { x: 240, y: 104 },
        waypoints: [],
        labelPosition: { x: 174, y: 104 },
        arrowDirection: "source-to-target"
      }
    }
  ];

  return {
    id: "test-request-path",
    title: "Request path",
    description: "Test pattern",
    lenses: [{ kind: "functional", key: "compute", label: "컴퓨트" }],
    structuralFingerprint: "test-fingerprint",
    nodes,
    edges,
    variables: [],
    provenance: {
      extractorVersion: ARCHITECTURE_BOARD_MODULE_PATTERN_EXTRACTOR_VERSION,
      representativeTemplateId: "repository:test-template",
      sourceTemplateIds: ["repository:test-template", "brainboard:test-template"]
    }
  };
}

function createPresentationPattern(): ArchitectureBoardModulePattern {
  return {
    ...pattern,
    id: "test-presentation-request-path",
    nodes: [
      createNode("pattern-region", "aws_region", 0, 0, {
        kind: "design",
        size: { width: 600, height: 400 }
      }),
      createNode("pattern-api", "aws_api_gateway_rest_api", 60, 80, {
        parentAreaNodeId: "pattern-region"
      }),
      createNode("pattern-function", "aws_lambda_function", 240, 80, {
        parentAreaNodeId: "pattern-region"
      })
    ]
  };
}

function createProjectedResourceDiagram(): DiagramJson {
  return {
    nodes: [
      createNode("board-api", "aws_api_gateway_rest_api", 1000, 500),
      createNode("board-function", "aws_lambda_function", 1050, 500)
    ],
    edges: [
      {
        id: "board-api-function",
        sourceNodeId: "board-api",
        targetNodeId: "board-function",
        label: "invokes",
        metadata: { presentationRole: "primary" }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createMatchingDiagram(prefix = "board", anchorX = 1000, anchorY = 500): DiagramJson {
  const vpcId = `${prefix}-vpc`;
  const apiId = `${prefix}-api`;
  const functionId = `${prefix}-function`;
  return {
    nodes: [
      createNode(vpcId, "aws_vpc", anchorX, anchorY, {
        kind: "resource",
        size: { width: 120, height: 80 }
      }),
      createNode(apiId, "aws_api_gateway_rest_api", anchorX + 10, anchorY + 10, {
        parentAreaNodeId: vpcId
      }),
      createNode(functionId, "aws_lambda_function", anchorX + 20, anchorY + 20, {
        parentAreaNodeId: vpcId
      })
    ],
    edges: [
      {
        id: `${prefix}-api-function`,
        sourceNodeId: apiId,
        targetNodeId: functionId,
        label: "invokes",
        metadata: { presentationRole: "primary" }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createNode(
  id: string,
  resourceType: string,
  x: number,
  y: number,
  options: {
    readonly kind?: DiagramNode["kind"];
    readonly parentAreaNodeId?: string;
    readonly size?: DiagramNode["size"];
  } = {}
): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: options.kind ?? "resource",
    label: id,
    locked: false,
    position: { x, y },
    size: options.size ?? { width: 48, height: 48 },
    zIndex: resourceType === "aws_vpc" ? 1 : 100,
    metadata: options.parentAreaNodeId ? { parentAreaNodeId: options.parentAreaNodeId } : undefined,
    parameters: {
      resourceType,
      resourceName: id.replaceAll("-", "_"),
      fileName: "main.tf",
      values: {}
    }
  };
}
