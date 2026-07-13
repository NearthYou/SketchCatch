import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import { restoreSavedDiagram } from "./workspace-draft-restore";

const fallbackDiagram: DiagramJson = {
  edges: [],
  nodes: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("saved DiagramJson keeps user-owned identity and layout during restore", () => {
  const savedDiagram: DiagramJson = {
    edges: [],
    nodes: [
      {
        id: "node-user-owned",
        type: "aws_instance",
        kind: "resource",
        position: { x: 412, y: 188 },
        size: { width: 124, height: 96 },
        label: "ec2_instance",
        locked: false,
        zIndex: 4,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: "ec2_instance",
          fileName: "main.tf",
          values: { instanceType: "t3.micro" }
        }
      }
    ],
    viewport: { x: -118, y: 74, zoom: 1.25 }
  };

  const restoredDiagram = restoreSavedDiagram(savedDiagram, fallbackDiagram);

  assert.strictEqual(restoredDiagram, savedDiagram);
  assert.deepEqual(restoredDiagram, savedDiagram);
});

test("workspace restore uses the fallback only when no saved DiagramJson exists", () => {
  assert.strictEqual(restoreSavedDiagram(undefined, fallbackDiagram), fallbackDiagram);
  assert.strictEqual(restoreSavedDiagram(null, fallbackDiagram), fallbackDiagram);
});

test("workspace restore repairs incomplete legacy records with required fallback fields", () => {
  const incompleteDiagram = {
    nodes: fallbackDiagram.nodes
  } as unknown as DiagramJson;

  assert.deepEqual(restoreSavedDiagram(incompleteDiagram, fallbackDiagram), fallbackDiagram);
});

test("workspace restore removes legacy automatic parameter-reference edges but keeps manual edges", () => {
  const savedDiagram: DiagramJson = {
    nodes: [],
    edges: [
      {
        id: "manual-edge",
        sourceNodeId: "asg",
        targetNodeId: "target-group"
      },
      {
        id: "parameter-reference:asg:targetGroupArns[0]:target-group",
        sourceNodeId: "asg",
        targetNodeId: "target-group",
        metadata: {
          managedBy: "parameter-reference",
          parameterPath: "targetGroupArns[0]"
        }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.deepEqual(restoreSavedDiagram(savedDiagram, fallbackDiagram).edges, [savedDiagram.edges[0]]);
});
