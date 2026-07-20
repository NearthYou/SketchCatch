import type { DiagramJson } from "@sketchcatch/types";
import { renderAuthoredTerraformArchitectureSource } from "../authoredTerraformArchitecturePresets.js";
import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

export function generateTerraformFromDiagramJson(diagramJson: DiagramJson): string {
  const authoredSource = renderAuthoredTerraformArchitectureSource(diagramJson);
  if (authoredSource !== undefined) {
    return authoredSource;
  }

  const graph = buildInfrastructureGraphFromDiagramJson(diagramJson);

  return renderTerraformFromInfrastructureGraph(graph);
}
