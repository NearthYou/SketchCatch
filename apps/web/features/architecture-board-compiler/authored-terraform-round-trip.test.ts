import assert from "node:assert/strict";
import test from "node:test";
import type { AiArchitectureDraftResult, DiagramJson } from "@sketchcatch/types";
import { compileArchitectureDraftProposal } from ".";
import { normalizeDiagramResourceNodeGeometry } from "../diagram-editor/resource-node-geometry";
import { convertDiagramJsonToArchitectureJson } from "../workspace/workspace-ai-diagram-adapter";

test("authored Architecture Draft materializes registered Resource catalog visuals", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "authored-secret",
        type: "aws_secretsmanager_secret",
        kind: "resource",
        position: { x: 40, y: 80 },
        size: { width: 124, height: 96 },
        label: "check_in_signing",
        locked: false,
        zIndex: 0,
        parameters: {
          fileName: "main",
          resourceName: "check_in_signing",
          resourceType: "aws_secretsmanager_secret",
          terraformBlockType: "resource",
          values: { name: "audience-live-check/signing" }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    presentation: { geometryPolicy: "catalog-normalized" }
  };
  const draft: AiArchitectureDraftResult = {
    architectureJson: convertDiagramJsonToArchitectureJson(diagramJson),
    diagramJson,
    title: "Audience Live Check",
    metadata: {
      source: "template_fallback",
      confidence: "high",
      assumptions: [],
      explanations: [],
      authoredSourceId: "audience-live-check",
      guardrailWarnings: []
    }
  };

  const proposal = compileArchitectureDraftProposal(draft);
  const appliedDiagram = normalizeDiagramResourceNodeGeometry(structuredClone(proposal.diagram));
  const secretNode = appliedDiagram.nodes[0];

  assert.equal(proposal.provenance.candidateId, "original");
  assert.ok(secretNode);
  assert.equal(
    secretNode.iconUrl,
    "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Secrets-Manager_64.svg"
  );
  assert.deepEqual(secretNode.size, { width: 48, height: 48 });
  assert.deepEqual(secretNode.parameters, diagramJson.nodes[0]?.parameters);
});
