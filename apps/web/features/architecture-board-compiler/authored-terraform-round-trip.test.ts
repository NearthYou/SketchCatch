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

test("source-exact authored Architecture Draft preserves captured Area geometry", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "captured-vpc",
        type: "aws_vpc",
        kind: "resource",
        position: { x: 240, y: 160 },
        size: { width: 1260, height: 720 },
        label: "captured-vpc",
        locked: false,
        zIndex: 3,
        parameters: {
          fileName: "main",
          resourceName: "captured_vpc",
          resourceType: "aws_vpc",
          terraformBlockType: "resource",
          values: {}
        }
      }
    ],
    edges: [],
    viewport: { x: 12, y: 24, zoom: 0.8 },
    presentation: { geometryPolicy: "source-exact" }
  };
  const draft: AiArchitectureDraftResult = {
    architectureJson: convertDiagramJsonToArchitectureJson(diagramJson),
    diagramJson,
    title: "Captured Board",
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
  const vpcNode = proposal.diagram.nodes[0];

  assert.ok(vpcNode);
  assert.deepEqual(vpcNode.position, diagramJson.nodes[0]?.position);
  assert.deepEqual(vpcNode.size, diagramJson.nodes[0]?.size);
  assert.deepEqual(proposal.diagram.viewport, diagramJson.viewport);
});