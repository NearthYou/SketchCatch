import type { RepositoryAnalysisRecord } from "@sketchcatch/types";

export function selectProjectDeliverySourceRepository<T extends { readonly id: string }>(input: {
  readonly repositoryAnalysisTarget: Pick<RepositoryAnalysisRecord, "sourceRepositoryId"> | null;
  readonly activeRepositories: readonly T[];
}): T | null {
  if (input.repositoryAnalysisTarget) {
    const expectedId = input.repositoryAnalysisTarget.sourceRepositoryId;
    if (!expectedId) return null;
    return input.activeRepositories.find(({ id }) => id === expectedId) ?? null;
  }

  return input.activeRepositories[0] ?? null;
}
