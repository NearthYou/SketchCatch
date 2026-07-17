import type { DiagramJson } from "../../../../packages/types/src";
import { EMPTY_DIAGRAM } from "../diagram-editor/constants";
import { curatedModules, materializeCuratedModulePattern } from "./module-catalog";

const MODULE_THUMBNAIL_EXPANDED_AT = "2000-01-01T00:00:00.000Z";

export function createModuleThumbnailDiagram(moduleId: string): DiagramJson | null {
  const pattern = curatedModules.find((candidate) => candidate.id === moduleId);

  if (!pattern) return null;

  return materializeCuratedModulePattern({
    diagram: structuredClone(EMPTY_DIAGRAM),
    expandedAt: MODULE_THUMBNAIL_EXPANDED_AT,
    pattern
  });
}

export function serializeModuleThumbnailDiagram(diagram: DiagramJson): string {
  return JSON.stringify(sortDiagramValue(diagram));
}

function sortDiagramValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDiagramValue);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareObjectKeys(left, right))
      .map(([key, nestedValue]) => [key, sortDiagramValue(nestedValue)])
  );
}

function compareObjectKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
