import type { DiagramNode } from "../../../../packages/types/src";

import { getResourceNodeDisplayLabel } from "./resource-node-display-label";

export type ResourceNodeIconFamily = "fallback" | "group" | "resource" | "service";

export type ResourceNodePresentation = {
  icon: {
    family: ResourceNodeIconFamily;
  };
  label: string;
};

type ResourceNodePresentationInput = Pick<
  DiagramNode,
  "iconUrl" | "label" | "parameters" | "type"
>;

export function getResourceNodePresentation(
  node: ResourceNodePresentationInput
): ResourceNodePresentation {
  return {
    icon: getResourceNodeIconPresentation(node.iconUrl),
    label: getResourceNodeDisplayLabel(node)
  };
}

function getResourceNodeIconPresentation(iconUrl: string | undefined): ResourceNodePresentation["icon"] {
  if (iconUrl?.includes("/Architecture-Service-Icons_")) {
    return { family: "service" };
  }

  if (iconUrl?.includes("/Resource-Icons_")) {
    return { family: "resource" };
  }

  if (iconUrl?.includes("/Architecture-Group-Icons_")) {
    return { family: "group" };
  }

  return { family: "fallback" };
}
