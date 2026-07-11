import type { DiagramNode } from "../../../../packages/types/src";

type ResourceNodeLabelInput = Pick<DiagramNode, "label" | "parameters" | "type">;

export function getResourceNodeDisplayLabel(node: ResourceNodeLabelInput): string {
  const diagramLabel = node.parameters?.values["diagramLabel"];
  const candidate =
    typeof diagramLabel === "string" && diagramLabel.trim().length > 0
      ? diagramLabel
      : node.label.trim().length > 0
        ? node.label
        : node.type;

  return candidate.trim().toLocaleUpperCase();
}
