export type RepositoryTemplatePreviewDirection = "next" | "previous";

export function getRepositoryTemplatePreviewIndex(
  currentIndex: number,
  candidateCount: number,
  direction: RepositoryTemplatePreviewDirection
): number {
  if (candidateCount <= 1) return 0;

  const lastIndex = candidateCount - 1;
  const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  return Math.min(Math.max(nextIndex, 0), lastIndex);
}
