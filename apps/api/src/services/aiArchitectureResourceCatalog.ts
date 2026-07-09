import type { ResourceType } from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";

export type SupportedArchitectureResourceCatalogItem = {
  readonly id: string;
  readonly displayName: string;
  readonly nodeType: ResourceType;
  readonly terraformBlockType: "resource" | "data";
  readonly terraformResourceType: string;
  readonly terraformPreview: boolean;
  readonly terraformSync: boolean;
};

export const SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG: readonly SupportedArchitectureResourceCatalogItem[] =
  resourceDefinitions
    .filter((definition) => definition.resourceType !== "UNKNOWN")
    .map((definition) => ({
      id: definition.id,
      displayName: formatResourceDefinitionDisplayName(definition.id),
      nodeType: definition.resourceType,
      terraformBlockType: definition.terraform.blockType,
      terraformResourceType: definition.terraform.resourceType,
      terraformPreview: definition.capabilities.terraformPreview,
      terraformSync: definition.capabilities.terraformSync
    }));

export const SUPPORTED_ARCHITECTURE_RESOURCE_TYPES = Array.from(
  new Set(SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG.map((definition) => definition.nodeType))
) satisfies ResourceType[];

function formatResourceDefinitionDisplayName(id: string): string {
  return id
    .replace(/^aws-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
