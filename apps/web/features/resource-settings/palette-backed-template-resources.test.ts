import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { DiagramJson } from "@sketchcatch/types";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import { isAreaNode, isNodeContainedByArea } from "../diagram-editor/area-nodes";
import { resourceCatalog } from "./catalog";
import { getBrainboardTemplateThumbnailAsset } from "./brainboard-template-thumbnail-manifest";
import { isBoardTemplateAvailable, listBoardTemplates } from "./template-library";
import { materializeCatalogResourceNodes } from "./template-resource-materializer";

const publicDirectoryPath = fileURLToPath(new URL("../../public", import.meta.url));

test("모든 available Template Resource는 enabled Palette item과 실제 icon asset을 사용한다", () => {
  const templates = listBoardTemplates().filter(isBoardTemplateAvailable);
  let sourceExactAutoScalingGroupCount = 0;
  let nonAreaResourceCount = 0;
  let resourceCount = 0;

  for (const template of templates) {
    for (const node of template.diagramJson.nodes) {
      if (node.kind === "design") {
        const catalogItemId = node.metadata?.presentationCatalogItemId;
        if (!catalogItemId) {
          assert.equal(node.type, "text", `${template.id}/${node.id} unknown Design primitive`);
          continue;
        }
        const catalogItem = resourceCatalog.find(({ id }) => id === catalogItemId);

        assert.ok(catalogItem, `${template.id}/${node.id} presentation Palette item`);
        assert.equal(catalogItem.enabled, true, `${template.id}/${catalogItem.id} is disabled`);
        assert.equal(node.iconUrl, catalogItem.iconUrl, `${template.id}/${node.id} icon`);
        assert.notEqual(node.label.trim(), "", `${template.id}/${node.id} empty Design label`);
        assert.equal(existsSync(`${publicDirectoryPath}${catalogItem.iconUrl}`), true);
        continue;
      }

      resourceCount += 1;
      const blockType = node.parameters?.terraformBlockType ?? "resource";
      const resourceType = node.parameters?.resourceType ?? node.type;
      const catalogItem = resourceCatalog.find(
        (candidate) =>
          (candidate.nodeDefaults.terraformBlockType ?? "resource") === blockType &&
          candidate.nodeDefaults.type === resourceType
      );
      const definition = getResourceDefinitionByTerraform(blockType, resourceType);

      assert.ok(catalogItem, `${template.id}/${blockType}/${resourceType}`);
      assert.equal(catalogItem.enabled, true, `${template.id}/${catalogItem.id} is disabled`);
      assert.equal(node.iconUrl, catalogItem.iconUrl, `${template.id}/${node.id} icon`);
      assert.equal(
        existsSync(`${publicDirectoryPath}${catalogItem.iconUrl}`),
        true,
        `${template.id}/${catalogItem.iconUrl}`
      );
      assert.equal(definition?.capabilities.terraformPreview, true, `${template.id}/${node.id}`);
      assert.equal(definition?.capabilities.terraformSync, true, `${template.id}/${node.id}`);

      if (!isAreaNode(node)) {
        nonAreaResourceCount += 1;
        assert.deepEqual(
          node.size,
          catalogItem.nodeDefaults.size,
          `${template.id}/${node.id} must use Palette resource geometry`
        );
      }

      if (resourceType === "aws_autoscaling_group") {
        if (template.diagramJson.presentation?.geometryPolicy === "source-exact") {
          sourceExactAutoScalingGroupCount += 1;
        }
        assert.equal(
          isAreaNode(node),
          false,
          `${template.id}/${node.id} must stay a Resource tile`
        );
      }
    }
  }

  assert.equal(templates.length, 29);
  assert.equal(sourceExactAutoScalingGroupCount, 3);
  assert.ok(nonAreaResourceCount > 0);
  assert.ok(resourceCount > 0);
});

// 캡처한 계정 Group은 실제 Palette Area로 유지하고 썸네일도 같은 Diagram을 가리켜야 한다.
test("Cross-account Template은 원본의 Group 영역과 세 S3 Resource만 사용한다", () => {
  const capturedAccountGroup = {
    id: "captured-account-group",
    kind: "design",
    label: "Prod account",
    locked: false,
    metadata: { presentationCatalogItemId: "design-group" },
    position: { x: 0, y: 0 },
    size: { height: 145, width: 495 },
    type: "brainboard_shape",
    zIndex: 1
  } satisfies DiagramJson["nodes"][number];
  assert.equal(isAreaNode(capturedAccountGroup), true);

  const template = listBoardTemplates().find(
    (candidate) => candidate.id === "brainboard-cross-account-aws-s3"
  );
  assert.ok(template && isBoardTemplateAvailable(template));

  const accountGroups = template.diagramJson.nodes.filter(
    (node) => node.metadata?.presentationCatalogItemId === "design-group"
  );
  assert.equal(accountGroups.length, 2);
  assert.deepEqual(
    accountGroups.map(({ label }) => label).sort(),
    ["Prod account", "Test account"]
  );
  assert.ok(accountGroups.every(isAreaNode));

  const accountIds = new Set(accountGroups.map(({ id }) => id));
  const scopedNodes = template.diagramJson.nodes.filter(
    (node) => node.metadata?.parentAreaNodeId && accountIds.has(node.metadata.parentAreaNodeId)
  );
  assert.deepEqual(
    scopedNodes.map(({ label }) => label).sort(),
    ["Prod", "S3 bucket Prod", "Test"]
  );
  assert.equal(
    template.diagramJson.nodes.some(
      (node) => node.kind === "design" && !node.metadata?.presentationCatalogItemId
    ),
    false
  );

  const thumbnail = getBrainboardTemplateThumbnailAsset("brainboard-cross-account-aws-s3");
  assert.equal(thumbnail.kind, "board-capture");
  assert.equal(
    thumbnail.diagramHash,
    createHash("sha256").update(JSON.stringify(template.diagramJson)).digest("hex")
  );
  assert.equal(existsSync(`${publicDirectoryPath}${thumbnail.src}`), true);
});

test("모든 available Template의 parented node는 materialization 후에도 parent Area 안에 남는다", () => {
  const templates = listBoardTemplates().filter(isBoardTemplateAvailable);

  assert.equal(templates.length, 29);

  for (const template of templates) {
    const nodeById = new Map(template.diagramJson.nodes.map((node) => [node.id, node]));

    for (const node of template.diagramJson.nodes) {
      const parentAreaNodeId = node.metadata?.parentAreaNodeId;
      if (!parentAreaNodeId) continue;
      const parent = nodeById.get(parentAreaNodeId);

      assert.ok(parent, `${template.id}/${node.id} missing parent ${parentAreaNodeId}`);
      assert.equal(isAreaNode(parent), true, `${template.id}/${parent.id} must be an Area`);
      assert.equal(
        isNodeContainedByArea(parent, node),
        true,
        `${template.id}/${node.id} must remain contained by ${parent.id}`
      );
    }
  }
});

test("non-Area Palette normalization preserves the authored center and invalidates stale edge geometry", () => {
  const diagram: DiagramJson = {
    nodes: [
      {
        id: "source",
        kind: "resource",
        label: "Source",
        locked: false,
        parameters: {
          fileName: "main",
          resourceName: "source",
          resourceType: "aws_lambda_function",
          terraformBlockType: "resource",
          values: {}
        },
        position: { x: 100, y: 200 },
        size: { width: 60, height: 60 },
        type: "aws_lambda_function",
        zIndex: 1
      },
      {
        id: "target",
        kind: "resource",
        label: "Target",
        locked: false,
        parameters: {
          fileName: "main",
          resourceName: "target",
          resourceType: "aws_s3_bucket",
          terraformBlockType: "resource",
          values: {}
        },
        position: { x: 300, y: 200 },
        size: { width: 48, height: 48 },
        type: "aws_s3_bucket",
        zIndex: 1
      }
    ],
    edges: [
      {
        id: "source-target",
        sourceHandleId: "right",
        sourceNodeId: "source",
        targetHandleId: "left",
        targetNodeId: "target",
        route: {
          svgPath: "M160,230 L300,224",
          sourcePoint: { x: 160, y: 230 },
          targetPoint: { x: 300, y: 224 },
          waypoints: []
        }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = materializeCatalogResourceNodes(diagram, { mode: "strict" });
  const source = result.nodes.find(({ id }) => id === "source");
  const edge = result.edges[0];

  assert.ok(source);
  assert.deepEqual(source.size, { width: 48, height: 48 });
  assert.deepEqual(source.position, { x: 106, y: 206 });
  assert.deepEqual(
    {
      x: source.position.x + source.size.width / 2,
      y: source.position.y + source.size.height / 2
    },
    { x: 130, y: 230 }
  );
  assert.ok(edge);
  assert.equal(edge.route, undefined);
  assert.equal(edge.sourceHandleId, undefined);
  assert.equal(edge.targetHandleId, undefined);
});
