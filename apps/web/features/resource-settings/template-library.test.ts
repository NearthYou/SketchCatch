import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "../../../../packages/types/src";
import { TEMPLATE_IDS, templateDefinitions } from "../../../../packages/types/src";
import { buildTemplateDiagramJson } from "../../../../packages/types/src/template-definitions";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import { resourceCatalog } from "./catalog";
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

test("all board templates reuse the Resource catalog node presentation", () => {
  for (const template of listBoardTemplates()) {
    const definition = templateDefinitions.find((candidate) => candidate.id === template.id);
    assert.ok(definition, `missing Template definition for ${template.id}`);
    const rawDiagram = buildTemplateDiagramJson(definition.id, {
      projectSlug: "sketchcatch",
      shortId: template.id
    });

    for (const node of template.diagramJson.nodes) {
      const catalogItem = resourceCatalog.find((item) => item.nodeDefaults.type === node.type);
      assert.ok(catalogItem, `missing Resource catalog item for ${node.type}`);
      const rawNode = rawDiagram.nodes.find((candidate) => candidate.id === node.id);
      assert.ok(rawNode?.parameters, `missing raw Template parameters for ${template.id}:${node.id}`);

      const catalogNode = createDiagramNodeFromPayload(
        { item: catalogItem, source: "resource-settings-panel" },
        node.position,
        node.zIndex
      );
      const diagramLabel = node.parameters?.values.diagramLabel;

      assert.equal(node.iconUrl, catalogNode.iconUrl, `${template.id}:${node.id} icon`);
      assert.equal(node.label, catalogNode.label, `${template.id}:${node.id} label`);
      assert.deepEqual(node.size, catalogNode.size, `${template.id}:${node.id} size`);
      assert.deepEqual(node.style, catalogNode.style, `${template.id}:${node.id} style`);
      assert.equal(
        diagramLabel,
        catalogNode.parameters?.resourceName,
        `${template.id}:${node.id} visible label`
      );
      assert.deepEqual(
        node.parameters,
        {
          ...catalogNode.parameters,
          ...rawNode.parameters,
          values: {
            ...catalogNode.parameters?.values,
            ...rawNode.parameters.values,
            diagramLabel
          }
        },
        `${template.id}:${node.id} catalog parameter behavior`
      );
      assert.ok(typeof diagramLabel === "string");
      assert.doesNotMatch(diagramLabel, /_workspace$/u);
    }
  }
});

test("buildBoardTemplateDiagram selects a shared template for Workspace startup", () => {
  const diagram = buildBoardTemplateDiagram("minimal-serverless-api", {
    projectSlug: "orders",
    shortId: "workspace"
  });

  assert.equal(
    diagram?.nodes.length,
    templateDefinitions.find((definition) => definition.id === "minimal-serverless-api")?.resources.length
  );
  assert.ok(diagram?.nodes.every((node) => node.parameters?.resourceName?.startsWith("orders_")));
  assert.ok(diagram?.nodes.every((node) => typeof node.iconUrl === "string"));
  assert.ok(diagram?.nodes.every((node) => typeof node.parameters?.values.diagramLabel === "string"));
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
