import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiagramJson,
  DiagramNode,
  DiagramVariable
} from "../../../../packages/types/src";
import type { ArchitectureBoardModulePattern } from "../architecture-board-compiler/architecture-board-knowledge-contract";
import { architectureBoardKnowledge } from "../architecture-board-compiler/architecture-board-knowledge";
import {
  curatedModules,
  expandCuratedModuleIntoDiagram,
  materializeCuratedModulePattern
} from "./module-catalog";

const emptyDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  variables: []
};

test("catalog는 생성된 Module Pattern Knowledge를 그대로 노출한다", () => {
  assert.deepEqual(
    curatedModules.map(({ id }) => id),
    architectureBoardKnowledge.modulePatterns.map(({ id }) => id)
  );
  assert.ok(curatedModules.every(({ nodes, edges }) => nodes.length > 0 && edges.length > 0));
});

test("Module 추가는 source fragment의 node, edge, containment와 route를 함께 옮긴다", () => {
  const pattern = architectureBoardKnowledge.modulePatterns.find(
    ({ id }) => id === "relational-data-layer"
  );
  assert.ok(pattern);

  const result = expandCuratedModuleIntoDiagram({
    diagram: emptyDiagram,
    moduleId: pattern.id
  });

  assert.equal(result.nodes.length, pattern.nodes.length);
  assert.equal(result.edges.length, pattern.edges.length);
  const nodeIdMap = sourceToMaterializedNodeIds(pattern.nodes, result.nodes);
  const resultNodeIds = new Set(result.nodes.map(({ id }) => id));

  for (const sourceNode of pattern.nodes) {
    const materializedNode = result.nodes.find(({ id }) => id === nodeIdMap.get(sourceNode.id));
    assert.ok(materializedNode);
    assert.notEqual(materializedNode.id, sourceNode.id);
    assert.equal(
      materializedNode.metadata?.parentAreaNodeId,
      sourceNode.metadata?.parentAreaNodeId
        ? nodeIdMap.get(sourceNode.metadata.parentAreaNodeId)
        : undefined
    );
    assert.equal(materializedNode.metadata?.moduleSource?.moduleId, pattern.id);
    assert.equal(
      materializedNode.metadata?.moduleSource?.representativeTemplateId,
      pattern.provenance.representativeTemplateId
    );
    assert.deepEqual(
      materializedNode.metadata?.moduleSource?.referenceTemplateIds,
      pattern.provenance.sourceTemplateIds
    );
  }

  for (const edge of result.edges) {
    assert.ok(resultNodeIds.has(edge.sourceNodeId));
    assert.ok(resultNodeIds.has(edge.targetNodeId));
  }

  const sourceRoutedEdge = pattern.edges.find(({ route }) => route);
  assert.ok(sourceRoutedEdge?.route);
  const resultRoutedEdge = result.edges.find(
    ({ sourceNodeId, targetNodeId }) =>
      sourceNodeId === nodeIdMap.get(sourceRoutedEdge.sourceNodeId) &&
      targetNodeId === nodeIdMap.get(sourceRoutedEdge.targetNodeId)
  );
  assert.ok(resultRoutedEdge?.route);
  const delta = {
    x: result.nodes[0]!.position.x - pattern.nodes[0]!.position.x,
    y: result.nodes[0]!.position.y - pattern.nodes[0]!.position.y
  };
  assert.deepEqual(resultRoutedEdge.route.sourcePoint, {
    x: sourceRoutedEdge.route.sourcePoint.x + delta.x,
    y: sourceRoutedEdge.route.sourcePoint.y + delta.y
  });
  assert.deepEqual(resultRoutedEdge.route.targetPoint, {
    x: sourceRoutedEdge.route.targetPoint.x + delta.x,
    y: sourceRoutedEdge.route.targetPoint.y + delta.y
  });
  assert.deepEqual(
    resultRoutedEdge.route.waypoints,
    sourceRoutedEdge.route.waypoints.map(({ x, y }) => ({ x: x + delta.x, y: y + delta.y }))
  );
  assert.deepEqual(
    resultRoutedEdge.route.labelPosition,
    sourceRoutedEdge.route.labelPosition
      ? {
          x: sourceRoutedEdge.route.labelPosition.x + delta.x,
          y: sourceRoutedEdge.route.labelPosition.y + delta.y
        }
      : undefined
  );
  assert.notEqual(resultRoutedEdge.route.svgPath, sourceRoutedEdge.route.svgPath);
});

test("반복 추가는 ID와 Terraform resourceName/reference를 매번 고유화한다", () => {
  const first = expandCuratedModuleIntoDiagram({
    diagram: emptyDiagram,
    moduleId: "container-image-delivery"
  });
  const second = expandCuratedModuleIntoDiagram({
    diagram: first,
    moduleId: "container-image-delivery"
  });

  assert.deepEqual(second.nodes.slice(0, first.nodes.length), first.nodes);
  assert.deepEqual(second.edges.slice(0, first.edges.length), first.edges);

  assert.equal(new Set(second.nodes.map(({ id }) => id)).size, second.nodes.length);
  assert.equal(new Set(second.edges.map(({ id }) => id)).size, second.edges.length);
  const resourceNames = second.nodes.flatMap(({ parameters }) =>
    parameters ? [parameters.resourceName] : []
  );
  assert.equal(new Set(resourceNames).size, resourceNames.length);

  const addresses = new Set(
    second.nodes.flatMap(({ parameters }) =>
      parameters
        ? [
            `${parameters.terraformBlockType === "data" ? "data." : ""}${parameters.resourceType}.${parameters.resourceName}`
          ]
        : []
    )
  );
  const references = second.nodes.flatMap(({ parameters }) =>
    extractTerraformResourceAddresses(parameters?.values)
  );
  assert.ok(references.length > 0);
  assert.ok(references.every((address) => addresses.has(address)), references.join("\n"));
});

test("variable 이름, 값의 var 참조와 binding node ID도 함께 remap한다", () => {
  const pattern = createVariablePattern();
  const currentVariable: DiagramVariable = {
    id: "var-region",
    name: "region",
    type: "string",
    value: "ap-northeast-2",
    bindings: [],
    source: "user"
  };
  const diagram: DiagramJson = {
    ...emptyDiagram,
    variables: [currentVariable]
  };
  const sourceSnapshot = structuredClone(pattern);

  const result = materializeCuratedModulePattern({
    diagram,
    expandedAt: "2026-07-16T00:00:00.000Z",
    pattern
  });

  assert.deepEqual(pattern, sourceSnapshot);
  assert.deepEqual(diagram, { ...emptyDiagram, variables: [currentVariable] });
  assert.equal(result.variables?.length, 2);
  const variable = result.variables?.find(({ id }) => id !== currentVariable.id);
  assert.ok(variable);
  assert.equal(variable.name, "region_2");
  assert.equal(variable.bindings.length, 1);
  assert.equal(variable.bindings[0]?.nodeId, result.nodes[0]?.id);
  assert.equal(result.nodes[0]?.parameters?.values.region, "var.region_2");
  assert.equal(result.nodes[0]?.parameters?.values.vpcId, `aws_vpc.${result.nodes[0]?.parameters?.resourceName}.id`);
});

test("node와 edge에는 같은 z-index delta를 적용해 Template layering을 보존한다", () => {
  const pattern = architectureBoardKnowledge.modulePatterns.find(
    ({ id }) => id === "container-runtime"
  );
  assert.ok(pattern);
  const sourceEdge = pattern.edges.find(({ zIndex }) => zIndex !== undefined);
  assert.ok(sourceEdge?.zIndex !== undefined);
  const sourceNode = pattern.nodes.find(
    ({ id }) => id === sourceEdge.sourceNodeId
  );
  assert.ok(sourceNode);
  const existingNode: DiagramNode = {
    id: "existing",
    type: "aws-vpc",
    kind: "resource",
    label: "Existing",
    locked: false,
    position: { x: 0, y: 0 },
    size: { width: 48, height: 48 },
    zIndex: 50
  };

  const result = materializeCuratedModulePattern({
    diagram: { ...emptyDiagram, nodes: [existingNode] },
    expandedAt: "2026-07-16T00:00:00.000Z",
    pattern
  });
  const materializedNode = result.nodes[1 + pattern.nodes.indexOf(sourceNode)];
  const materializedEdge = result.edges.find(
    ({ sourceNodeId }) => sourceNodeId === materializedNode?.id
  );

  assert.ok(materializedNode);
  assert.ok(materializedEdge?.zIndex !== undefined);
  assert.equal(
    materializedNode.zIndex - sourceNode.zIndex,
    materializedEdge.zIndex - sourceEdge.zIndex
  );
});

function sourceToMaterializedNodeIds(
  sourceNodes: ArchitectureBoardModulePattern["nodes"],
  materializedNodes: readonly DiagramNode[]
): Map<string, string> {
  assert.equal(sourceNodes.length, materializedNodes.length);
  return new Map(sourceNodes.map((sourceNode, index) => [sourceNode.id, materializedNodes[index]!.id]));
}

function extractTerraformResourceAddresses(value: unknown): string[] {
  if (typeof value === "string") {
    return [...value.matchAll(/(?:data\.)?(?:aws|kubernetes)_[a-z0-9_]+\.[a-z0-9_]+/g)].map(
      ([address]) => address
    );
  }
  if (Array.isArray(value)) return value.flatMap(extractTerraformResourceAddresses);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(extractTerraformResourceAddresses);
  }
  return [];
}

function createVariablePattern(): ArchitectureBoardModulePattern {
  return {
    id: "variable-pattern",
    title: "Variable Pattern",
    description: "Variable remapping fixture",
    lenses: [{ kind: "functional", key: "network", label: "네트워크" }],
    structuralFingerprint: "fnv1a-00000000",
    nodes: [
      {
        id: "source-vpc",
        type: "aws-vpc",
        kind: "resource",
        position: { x: 0, y: 0 },
        size: { width: 48, height: 48 },
        label: "VPC",
        locked: false,
        zIndex: 1,
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main.tf",
          values: {
            region: "var.region",
            vpcId: "aws_vpc.main.id"
          }
        }
      }
    ],
    edges: [],
    variables: [
      {
        id: "source-region",
        name: "region",
        type: "string",
        value: "us-east-1",
        bindings: [{ nodeId: "source-vpc", parameterKey: "region" }],
        source: "module"
      }
    ],
    provenance: {
      extractorVersion: "architecture-board-module-pattern-extractor/v1",
      representativeTemplateId: "template-variable",
      sourceTemplateIds: ["template-variable"]
    }
  };
}
