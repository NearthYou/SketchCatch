import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import { ARCHITECTURE_BOARD_KNOWLEDGE_VERSION } from "./architecture-board-knowledge-contract";
import type { ArchitectureBoardKnowledgeArtifact } from "./architecture-board-knowledge-contract";
import {
  deriveArchitectureBoardKnowledgeLayoutProfiles,
  evaluateArchitectureBoardKnowledgeQuality
} from "./architecture-board-knowledge-policy";

const diagram: DiagramJson = {
  nodes: [
    {
      id: "api",
      type: "API_GATEWAY_REST_API",
      kind: "resource",
      label: "API",
      locked: false,
      position: { x: 0, y: 0 },
      size: { width: 48, height: 48 },
      zIndex: 100
    },
    {
      id: "function",
      type: "LAMBDA",
      kind: "resource",
      label: "Function",
      locked: false,
      position: { x: 240, y: 0 },
      size: { width: 48, height: 48 },
      zIndex: 100
    }
  ],
  edges: [{ id: "api-function", sourceNodeId: "api", targetNodeId: "function" }],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("knowledge 사례가 바뀌면 같은 Board의 사례 기반 품질 비용도 바뀐다", () => {
  const compact = evaluateArchitectureBoardKnowledgeQuality(
    diagram,
    createArtifact({ id: "compact", meanSiblingGap: 64, viewportAspectRatio: 5 })
  );
  const spacious = evaluateArchitectureBoardKnowledgeQuality(
    diagram,
    createArtifact({ id: "spacious", meanSiblingGap: 320, viewportAspectRatio: 1 })
  );

  assert.equal(compact.referenceTemplateIds[0], "compact");
  assert.equal(spacious.referenceTemplateIds[0], "spacious");
  assert.notEqual(compact.penalty, spacious.penalty);
});

test("knowledge policy는 가장 가까운 사례의 간격을 bounded layout profile로 만든다", () => {
  const profiles = deriveArchitectureBoardKnowledgeLayoutProfiles(
    diagram,
    createArtifact({
      id: "wide-reference",
      meanSiblingGap: 999,
      meanVerticalGap: 1
    })
  );

  assert.deepEqual(profiles, [
    {
      id: "knowledge:wide-reference",
      referenceTemplateId: "wide-reference",
      columnGap: 160,
      rowGap: 24
    }
  ]);
});

function createArtifact(
  overrides: Partial<ArchitectureBoardKnowledgeArtifact["cases"][number]> & { readonly id: string }
): ArchitectureBoardKnowledgeArtifact {
  const { id, ...caseOverrides } = overrides;

  return {
    version: ARCHITECTURE_BOARD_KNOWLEDGE_VERSION,
    hash: `test-${id}`,
    unavailableTemplateIds: [],
    cases: [
      {
        id,
        nodeTypes: ["API_GATEWAY_REST_API", "LAMBDA"],
        nodeCount: 2,
        edgeCount: 1,
        areaCount: 0,
        parentedNodeCount: 0,
        maxContainmentDepth: 0,
        meanAreaChildDensity: 0,
        meanAreaPadding: 0,
        meanSiblingGap: 128,
        meanVerticalGap: 0,
        meanNodeWidth: 48,
        meanNodeHeight: 48,
        meanAspectRatio: 1,
        meanCaptionWidth: 40,
        meanZIndex: 100,
        meanEdgeLength: 240,
        meanEdgeWaypointCount: 0,
        routedEdgeRatio: 0,
        horizontalFlowRatio: 1,
        supportNodeRatio: 0,
        viewportAspectRatio: 5,
        whitespaceRatio: 0.8,
        ...caseOverrides
      }
    ]
  };
}
