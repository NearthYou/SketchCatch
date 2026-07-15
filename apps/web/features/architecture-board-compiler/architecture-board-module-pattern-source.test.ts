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

test("fingerprint는 같은 type/edge 수를 가진 비동형 graph를 구분한다", () => {
  assert.equal(typeof createFingerprint, "function", "structural fingerprint test seam must exist");
  const nodes = [resourceNode("a", "worker", 0), resourceNode("b", "worker", 100), resourceNode("c", "worker", 200), resourceNode("d", "worker", 300)];
  const path = [diagramEdge("ab", "a", "b"), diagramEdge("bc", "b", "c"), diagramEdge("cd", "c", "d")];
  const star = [diagramEdge("ab", "a", "b"), diagramEdge("ac", "a", "c"), diagramEdge("ad", "a", "d")];

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
    edges: [
      diagramEdge("a", "anchor-a", "member-a"),
      diagramEdge("b", "anchor-b", "member-b")
    ],
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
    variables: []
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
