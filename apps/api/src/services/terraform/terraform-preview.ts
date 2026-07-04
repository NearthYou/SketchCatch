import type { DiagramJson } from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

export function generateTerraformFromDiagramJson(diagramJson: DiagramJson): string {
  const graph = buildInfrastructureGraphFromDiagramJson(diagramJson);

  return renderTerraformFromInfrastructureGraph(graph);
}
