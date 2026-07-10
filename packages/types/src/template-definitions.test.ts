import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  TEMPLATE_IDS,
  templateDefinitions,
  type TemplateId
} from "./template-definitions.js";

test("the template registry contains the six deployable AWS patterns", () => {
  assert.deepEqual(templateDefinitions.map((definition) => definition.id), [...TEMPLATE_IDS]);
  assert.equal(templateDefinitions.length, 6);
  assert.ok(templateDefinitions.every((definition) => definition.resources.length > 0));
  assert.ok(templateDefinitions.every((definition) => definition.relationships.length > 0));
});

test("each template builds a deterministic, connected DiagramJson", () => {
  for (const templateId of TEMPLATE_IDS) {
    const first = buildTemplateDiagramJson(templateId, {
      projectSlug: "sketchcatch",
      shortId: "test01"
    });
    const second = buildTemplateDiagramJson(templateId, {
      projectSlug: "sketchcatch",
      shortId: "test01"
    });

    assert.deepEqual(first, second, templateId);
    assert.ok(first.nodes.length > 0, templateId);
    assert.ok(first.nodes.every((node) => node.parameters), templateId);

    const nodeIds = new Set(first.nodes.map((node) => node.id));
    assert.ok(
      first.edges.every((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
      templateId
    );
    assert.ok(
      first.nodes.every((node) => node.parameters?.resourceName.startsWith("sketchcatch_")),
      templateId
    );
  }
});

test("template IDs are a closed union for registry lookup", () => {
  const templateId: TemplateId = "static-web-hosting";
  assert.equal(templateDefinitions.find((definition) => definition.id === templateId)?.id, templateId);
});
