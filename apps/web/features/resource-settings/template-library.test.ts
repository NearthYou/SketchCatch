import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "../../../../packages/types/src";
import { TEMPLATE_IDS } from "../../../../packages/types/src";
import {
  applyTemplateToDiagramWithBackup,
  buildBoardTemplateDiagram,
  listBoardTemplates,
  readTemplateOverwriteBackups,
  TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY
} from "./template-library";

test("listBoardTemplates returns templates with DiagramJson so page and board modal can share them", () => {
  const templates = listBoardTemplates();

  assert.deepEqual(templates.map((template) => template.id), TEMPLATE_IDS);
  assert.ok(templates.every((template) => template.diagramJson.nodes.length > 0));
});

test("listBoardTemplates is backed by the deployable TemplateDefinition resources", () => {
  const templates = listBoardTemplates();

  assert.ok(templates.every((template) =>
    template.diagramJson.nodes.every((node) => node.parameters?.resourceName?.startsWith("sketchcatch_"))
  ));
  assert.ok(templates.find((template) => template.id === "eks-container-app")?.diagramJson.nodes.some(
    (node) => node.type === "kubernetes_deployment"
  ));
});

test("buildBoardTemplateDiagram selects a shared template for Workspace startup", () => {
  const diagram = buildBoardTemplateDiagram("minimal-serverless-api", {
    projectSlug: "orders",
    shortId: "workspace"
  });

  assert.equal(diagram?.nodes.length, 11);
  assert.ok(diagram?.nodes.every((node) => node.parameters?.resourceName?.startsWith("orders_")));
  assert.equal(buildBoardTemplateDiagram("unknown-template", {
    projectSlug: "orders",
    shortId: "workspace"
  }), undefined);
});

test("applyTemplateToDiagramWithBackup backs up the current board and returns the template board", () => {
  const storage = new FakeStorage();
  const currentDiagram = createDiagram("current-node");
  const template = listBoardTemplates()[0];
  assert.ok(template);

  const result = applyTemplateToDiagramWithBackup({
    currentDiagram,
    nowIso: "2026-07-07T06:00:00.000Z",
    storage,
    template
  });
  const backups = readTemplateOverwriteBackups(storage);

  assert.deepEqual(result, template.diagramJson);
  assert.equal(backups.length, 1);
  assert.equal(backups[0]?.templateId, template.id);
  assert.deepEqual(backups[0]?.diagramJson, currentDiagram);
  assert.ok(storage.getItem(TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY));
});

function createDiagram(nodeId: string): DiagramJson {
  return {
    nodes: [
      {
        id: nodeId,
        kind: "resource",
        label: nodeId,
        locked: false,
        position: { x: 0, y: 0 },
        size: { height: 120, width: 120 },
        type: "aws_instance",
        zIndex: 1
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
