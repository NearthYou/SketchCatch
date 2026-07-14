import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRAINBOARD_TEMPLATE_IDS,
  TEMPLATE_IDS,
  adaptBrainboardTemplateSource,
  brainboardTemplateRegistry,
  type DiagramJson,
  type TerraformSyncFileInput
} from "../../../../packages/types/src";
import { buildBoardTemplateDiagram, listBoardTemplates } from "./template-library";

type AvailableTemplate = {
  readonly availability: "available";
  readonly diagramJson: DiagramJson;
  readonly id: string;
  readonly sourceUrl?: string | undefined;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
  readonly thumbnailSrc?: string | undefined;
};

type UnavailableTemplate = {
  readonly availability: "unavailable";
  readonly id: string;
  readonly sourceUrl: string;
  readonly thumbnailSrc?: string | undefined;
  readonly unavailableReason: string;
};

type CatalogTemplate = AvailableTemplate | UnavailableTemplate;

test("Template catalog keeps the original six first and appends all 24 Brainboard entries in download order", () => {
  const templates = listBoardTemplates() as unknown as readonly CatalogTemplate[];

  assert.deepEqual(
    templates.map(({ id }) => id),
    [...TEMPLATE_IDS, ...BRAINBOARD_TEMPLATE_IDS]
  );
  assert.equal(templates.length, 30);
  assert.equal(templates.filter(({ availability }) => availability === "available").length, 29);
  assert.equal(templates.filter(({ availability }) => availability === "unavailable").length, 1);
});

test("every available Brainboard card preserves exact graph identity, geometry, routes, and Terraform workspace", () => {
  const templates = listBoardTemplates() as unknown as readonly CatalogTemplate[];

  for (const registryEntry of brainboardTemplateRegistry) {
    if (registryEntry.status !== "available") continue;

    const template = templates.find(({ id }) => id === registryEntry.id);
    assert.ok(template?.availability === "available", registryEntry.id);
    const expected = adaptBrainboardTemplateSource(registryEntry.source);

    assert.deepEqual(
      template.diagramJson.nodes.map(({ id }) => id),
      expected.diagramJson.nodes.map(({ id }) => id),
      registryEntry.id
    );
    assert.deepEqual(
      template.diagramJson.nodes.map(({ position, rotation, size, zIndex }) => ({
        position,
        rotation,
        size,
        zIndex
      })),
      expected.diagramJson.nodes.map(({ position, rotation, size, zIndex }) => ({
        position,
        rotation,
        size,
        zIndex
      })),
      registryEntry.id
    );
    assert.deepEqual(
      template.diagramJson.edges.map(
        ({ id, route, sourceHandleId, sourceNodeId, targetHandleId, targetNodeId, zIndex }) => ({
          id,
          route,
          sourceHandleId,
          sourceNodeId,
          targetHandleId,
          targetNodeId,
          zIndex
        })
      ),
      expected.diagramJson.edges.map(
        ({ id, route, sourceHandleId, sourceNodeId, targetHandleId, targetNodeId, zIndex }) => ({
          id,
          route,
          sourceHandleId,
          sourceNodeId,
          targetHandleId,
          targetNodeId,
          zIndex
        })
      ),
      registryEntry.id
    );
    assert.deepEqual(template.diagramJson.presentation, expected.diagramJson.presentation);
    assert.deepEqual(template.terraformFiles, expected.terraformFiles, registryEntry.id);
    assert.equal(template.sourceUrl, registryEntry.source.origin.sourceUrl);
    assert.match(template.thumbnailSrc ?? "", new RegExp(`${registryEntry.id}\\.webp$`, "u"));
  }
});

test("failed rank 12 remains a disabled preview-only card without invented Diagram or Terraform", () => {
  const templates = listBoardTemplates() as unknown as readonly CatalogTemplate[];
  const registryEntry = brainboardTemplateRegistry.find(
    ({ id }) => id === "brainboard-aws-instance-db-multiple-networks"
  );
  const template = templates.find(({ id }) => id === registryEntry?.id);

  assert.ok(registryEntry?.status === "unavailable");
  assert.ok(template?.availability === "unavailable");
  assert.equal(template.sourceUrl, registryEntry.evidence.origin.sourceUrl);
  assert.match(template.unavailableReason, /가져오지 못/u);
  assert.match(template.thumbnailSrc ?? "", /brainboard-aws-instance-db-multiple-networks\.webp$/u);
  assert.equal("diagramJson" in template, false);
  assert.equal("terraformFiles" in template, false);
});

test("buildBoardTemplateDiagram supports available Brainboard templates and rejects failed evidence", () => {
  const availableId = BRAINBOARD_TEMPLATE_IDS[0];
  const first = buildBoardTemplateDiagram(availableId, {
    projectSlug: "brainboard-qa",
    shortId: "first"
  });
  const second = buildBoardTemplateDiagram(availableId, {
    projectSlug: "brainboard-qa",
    shortId: "second"
  });

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  first.nodes[0]!.position.x += 999;
  assert.notEqual(first.nodes[0]!.position.x, second.nodes[0]!.position.x);
  assert.equal(
    buildBoardTemplateDiagram("brainboard-aws-instance-db-multiple-networks", {
      projectSlug: "brainboard-qa",
      shortId: "failed"
    }),
    undefined
  );
});
