import type { RepositoryAnalysisAiHandoff, SourceRepository } from "@sketchcatch/types";
import {
  isBoardTemplateAvailable,
  listBoardTemplates
} from "../resource-settings/template-library";

export type RepositoryAnalysisHandoffLocation = {
  readonly sourceRepositoryId: string;
  readonly requestedTemplateId?: string | undefined;
};

export function resolveRepositoryAnalysisTemplate(
  repositories: readonly SourceRepository[],
  handoff: RepositoryAnalysisHandoffLocation
): {
  readonly id: string;
  readonly requiredRuntimeSecrets: readonly string[];
  readonly title: string;
} {
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
  const template = listBoardTemplates().find(
    (candidate) => candidate.id === templateId && isBoardTemplateAvailable(candidate)
  );

  if (!template) {
    throw new Error("REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE");
  }

  return {
    id: template.id,
    requiredRuntimeSecrets: getRepositoryRequiredRuntimeSecrets(analysis.aiHandoff),
    title: template.title
  };
}

export function getRepositoryRequiredRuntimeSecrets(
  handoff: RepositoryAnalysisAiHandoff | undefined
): string[] {
  return [
    ...new Set(
      (handoff?.architectureFacts ?? [])
        .filter((fact) => fact.kind === "runtime_secret")
        .map((fact) => fact.value)
    )
  ].sort();
}

function getAllowedRepositoryAnalysisTemplateIds(handoff: RepositoryAnalysisAiHandoff): Set<string> {
  return new Set([
    ...(handoff.templateId ? [handoff.templateId] : []),
    ...(handoff.recommendation?.candidates.map((candidate) => candidate.templateId) ?? [])
  ]);
}
