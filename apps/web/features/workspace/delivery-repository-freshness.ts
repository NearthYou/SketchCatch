import type { RepositoryAnalysisRecord, SourceRepository } from "@sketchcatch/types";

export type DeliveryRepositoryFreshness =
  | { status: "current"; analyzedRevision: string; currentRevision: string }
  | { status: "changed"; analyzedRevision: string; currentRevision: string }
  | { status: "unknown"; analyzedRevision: string | null; currentRevision: string | null };

// 저장된 Board 출처와 마지막 인증 분석 SHA만 비교하며 리소스 변경을 추론하지 않는다.
export function getDeliveryRepositoryFreshness(
  analysis: RepositoryAnalysisRecord | null,
  sourceRepository: SourceRepository | null
): DeliveryRepositoryFreshness {
  const analyzedRevision = analysis?.repositoryRevision ?? null;
  const currentRevision = sourceRepository?.analysis?.repositoryRevision ?? null;
  if (!analyzedRevision || !currentRevision) {
    return { status: "unknown", analyzedRevision, currentRevision };
  }
  return analyzedRevision.toLowerCase() === currentRevision.toLowerCase()
    ? { status: "current", analyzedRevision, currentRevision }
    : { status: "changed", analyzedRevision, currentRevision };
}
