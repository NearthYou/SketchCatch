import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import {
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";

const diagramJson: DiagramJson = {
  edges: [],
  nodes: [
    {
      id: "vpc-main",
      kind: "resource",
      label: "Main VPC",
      locked: false,
      parameters: {
        fileName: "main",
        resourceName: "main",
        resourceType: "aws_vpc",
        terraformBlockType: "resource",
        values: {
          cidrBlock: "10.0.0.0/16"
        }
      },
      position: { x: 20, y: 40 },
      size: { width: 180, height: 96 },
      type: "aws_vpc",
      zIndex: 1
    }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("createWorkspaceAiBoardSnapshot returns analysis input and board fingerprint together", () => {
  const snapshot = createWorkspaceAiBoardSnapshot(diagramJson);

  assert.equal(snapshot.architectureJson.nodes.length, 1);
  assert.equal(snapshot.hasResources, true);
  assert.equal(snapshot.fingerprint, JSON.stringify(diagramJson));
});

test("isWorkspaceAiResultStale only marks existing results stale after board changes", () => {
  const snapshot = createWorkspaceAiBoardSnapshot(diagramJson);

  assert.equal(isWorkspaceAiResultStale(null, snapshot.fingerprint), false);
  assert.equal(isWorkspaceAiResultStale(snapshot.fingerprint, snapshot.fingerprint), false);
  assert.equal(isWorkspaceAiResultStale("previous-board", snapshot.fingerprint), true);
});
