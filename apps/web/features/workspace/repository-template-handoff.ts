import { templateDefinitions } from "@sketchcatch/types";
import type { RepositoryAnalysisAiHandoff, SourceRepository, TemplateDefinition } from "@sketchcatch/types";

export type RepositoryAnalysisHandoffLocation = {
  readonly sourceRepositoryId: string;
  readonly requestedTemplateId?: string | undefined;
};

export function resolveRepositoryAnalysisTemplate(
  repositories: readonly SourceRepository[],
  handoff: RepositoryAnalysisHandoffLocation
): TemplateDefinition {
  const repository = repositories.find((candidate) => candidate.id === handoff.sourceRepositoryId);
  const analysis = repository?.analysis;

  if (!analysis || analysis.aiHandoff.status !== "template_selected") {
    throw new Error("REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE");
  }

  if (
    handoff.requestedTemplateId &&
    !getAllowedRepositoryAnalysisTemplateIds(analysis.aiHandoff).has(handoff.requestedTemplateId)
  ) {
    throw new Error("REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH");
  }

  const templateId = handoff.requestedTemplateId ?? analysis.aiHandoff.templateId;
  const definition = templateDefinitions.find(
    (candidate) => candidate.id === templateId
  );

  if (!definition) {
    throw new Error("REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE");
  }

  return definition;
}

function getAllowedRepositoryAnalysisTemplateIds(handoff: RepositoryAnalysisAiHandoff): Set<string> {
  return new Set([
    ...(handoff.templateId ? [handoff.templateId] : []),
    ...(handoff.recommendation?.candidates.map((candidate) => candidate.templateId) ?? [])
  ]);
}
