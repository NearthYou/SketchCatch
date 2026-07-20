import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardCompilationProposal, DiagramJson } from "@sketchcatch/types";

import {
  createBoardAutoOrganizeProposal,
  constrainBoardAutoOrganizeProposal,
  hasSameBoardAutoOrganizeSemantics
} from "./board-auto-organize";

test("실제 Compiler 자동 정리 결과도 원본과 같은 의미 데이터를 유지한다", () => {
  const original = sourceDiagram();
  const proposal = createBoardAutoOrganizeProposal(original);

  assert.equal(hasSameBoardAutoOrganizeSemantics(original, proposal.diagram), true);
  assert.equal(
    proposal.changes.every(({ kind }) => kind === "geometry" || kind === "edge-routing"),
    true
  );
});

test("Board 의미 비교는 Resource와 관계 배열 순서에 의존하지 않는다", () => {
  const original = sourceDiagram();
  original.edges.push({
    id: "health-check",
    sourceNodeId: "service",
    targetNodeId: "vpc",
    label: "health check"
  });
  const reordered = structuredClone(original);
  reordered.nodes.reverse();
  reordered.edges.reverse();

  assert.equal(hasSameBoardAutoOrganizeSemantics(original, reordered), true);
});

test("Board 자동 정리 경계는 Resource·관계·설정·영역 소속을 원본 그대로 보존한다", () => {
  const original = sourceDiagram();
  const originalSnapshot = structuredClone(original);
  const constrained = constrainBoardAutoOrganizeProposal(original, maliciousProposal(original));

  assert.equal(hasSameBoardAutoOrganizeSemantics(original, constrained.diagram), true);
  assert.deepEqual(original, originalSnapshot);
  assert.deepEqual(constrained.diagram.nodes.map(({ id }) => id), ["vpc", "service"]);
  assert.deepEqual(constrained.diagram.edges.map(({ id }) => id), ["traffic"]);
  assert.equal(constrained.diagram.nodes[1]?.label, "API Service");
  assert.equal(constrained.diagram.nodes[1]?.metadata?.parentAreaNodeId, "vpc");
  assert.deepEqual(constrained.diagram.nodes[1]?.parameters?.values, { desired_count: 2 });
  assert.equal(constrained.diagram.edges[0]?.targetNodeId, "service");
  assert.equal(constrained.diagram.edges[0]?.label, "request");
  assert.deepEqual(constrained.diagram.variables, original.variables);
  assert.deepEqual(constrained.diagram.viewport, original.viewport);
  assert.deepEqual(constrained.diagram.presentation, original.presentation);
  assert.deepEqual(constrained.changes.map(({ kind }) => kind), ["geometry", "edge-routing"]);
});

test("Board 자동 정리는 같은 Resource의 좌표·크기와 같은 관계의 경로만 채택한다", () => {
  const original = sourceDiagram();
  const candidate = maliciousProposal(original);
  candidate.diagram.edges[0] = {
    ...candidate.diagram.edges[0]!,
    sourceNodeId: "vpc",
    targetNodeId: "service"
  };

  const constrained = constrainBoardAutoOrganizeProposal(original, candidate);

  assert.deepEqual(constrained.diagram.nodes[1]?.position, { x: 240, y: 180 });
  assert.deepEqual(constrained.diagram.nodes[1]?.size, { width: 96, height: 72 });
  assert.deepEqual(constrained.diagram.edges[0]?.route, {
    ...candidate.diagram.edges[0]?.route,
    arrowDirection: "source-to-target"
  });
  assert.equal(hasSameBoardAutoOrganizeSemantics(original, constrained.diagram), true);
});

test("연결선 경로를 바꿔도 원래 관계의 화살표 방향은 유지한다", () => {
  const original = sourceDiagram();
  const candidate = maliciousProposal(original);
  candidate.diagram.edges[0] = {
    ...candidate.diagram.edges[0]!,
    sourceNodeId: "vpc",
    targetNodeId: "service",
    route: {
      ...candidate.diagram.edges[0]!.route!,
      arrowDirection: "target-to-source"
    }
  };

  const constrained = constrainBoardAutoOrganizeProposal(original, candidate);

  assert.equal(constrained.diagram.edges[0]?.route?.arrowDirection, "source-to-target");
});

test("관계의 양 끝이 바뀐 후보 경로는 원래 관계에 적용하지 않는다", () => {
  const original = sourceDiagram();
  const constrained = constrainBoardAutoOrganizeProposal(original, maliciousProposal(original));

  assert.deepEqual(constrained.diagram.edges[0]?.route, original.edges[0]?.route);
});

test("Board 자동 정리 경계는 잠긴 자동 프레임과 사용자 그룹을 보존하고 full-tuple 프레임만 받는다", () => {
  const original = sourceDiagram();
  const lockedFrame = autoFrame("board-auto-frame:locked", true);
  const staleFrame = autoFrame("board-auto-frame:stale", false);
  const prefixOnlyUserFrame = {
    ...autoFrame("board-auto-frame:user", false),
    metadata: { presentationCatalogItemId: "design-region" },
    label: "사용자 그룹"
  };
  original.nodes.push(lockedFrame, staleFrame, prefixOnlyUserFrame);
  const candidate = maliciousProposal(original);
  const newOwnedFrame = autoFrame("board-auto-frame:new", false);
  candidate.diagram.nodes.push(newOwnedFrame);

  const constrained = constrainBoardAutoOrganizeProposal(original, candidate);

  assert.deepEqual(
    constrained.diagram.nodes.find((node) => node.id === lockedFrame.id),
    lockedFrame
  );
  assert.deepEqual(
    constrained.diagram.nodes.find((node) => node.id === prefixOnlyUserFrame.id),
    prefixOnlyUserFrame
  );
  assert.equal(
    constrained.diagram.nodes.some((node) => node.id === staleFrame.id),
    false
  );
  assert.equal(
    constrained.diagram.nodes.some((node) => node.id === newOwnedFrame.id),
    true
  );
  assert.equal(hasSameBoardAutoOrganizeSemantics(original, constrained.diagram), true);
});

/** presentation까지 원본 그대로 지켜야 하는 자동 정리 fixture를 만듭니다. */
function sourceDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "vpc",
        type: "aws_vpc",
        kind: "resource",
        position: { x: 40, y: 40 },
        size: { width: 480, height: 320 },
        label: "Main VPC",
        locked: false,
        zIndex: 0,
        metadata: { presentationArea: true },
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main.tf",
          values: { cidr_block: "10.0.0.0/16" }
        }
      },
      {
        id: "service",
        type: "aws_ecs_service",
        kind: "resource",
        position: { x: 120, y: 120 },
        size: { width: 48, height: 48 },
        label: "API Service",
        locked: false,
        zIndex: 2,
        metadata: { parentAreaNodeId: "vpc" },
        parameters: {
          resourceType: "aws_ecs_service",
          resourceName: "api",
          fileName: "service.tf",
          values: { desired_count: 2 }
        }
      }
    ],
    edges: [
      {
        id: "traffic",
        sourceNodeId: "vpc",
        targetNodeId: "service",
        label: "request",
        style: { lineStyle: "solid" },
        route: {
          svgPath: "M 40 40 L 120 120",
          sourcePoint: { x: 40, y: 40 },
          targetPoint: { x: 120, y: 120 },
          waypoints: [],
          arrowDirection: "source-to-target"
        }
      }
    ],
    viewport: { x: 11, y: 22, zoom: 0.8 },
    variables: [
      {
        id: "desired",
        name: "desired_count",
        type: "number",
        value: 2,
        bindings: [{ nodeId: "service", parameterKey: "desired_count" }],
        source: "user"
      }
    ],
    presentation: {
      geometryPolicy: "source-exact",
      initialViewportPending: true,
      sourceViewBox: { x: -100, y: -80, width: 800, height: 600 },
      terraformSourceFingerprint: "source-fingerprint"
    }
  };
}

function maliciousProposal(original: DiagramJson): ArchitectureBoardCompilationProposal {
  const changedService = {
    ...structuredClone(original.nodes[1]!),
    type: "aws_lambda_function",
    label: "Replaced Function",
    position: { x: 240, y: 180 },
    size: { width: 96, height: 72 },
    metadata: { parentAreaNodeId: "other-vpc" },
    parameters: {
      resourceType: "aws_lambda_function",
      resourceName: "replacement",
      fileName: "replacement.tf",
      values: { runtime: "nodejs22.x" }
    }
  };

  return {
    architecture: { nodes: [], edges: [] },
    diagram: {
      nodes: [
        changedService,
        {
          ...changedService,
          id: "injected",
          label: "Injected Resource",
          position: { x: 700, y: 700 }
        }
      ],
      edges: [
        {
          ...structuredClone(original.edges[0]!),
          targetNodeId: "injected",
          label: "replaced relationship",
          style: { lineStyle: "dotted" },
          route: {
            svgPath: "M 40 40 L 240 180",
            sourcePoint: { x: 40, y: 40 },
            targetPoint: { x: 240, y: 180 },
            waypoints: [{ x: 120, y: 80 }],
            arrowDirection: "target-to-source"
          }
        },
        { id: "injected-edge", sourceNodeId: "service", targetNodeId: "injected" }
      ],
      viewport: { x: 999, y: 999, zoom: 0.1 },
      variables: [],
      presentation: { geometryPolicy: "catalog-normalized" }
    },
    changes: [
      change("resource"),
      change("relationship"),
      change("configuration"),
      change("containment"),
      change("presentation"),
      change("geometry"),
      change("edge-routing")
    ],
    diagnostics: [],
    quality: {
      before: {
        score: 10,
        visualPenalty: 10,
        structuralPenalty: 0,
        semanticDiagnosticPenalty: 0,
        metrics: {}
      },
      after: {
        score: 1,
        visualPenalty: 1,
        structuralPenalty: 0,
        semanticDiagnosticPenalty: 0,
        metrics: {}
      },
      compilationDistance: 99
    },
    provenance: {
      compilerVersion: "internal-version",
      candidateId: "internal-candidate",
      referenceTemplateIds: ["internal-template"]
    }
  };
}

function change(
  kind: ArchitectureBoardCompilationProposal["changes"][number]["kind"]
): ArchitectureBoardCompilationProposal["changes"][number] {
  return {
    id: `change:${kind}`,
    kind,
    action: "modify",
    targetIds: ["service"],
    before: null,
    after: null,
    summary: kind,
    cost: 1
  };
}

/** Board 자동 정리 소유권 테스트용 full-tuple 프레임을 만듭니다. */
function autoFrame(id: string, locked: boolean): DiagramJson["nodes"][number] {
  return {
    id,
    type: "design_group",
    kind: "design",
    position: { x: 20, y: 20 },
    size: { width: 300, height: 180 },
    label: "자동 표시 영역",
    locked,
    zIndex: 0,
    metadata: { presentationCatalogItemId: "design-group" }
  };
}
