import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import { compileArchitectureBoard } from ".";
import { expandCuratedModuleIntoDiagram } from "../resource-settings/module-catalog";
import { convertDiagramJsonToArchitectureJson } from "../workspace/workspace-ai-diagram-adapter";

test("Module 기반 자동 정리 후보도 현재 edge의 화살표 방향과 각도를 보존한다", () => {
  const expanded = expandCuratedModuleIntoDiagram({
    diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, variables: [] },
    moduleId: "container-runtime"
  });
  const authoredEdge = expanded.edges[0];
  assert.ok(authoredEdge);

  const authoredRoute = {
    svgPath: "M -999 -999 L -888 -888",
    sourcePoint: { x: -999, y: -999 },
    targetPoint: { x: -888, y: -888 },
    waypoints: [],
    arrowDirection: "bidirectional" as const,
    arrowAngle: 137
  };
  const currentDiagram: DiagramJson = {
    ...expanded,
    edges: expanded.edges.map((edge) =>
      edge.id === authoredEdge.id ? { ...edge, route: authoredRoute } : structuredClone(edge)
    ),
    presentation: { geometryPolicy: "source-exact" }
  };

  const proposal = compileArchitectureBoard({
    architecture: convertDiagramJsonToArchitectureJson(currentDiagram),
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.notEqual(proposal.provenance.candidateId, "original");
  assert.ok(proposal.provenance.modulePatternIds?.includes("container-runtime"));
  const compiledEdge = proposal.diagram.edges.find((edge) => edge.id === authoredEdge.id);
  assert.ok(compiledEdge?.route);
  assert.equal(compiledEdge.route.arrowDirection, "bidirectional");
  assert.equal(compiledEdge.route.arrowAngle, 137);
  assert.notEqual(compiledEdge.route.svgPath, authoredRoute.svgPath);
});
