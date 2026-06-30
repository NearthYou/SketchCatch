import type { Project } from "../../../../packages/types/src";

export function filterProjectsByName(projects: readonly Project[], searchQuery: string): Project[] {
  const normalizedQuery = normalizeProjectSearchQuery(searchQuery);

  if (!normalizedQuery) {
    return [...projects];
  }

  return projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(normalizedQuery)
  );
}

function normalizeProjectSearchQuery(searchQuery: string): string {
  return searchQuery.trim().toLocaleLowerCase();
}
