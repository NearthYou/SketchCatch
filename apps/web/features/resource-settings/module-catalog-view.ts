import type { ArchitectureBoardModulePatternLens } from "../architecture-board-compiler/architecture-board-knowledge-contract";
import type { CuratedModuleDefinition } from "./module-catalog";

export type ModuleCatalogViewId = ArchitectureBoardModulePatternLens["kind"];

export const moduleCatalogViews = [
  { id: "functional", label: "기능별" },
  { id: "purpose", label: "용도별" }
] as const satisfies readonly {
  readonly id: ModuleCatalogViewId;
  readonly label: string;
}[];

export type ModuleCatalogGroup = {
  readonly key: string;
  readonly label: string;
  readonly modules: readonly CuratedModuleDefinition[];
};

export function countModuleResources(moduleDefinition: CuratedModuleDefinition): number {
  return moduleDefinition.nodes.filter(({ kind }) => kind === "resource").length;
}

export function createModuleCatalogGroups(input: {
  readonly modules: readonly CuratedModuleDefinition[];
  readonly query?: string | undefined;
  readonly view: ModuleCatalogViewId;
}): readonly ModuleCatalogGroup[] {
  const normalizedQuery = normalizeSearchText(input.query ?? "");
  const groups = new Map<string, ModuleCatalogGroup>();

  for (const moduleDefinition of input.modules) {
    if (!matchesModuleSearch(moduleDefinition, normalizedQuery)) continue;

    for (const lens of moduleDefinition.lenses) {
      if (lens.kind !== input.view) continue;

      const current = groups.get(lens.key);
      if (current) {
        if (!current.modules.includes(moduleDefinition)) {
          groups.set(lens.key, {
            ...current,
            modules: [...current.modules, moduleDefinition]
          });
        }
        continue;
      }

      groups.set(lens.key, {
        key: lens.key,
        label: lens.label,
        modules: [moduleDefinition]
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      modules: [...group.modules].sort(compareModules)
    }))
    .sort(
      (left, right) =>
        compareCatalogText(left.label, right.label) || compareCatalogText(left.key, right.key)
    );
}

function matchesModuleSearch(
  moduleDefinition: CuratedModuleDefinition,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;

  return [
    moduleDefinition.id,
    moduleDefinition.title,
    moduleDefinition.description,
    ...moduleDefinition.lenses.flatMap(({ key, label }) => [key, label]),
    ...moduleDefinition.nodes.flatMap((node) => [
      node.label,
      node.type,
      node.parameters?.resourceType ?? ""
    ])
  ].some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function compareModules(left: CuratedModuleDefinition, right: CuratedModuleDefinition): number {
  return compareCatalogText(left.title, right.title) || compareCatalogText(left.id, right.id);
}

function compareCatalogText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
