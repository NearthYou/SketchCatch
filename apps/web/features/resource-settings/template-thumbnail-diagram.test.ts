import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { brainboardFailedCaptureEvidence } from "../../../../packages/types/src";
import { isBoardTemplateAvailable, listBoardTemplates } from "./template-library";
import { createTemplateThumbnailDiagram } from "./template-thumbnail-diagram";

const currentDir = dirname(fileURLToPath(import.meta.url));
const pagePath = join(currentDir, "../../app/dev/template-thumbnail/page.tsx");
const captureClientPath = join(
  currentDir,
  "../../app/dev/template-thumbnail/template-thumbnail-capture-client.tsx"
);
const pageSource = readFileSync(pagePath, "utf8");
const captureClientSource = readFileSync(captureClientPath, "utf8");

test("Template thumbnail diagrams expose all 29 available Templates without creating projects", () => {
  const availableTemplates = listBoardTemplates().filter(isBoardTemplateAvailable);
  assert.equal(availableTemplates.length, 29);

  for (const template of availableTemplates) {
    const diagram = createTemplateThumbnailDiagram(template.id);
    assert.deepEqual(diagram, template.diagramJson, template.id);
    assert.notStrictEqual(diagram, template.diagramJson, `${template.id} should be cloned`);
  }

  assert.equal(createTemplateThumbnailDiagram(brainboardFailedCaptureEvidence.id), null);
  assert.equal(createTemplateThumbnailDiagram("unknown-template"), null);
});

test("Template thumbnail route is dev-only and captures the real DiagramEditor at 1280 by 720", () => {
  assert.match(pageSource, /process\.env\.NODE_ENV === "production"/);
  assert.match(pageSource, /createTemplateThumbnailDiagram\(templateId\)/);
  assert.match(pageSource, /if \(!diagram\)\s*\{\s*notFound\(\);\s*\}/s);
  assert.match(pageSource, /if \(Array\.isArray\(value\)\) return undefined;/);
  assert.doesNotMatch(pageSource, /createProject|prisma|fetch\(|\/api\//);

  assert.match(captureClientSource, /<DiagramEditor/);
  assert.match(captureClientSource, /mode="viewer"/);
  assert.match(captureClientSource, /initialDiagram=\{diagram\}/);
  assert.match(captureClientSource, /initialPreviewDiagram=\{diagram\}/);
  assert.match(captureClientSource, /rightPanel=\{null\}/);
  assert.match(captureClientSource, /showSaveAction=\{false\}/);
  assert.match(captureClientSource, /captureActualBoardElement\(element\)/);
  assert.match(captureClientSource, /const THUMBNAIL_WIDTH = 1280/);
  assert.match(captureClientSource, /const THUMBNAIL_HEIGHT = 720/);
  assert.match(captureClientSource, /data-template-thumbnail-ready="true"/);
  assert.match(captureClientSource, /data-template-thumbnail-error="true"/);
  assert.match(captureClientSource, /data:image\/webp;base64,/);
});
