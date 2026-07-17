import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import { assertDraftTerraformDoesNotIncludeAnalysisExcludedResource } from "./deployment-preparation-service.js";

const excludedDiagram: DiagramJson = {
  nodes: [
    {
      id: "legacy-lambda",
      type: "aws_lambda_function",
      kind: "resource",
      label: "Legacy Lambda",
      position: { x: 0, y: 0 },
      size: { width: 120, height: 80 },
      locked: false,
      zIndex: 1,
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda",
        fileName: "compute.tf",
        values: { analysisExcluded: true }
      }
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("does not treat a commented excluded Lambda as a deployable block when a supported VPC exists", () => {
  assert.doesNotThrow(() =>
    assertDraftTerraformDoesNotIncludeAnalysisExcludedResource({
      revision: 1,
      diagramJson: excludedDiagram,
      terraformFiles: [
        {
          fileName: "main.tf",
          terraformCode: `/* resource "aws_lambda_function" "legacy_lambda" {} */
// resource "aws_lambda_function" "legacy_lambda" {}
resource "aws_vpc" "main" {}`
        }
      ]
    })
  );
});
