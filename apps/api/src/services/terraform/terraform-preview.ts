import type { DiagramJson } from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";
import {
  SKETCHCATCH_REFERENCE_TERRAFORM_CODE,
  SKETCHCATCH_REFERENCE_TERRAFORM_MARKER
} from "./sketchcatch-reference-terraform-code.js";

export function generateTerraformFromDiagramJson(diagramJson: DiagramJson): string {
  if (hasSketchCatchReferenceTerraformMarker(diagramJson)) {
    return SKETCHCATCH_REFERENCE_TERRAFORM_CODE;
  }

  const graph = buildInfrastructureGraphFromDiagramJson(diagramJson);

  return renderTerraformFromInfrastructureGraph(graph);
}

function hasSketchCatchReferenceTerraformMarker(diagramJson: DiagramJson): boolean {
  return diagramJson.nodes.some(
    (node) =>
      node.parameters?.values["sketchcatchReferenceTerraform"] ===
      SKETCHCATCH_REFERENCE_TERRAFORM_MARKER
  );
}
