import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import { createTerraformValidationDiagnostics } from "../../../api/src/services/terraform/terraform-diagnostics.js";
import { generateTerraformFromDiagramJson } from "../../../api/src/services/terraform/terraform-preview.js";
import { syncTerraformToDiagramJson } from "../../../api/src/services/terraform/terraform-to-diagram.js";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import { resourceCatalog } from "../resource-settings/catalog";
import { createTerraformFilesFromGeneratedCode } from "./terraform-panel-utils";

test("all generated palette defaults pass editor validation and diagram sync", () => {
  const failures: Array<{
    readonly diagnostics: readonly string[];
    readonly resourceId: string;
  }> = [];
  let generatedResourceCount = 0;

  for (const item of resourceCatalog.filter((candidate) => candidate.enabled)) {
    const node = createDiagramNodeFromPayload(
      { source: "resource-settings-panel", item },
      { x: 0, y: 0 },
      1
    );
    const diagramJson: DiagramJson = {
      nodes: [node],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    };
    const terraformCode = generateTerraformFromDiagramJson(diagramJson);

    if (!terraformCode.trim()) {
      continue;
    }

    generatedResourceCount += 1;
    const files = createTerraformFilesFromGeneratedCode(diagramJson, terraformCode);
    const terraformFiles = files.map((file) => ({
      fileName: file.fileName,
      terraformCode: file.code
    }));
    const validationDiagnostics = createTerraformValidationDiagnostics({
      terraformCode: "",
      terraformFiles
    });
    const syncDiagnostics = syncTerraformToDiagramJson(diagramJson, {
      terraformCode: "",
      terraformFiles
    }).diagnostics;
    const diagnostics = [
      ...validationDiagnostics.map(
        (diagnostic) =>
          `validate:${diagnostic.sourceFileName ?? "main.tf"}:${diagnostic.line ?? 0}:${diagnostic.code ?? diagnostic.message}`
      ),
      ...syncDiagnostics.map(
        (diagnostic) =>
          `sync:${diagnostic.sourceFileName ?? "main.tf"}:${diagnostic.line ?? 0}:${diagnostic.code ?? diagnostic.message}`
      )
    ];

    if (diagnostics.length > 0) {
      failures.push({ resourceId: item.id, diagnostics });
    }
  }

  assert.ok(generatedResourceCount > 0, "Expected at least one palette resource to generate Terraform");
  assert.deepEqual(failures, []);
});
