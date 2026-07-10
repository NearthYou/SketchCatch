import type { Project } from "@sketchcatch/types";

export type ProjectSortMode = "recent_work" | "recent_created";

export function sortProjectsByMode(
  projects: readonly Project[],
  sortMode: ProjectSortMode
): Project[] {
  const timestampKey = sortMode === "recent_created" ? "createdAt" : "updatedAt";

  return [...projects].sort((left, right) => {
    const timestampDifference = Date.parse(right[timestampKey]) - Date.parse(left[timestampKey]);

    return timestampDifference || left.id.localeCompare(right.id);
  });
}
