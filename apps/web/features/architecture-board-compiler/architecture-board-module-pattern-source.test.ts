import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramEdge, DiagramJson, DiagramNode, DiagramVariable } from "@sketchcatch/types";
import * as modulePatternSource from "./architecture-board-module-pattern-source";

type TestSeed = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly lenses: readonly { kind: "functional" | "purpose"; key: string; label: string }[];
  readonly requiredResourceTypeGroups: readonly (readonly string[])[];
  readonly includedResourceTypes: readonly string[];
};

type TestCandidate = {
  readonly sourceTemplateId: string;
  readonly structuralFingerprint: string;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly variables: readonly DiagramVariable[];
  readonly dependencyResourceCount: number;
};

const createFingerprint = Reflect.get(
  modulePatternSource,
  "createArchitectureBoardModulePatternStructuralFingerprint"
) as ((nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]) => string) | undefined;
const extractCandidates = Reflect.get(
  modulePatternSource,
  "extractArchitectureBoardModulePatternCandidates"
) as
  | ((
      seed: TestSeed,
      source: { readonly id: string; readonly diagram: DiagramJson }
    ) => readonly TestCandidate[])
  | undefined;
const selectMedoid = Reflect.get(
  modulePatternSource,
  "selectArchitectureBoardModulePatternGeometryMedoid"
) as ((candidates: readonly TestCandidate[]) => TestCandidate) | undefined;
const areStructuresEquivalent = Reflect.get(
  modulePatternSource,
  "areArchitectureBoardModulePatternStructuresEquivalent"
) as
  | ((
      leftNodes: readonly DiagramNode[],
      leftEdges: readonly DiagramEdge[],
      rightNodes: readonly DiagramNode[],
      rightEdges: readonly DiagramEdge[]
    ) => boolean)
  | undefined;
const selectStructuralGroup = Reflect.get(
  modulePatternSource,
  "selectArchitectureBoardModulePatternStructuralGroup"
) as ((candidates: readonly TestCandidate[]) => readonly TestCandidate[]) | undefined;

test("fingerprint는 같은 type/edge 수를 가진 비동형 graph를 구분한다", () => {
  assert.equal(typeof createFingerprint, "function", "structural fingerprint test seam must exist");
  const nodes = [
    resourceNode("a", "worker", 0),
    resourceNode("b", "worker", 100),
    resourceNode("c", "worker", 200),
    resourceNode("d", "worker", 300)
  ];
  const path = [
    diagramEdge("ab", "a", "b"),
    diagramEdge("bc", "b", "c"),
    diagramEdge("cd", "c", "d")
  ];
  const star = [
    diagramEdge("ab", "a", "b"),
    diagramEdge("ac", "a", "c"),
    diagramEdge("ad", "a", "d")
  ];

  assert.notEqual(createFingerprint!(nodes, path), createFingerprint!(nodes, star));
});

test("공통 presentation Area 아래의 독립된 named pattern occurrence를 합치지 않는다", () => {
  assert.equal(typeof extractCandidates, "function", "candidate extraction test seam must exist");
  const region = areaNode("region");
  const diagram: DiagramJson = {
    nodes: [
      region,
      resourceNode("anchor-a", "service_anchor", 100, region.id),
      resourceNode("member-a", "service_member", 200, region.id),
      resourceNode("anchor-b", "service_anchor", 500, region.id),
      resourceNode("member-b", "service_member", 600, region.id)
    ],
    edges: [diagramEdge("a", "anchor-a", "member-a"), diagramEdge("b", "anchor-b", "member-b")],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const seed: TestSeed = {
    id: "service-pair",
    title: "Service Pair",
    description: "test",
    lenses: [{ kind: "functional", key: "compute", label: "컴퓨트" }],
    requiredResourceTypeGroups: [["service_anchor"], ["service_member"]],
    includedResourceTypes: ["service_anchor", "service_member"]
  };

  const candidates = extractCandidates!(seed, { id: "repository:two-pairs", diagram });

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.nodes.filter(({ kind }) => kind === "resource").length),
    [2, 2]
  );
  assert.ok(candidates.every((candidate) => candidate.nodes.some(({ id }) => id === region.id)));
});

test("geometry medoid는 중복 type node를 좌표 순서가 아니라 구조적 role로 정렬한다", () => {
  assert.equal(typeof createFingerprint, "function", "structural fingerprint test seam must exist");
  assert.equal(typeof selectMedoid, "function", "geometry medoid test seam must exist");
  const candidates = [
    roleCandidate("z-reference", 0, 200),
    roleCandidate("z-near-reference", 0, 220),
    roleCandidate("a-role-swapped", 200, 0)
  ];

  assert.equal(selectMedoid!(candidates).sourceTemplateId, "z-reference");
});

test("같은 32-bit fingerprint의 K3,3와 triangular prism을 exact structure로 구분한다", () => {
  assert.equal(typeof createFingerprint, "function", "structural fingerprint test seam must exist");
  assert.equal(typeof areStructuresEquivalent, "function", "exact structure test seam must exist");
  assert.equal(
    typeof selectStructuralGroup,
    "function",
    "structural grouping test seam must exist"
  );
  const nodes = Array.from({ length: 6 }, (_, index) =>
    resourceNode(`node-${index}`, "worker", index * 100)
  );
  const k33 = undirectedEdges([
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 3],
    [1, 4],
    [1, 5],
    [2, 3],
    [2, 4],
    [2, 5]
  ]);
  const triangularPrism = undirectedEdges([
    [0, 1],
    [1, 2],
    [2, 0],
    [3, 4],
    [4, 5],
    [5, 3],
    [0, 3],
    [1, 4],
    [2, 5]
  ]);
  const copiedNodes = Array.from({ length: 6 }, (_, index) =>
    resourceNode(`copy-${index}`, "worker", index * 100)
  );
  const copiedK33 = undirectedEdges(
    [
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 3],
      [1, 4],
      [1, 5],
      [2, 3],
      [2, 4],
      [2, 5]
    ],
    "copy"
  );

  assert.equal(createFingerprint!(nodes, k33), createFingerprint!(nodes, triangularPrism));
  assert.equal(areStructuresEquivalent!(nodes, k33, copiedNodes, copiedK33), true);
  assert.equal(areStructuresEquivalent!(nodes, k33, nodes, triangularPrism), false);
  const fingerprint = createFingerprint!(nodes, k33);
  const selected = selectStructuralGroup!([
    structureCandidate("k33", fingerprint, nodes, k33),
    structureCandidate("prism", fingerprint, nodes, triangularPrism)
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.sourceTemplateId, "k33");
});

test("candidate는 Terraform reference와 variable binding dependency를 재귀적으로 포함한다", () => {
  assert.equal(typeof extractCandidates, "function", "candidate extraction test seam must exist");
  const region = areaNode("region");
  const anchor = terraformNode("anchor", "aws_service_anchor", 100, region.id, {
    supportId: "aws_support.first.id"
  });
  const member = terraformNode("member", "aws_service_member", 200, region.id);
  const firstSupport = terraformNode(
    "first-support",
    "aws_support",
    300,
    region.id,
    { nextId: "aws_support.second.id" },
    "first"
  );
  const secondSupport = terraformNode(
    "second-support",
    "aws_support",
    400,
    region.id,
    {},
    "second"
  );
  const variablePeer = terraformNode("variable-peer", "aws_variable_peer", 500, region.id);
  const unrelated = terraformNode("unrelated", "aws_unrelated", 600, region.id);
  const diagram: DiagramJson = {
    nodes: [region, anchor, member, firstSupport, secondSupport, variablePeer, unrelated],
    edges: [diagramEdge("pair", anchor.id, member.id)],
    variables: [
      {
        id: "shared-name",
        name: "shared_name",
        type: "string",
        value: "shared",
        source: "module",
        bindings: [
          { nodeId: anchor.id, parameterKey: "name" },
          { nodeId: variablePeer.id, parameterKey: "name" }
        ]
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const seed: TestSeed = {
    id: "service-pair",
    title: "Service Pair",
    description: "test",
    lenses: [{ kind: "functional", key: "compute", label: "컴퓨트" }],
    requiredResourceTypeGroups: [["aws_service_anchor"], ["aws_service_member"]],
    includedResourceTypes: ["aws_service_anchor", "aws_service_member"]
  };

  const [candidate] = extractCandidates!(seed, { id: "repository:dependencies", diagram });
  assert.ok(candidate);
  assert.deepEqual(
    candidate.nodes
      .filter(({ kind }) => kind === "resource")
      .map(({ id }) => id)
      .sort(),
    [anchor.id, firstSupport.id, member.id, secondSupport.id, variablePeer.id].sort()
  );
  assert.deepEqual(candidate.variables[0]?.bindings, diagram.variables?.[0]?.bindings);
});

test("candidate extractor는 Template 전체 graph를 Module로 이름만 바꾸어 내보내지 않는다", () => {
  assert.equal(typeof extractCandidates, "function", "candidate extraction test seam must exist");
  const region = areaNode("region");
  const diagram: DiagramJson = {
    nodes: [
      region,
      resourceNode("database", "aws_db_instance", 100, region.id),
      resourceNode("subnet", "aws_subnet", 200, region.id)
    ],
    edges: [diagramEdge("database-subnet", "database", "subnet")],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const seed: TestSeed = {
    id: "data-layer",
    title: "Data Layer",
    description: "test",
    lenses: [{ kind: "functional", key: "database", label: "데이터베이스" }],
    requiredResourceTypeGroups: [["aws_db_instance"], ["aws_subnet"]],
    includedResourceTypes: ["aws_db_instance", "aws_subnet"]
  };

  assert.deepEqual(extractCandidates!(seed, { id: "repository:whole-template", diagram }), []);
});

function roleCandidate(
  sourceTemplateId: string,
  incomingX: number,
  outgoingX: number
): TestCandidate {
  const nodes = [
    resourceNode("anchor", "anchor", 100),
    resourceNode("incoming", "peer", incomingX),
    resourceNode("outgoing", "peer", outgoingX)
  ];
  const edges = [
    diagramEdge("incoming-anchor", "incoming", "anchor"),
    diagramEdge("anchor-outgoing", "anchor", "outgoing")
  ];
  return {
    sourceTemplateId,
    structuralFingerprint: createFingerprint!(nodes, edges),
    nodes,
    edges,
    variables: [],
    dependencyResourceCount: 0
  };
}

function structureCandidate(
  sourceTemplateId: string,
  structuralFingerprint: string,
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[]
): TestCandidate {
  return {
    sourceTemplateId,
    structuralFingerprint,
    nodes,
    edges,
    variables: [],
    dependencyResourceCount: 0
  };
}

function resourceNode(id: string, type: string, x: number, parentAreaNodeId?: string): DiagramNode {
  return {
    id,
    type,
    kind: "resource",
    label: id,
    locked: false,
    position: { x, y: 100 },
    size: { width: 60, height: 60 },
    zIndex: 1,
    ...(parentAreaNodeId ? { metadata: { parentAreaNodeId } } : {})
  };
}

function terraformNode(
  id: string,
  type: string,
  x: number,
  parentAreaNodeId?: string,
  values: Record<string, unknown> = {},
  resourceName = id.replaceAll("-", "_")
): DiagramNode {
  return {
    ...resourceNode(id, type, x, parentAreaNodeId),
    parameters: {
      terraformBlockType: "resource",
      resourceType: type,
      resourceName,
      fileName: "main.tf",
      values
    }
  };
}

function areaNode(id: string): DiagramNode {
  return {
    id,
    type: "region",
    kind: "design",
    label: "Region",
    locked: false,
    position: { x: 0, y: 0 },
    size: { width: 800, height: 400 },
    zIndex: 0
  };
}

function diagramEdge(id: string, sourceNodeId: string, targetNodeId: string): DiagramEdge {
  return { id, sourceNodeId, targetNodeId, label: "uses", type: "smoothstep" };
}

function undirectedEdges(
  pairs: readonly (readonly [number, number])[],
  prefix = "node"
): DiagramEdge[] {
  return pairs.flatMap(([left, right], index) => [
    diagramEdge(`edge-${index}-forward`, `${prefix}-${left}`, `${prefix}-${right}`),
    diagramEdge(`edge-${index}-reverse`, `${prefix}-${right}`, `${prefix}-${left}`)
  ]);
}
