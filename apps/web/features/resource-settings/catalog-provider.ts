import type { ResourceItem } from "../../../../packages/types/src/index";
import { resourceCatalog } from "./catalog";

export type ResourceCatalogProvider = {
  listResources(): readonly ResourceItem[];
};

export function createResourceCatalogProvider(items: readonly ResourceItem[]): ResourceCatalogProvider {
  return {
    listResources: () => items
  };
}

export const defaultResourceCatalogProvider = createResourceCatalogProvider(resourceCatalog);
