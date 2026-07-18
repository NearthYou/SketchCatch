import type {
  RepositoryAnalysisAiHandoff,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

export type CurrentRepositoryAnalysis = {
  analysisRevision: string | null;
  analysisResult: RepositoryAnalysisAiHandoff | null;
};

export function resolveCurrentRepositoryAnalysis(input: {
  legacyAnalysisRevision: string | null;
  legacyAnalysisResult: RepositoryAnalysisAiHandoff | null;
  repositoryAnalysisRevision?: string | null | undefined;
  repositoryAnalysisResult?: SourceRepositoryAnalysisResult | null | undefined;
}): CurrentRepositoryAnalysis {
  const hasRepositoryAnalysisRecord =
    input.repositoryAnalysisRevision != null ||
    input.repositoryAnalysisResult != null;

  if (!hasRepositoryAnalysisRecord) {
    return {
      analysisRevision: input.legacyAnalysisRevision,
      analysisResult: input.legacyAnalysisResult
    };
  }

  const revision = input.repositoryAnalysisRevision ?? null;
  const payloadRevision = input.repositoryAnalysisResult?.repositoryRevision ?? null;
  const payloadMatchesRecord =
    revision !== null &&
    payloadRevision !== null &&
    revision.toLowerCase() === payloadRevision.toLowerCase();

  return {
    analysisRevision: revision,
    analysisResult: payloadMatchesRecord
      ? input.repositoryAnalysisResult?.aiHandoff ?? null
      : null
  };
}
