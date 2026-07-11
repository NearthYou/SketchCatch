import { templateDefinitions } from "@sketchcatch/types";
import type { SourceRepository, TemplateDefinition } from "@sketchcatch/types";

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
    handoff.requestedTemplateId !== analysis.aiHandoff.templateId
  ) {
    throw new Error("REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH");
  }

  const definition = templateDefinitions.find(
    (candidate) => candidate.id === analysis.aiHandoff.templateId
  );

  if (!definition) {
    throw new Error("REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE");
  }

  return definition;
}
