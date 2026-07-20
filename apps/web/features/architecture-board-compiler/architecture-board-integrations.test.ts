import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptBrainboardTemplateSource,
  brainboardTemplateRegistry,
  buildTemplateDiagramJson,
  templateDefinitions,
  type AiArchitectureDraftResult,
  type DiagramJson,
  type ReverseEngineeringScanResult
} from "@sketchcatch/types";
import {
  ARCHITECTURE_BOARD_COMPILER_VERSION,
  compileArchitectureDraftProposal,
  createBoardAutoOrganizeCandidates,
  createBoardAutoOrganizeProposal,
  reviewArchitectureBoardTemplate
} from ".";
import { createReverseEngineeringBoardApplication } from "../workspace/reverse-engineering-board-application";

test("AI Draft와 Board 자동 정리는 같은 Compiler version의 proposal을 만든다", () => {
  const diagram = buildTemplateDiagramJson("minimal-serverless-api", {
    projectSlug: "compiler-test",
    shortId: "compiler-test"
  });
  const architectureJson = {
    nodes: diagram.nodes.flatMap((node) =>
      node.kind === "resource"
        ? [{ id: node.id, type: "UNKNOWN" as const, label: node.label, positionX: node.position.x, positionY: node.position.y, config: {} }]
        : []
    ),
    edges: []
  };
  const draft: AiArchitectureDraftResult = {
    architectureJson,
    title: "Compiler test",
    metadata: {
      assumptions: [],
      confidence: "low",
      explanations: [],
      guardrailWarnings: [],
      source: "prompt"
    }
  };

  assert.equal(
    compileArchitectureDraftProposal(draft, diagram).provenance.compilerVersion,
    ARCHITECTURE_BOARD_COMPILER_VERSION
  );
  assert.equal(
    createBoardAutoOrganizeProposal(diagram).provenance.compilerVersion,
    ARCHITECTURE_BOARD_COMPILER_VERSION
  );

  const exactDraft = {
    ...draft,
    diagramJson: { ...diagram, presentation: { geometryPolicy: "source-exact" as const } }
  };
  assert.equal(
    compileArchitectureDraftProposal(exactDraft).provenance.compilerVersion,
    ARCHITECTURE_BOARD_COMPILER_VERSION
  );
});

test("source-exact Template도 Workspace 자동 정리에서는 원본을 보존한 compiled proposal을 만든다", () => {
  const source = brainboardTemplateRegistry.find((entry) => entry.status === "available")?.source;

  assert.ok(source);
  if (!source) return;

  const diagram = adaptBrainboardTemplateSource(source).diagramJson;
  const before = structuredClone(diagram);
  const proposal = createBoardAutoOrganizeProposal(diagram);

  assert.deepEqual(diagram, before);
  assert.ok(proposal.provenance.candidateId.startsWith("compiled:"));
  assert.ok(proposal.changes.length > 0);
});

test("Template review는 29개 usable 사례를 모두 검토하고 source-exact 원본을 보존한다", () => {
  const authored = templateDefinitions.map((definition) =>
    buildTemplateDiagramJson(definition.id, { projectSlug: "review", shortId: definition.id })
  );
  const captured = brainboardTemplateRegistry.flatMap((entry) =>
    entry.status === "available" ? [adaptBrainboardTemplateSource(entry.source).diagramJson] : []
  );
  const capturedBefore = captured.map((diagram) => structuredClone(diagram));
  const diagrams: DiagramJson[] = [...authored, ...captured];
  const proposals = diagrams.map(reviewArchitectureBoardTemplate);

  assert.equal(proposals.length, 29);
  assert.ok(
    proposals.every(
      ({ provenance }) => provenance.compilerVersion === ARCHITECTURE_BOARD_COMPILER_VERSION
    )
  );
  captured.forEach((source, index) => {
    const proposal = proposals[authored.length + index];

    assert.deepEqual(source, capturedBefore[index]);
    assert.ok(proposal?.provenance.candidateId.startsWith("compiled:"));
    assert.ok(proposal?.changes.length);
    assert.notDeepEqual(proposal?.diagram, source);
  });
});

test("Reverse Engineering도 shared visual-only 정리안 interface를 사용한다", () => {
  const result: ReverseEngineeringScanResult = {
    scan: {
      id: "scan-1",
      projectId: "project-1",
      awsConnectionId: "connection-1",
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: [],
      status: "completed",
      startedAt: null,
      completedAt: null,
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    },
    architectureJson: {
      nodes: [
        {
          id: "bucket-1",
          type: "S3",
          label: "Bucket 1",
          positionX: 0,
          positionY: 0,
          config: { providerResourceId: "bucket-1" }
        },
        {
          id: "bucket-2",
          type: "S3",
          label: "Bucket 2",
          positionX: 0,
          positionY: 0,
          config: { providerResourceId: "bucket-2" }
        }
      ],
      edges: []
    },
    reverseEngineeringDraft: {
      id: "draft-1",
      scanId: "scan-1",
      architectureJson: { nodes: [], edges: [] },
      protectedValueKeys: [],
      editableValueKeys: [],
      createdAt: "2026-07-15T00:00:00.000Z"
    },
    discoveredResources: [],
    findings: [],
    analysisExclusions: [],
    importSuggestions: [],
    scanErrors: []
  };
  const original = createReverseEngineeringBoardApplication({
    currentDiagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    mode: "replace",
    placement: "original",
    result
  });
  const candidateSet = createBoardAutoOrganizeCandidates(original.diagram);
  const selected = candidateSet.candidates[0];

  assert.ok(selected);

  const application = createReverseEngineeringBoardApplication({
    currentDiagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    mode: "replace",
    organizedDiagram: selected.diagram,
    placement: "compiled",
    result
  });

  assert.equal(application.compilation, null);
  assert.deepEqual(application.diagram, selected.diagram);
  assert.match(selected.id, /^arrangement-/);
});
