import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import {
  projectDraftQuerySchema,
  saveProjectDraftBodySchema
} from "./project-draft-schemas.js";

const validDiagram: DiagramJson = {
  nodes: [
    {
      id: "node-1",
      type: "aws_instance",
      kind: "resource",
      position: { x: 120, y: 80 },
      size: { width: 168, height: 96 },
      label: "EC2 Instance",
      iconUrl: "/icons/ec2.svg",
      locked: false,
      zIndex: 1,
      style: {
        textColor: "#172033",
        borderColor: "#2f6db3"
      },
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_instance",
        resourceName: "ec2_instance",
        fileName: "main",
        values: {
          instanceType: "t3.micro"
        }
      }
    }
  ],
  edges: [
    {
      id: "edge-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      type: "smoothstep",
      style: {
        color: "#506176",
        width: "medium",
        animated: false
      }
    }
  ],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

test("project draft query accepts an optional workspace id", () => {
  assert.equal(projectDraftQuerySchema.safeParse({}).success, true);
  assert.equal(
    projectDraftQuerySchema.safeParse({ clientGeneratedWorkspaceId: "local-browser-1" }).success,
    true
  );
});

test("save project draft body accepts full DiagramJson", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    clientGeneratedWorkspaceId: "local-browser-1",
    diagramJson: validDiagram
  });

  assert.equal(parsed.diagramJson.nodes[0]?.parameters?.values.instanceType, "t3.micro");
  assert.equal(parsed.diagramJson.viewport.zoom, 1);
});

test("save project draft body rejects architecture-only json without viewport", () => {
  const result = saveProjectDraftBodySchema.safeParse({
    clientGeneratedWorkspaceId: "local-browser-1",
    diagramJson: {
      nodes: [],
      edges: []
    }
  });

  assert.equal(result.success, false);
});
