import type {
  ArchitectureDraftDynamicQuestionAnswer,
  ArchitectureDraftTemplateFallbackDeploymentType,
  ArchitectureDraftTemplateRecommendationCandidate,
  CreateArchitectureDraftRequest,
  SourceRepository
} from "@sketchcatch/types";

type BuildRepositoryTemplateFallbackDraftRequestInput = {
  readonly additionalRequirements?: string | undefined;
  readonly ciCdEnabled: boolean;
  readonly deploymentType: ArchitectureDraftTemplateFallbackDeploymentType;
  readonly dynamicQuestionAnswers?: readonly ArchitectureDraftDynamicQuestionAnswer[] | undefined;
  readonly projectId: string;
  readonly repository: SourceRepository;
};

export function buildRepositoryTemplateFallbackDraftRequest({
  additionalRequirements,
  ciCdEnabled,
  deploymentType,
  dynamicQuestionAnswers = [],
  projectId,
  repository
}: BuildRepositoryTemplateFallbackDraftRequestInput): CreateArchitectureDraftRequest {
  const recommendationCandidates = createRepositoryTemplateRecommendationCandidates(repository);
  const trimmedAdditionalRequirements = additionalRequirements?.trim() ?? "";

  return {
    prompt: createRepositoryTemplateFallbackPrompt({
      additionalRequirements: trimmedAdditionalRequirements,
      ciCdEnabled,
      deploymentType,
      dynamicQuestionAnswers,
      recommendationCandidates,
      repository
    }),
    repositoryAnalysis: {
      projectId,
      sourceRepositoryId: repository.id
    },
    templateFallback: {
      mode: "template_unselected",
      deploymentType,
      ciCdEnabled,
      dynamicQuestionAnswers,
      recommendationCandidates,
      ...(trimmedAdditionalRequirements.length > 0
        ? { additionalRequirements: trimmedAdditionalRequirements }
        : {})
    }
  };
}

export function createRepositoryTemplateRecommendationCandidates(
  repository: SourceRepository
): ArchitectureDraftTemplateRecommendationCandidate[] {
  const handoff = repository.analysis?.aiHandoff;

  if (handoff?.status !== "template_selected") {
    return [];
  }

  return [
    {
      templateId: handoff.templateId,
      title: handoff.templateId,
      reason: handoff.selectionReasons.join(" / ") || "Repository Analysis recommended this Template."
    }
  ];
}

function createRepositoryTemplateFallbackPrompt({
  additionalRequirements,
  ciCdEnabled,
  deploymentType,
  dynamicQuestionAnswers,
  recommendationCandidates,
  repository
}: {
  readonly additionalRequirements: string;
  readonly ciCdEnabled: boolean;
  readonly deploymentType: ArchitectureDraftTemplateFallbackDeploymentType;
  readonly dynamicQuestionAnswers: readonly ArchitectureDraftDynamicQuestionAnswer[];
  readonly recommendationCandidates: readonly ArchitectureDraftTemplateRecommendationCandidate[];
  readonly repository: SourceRepository;
}): string {
  const answers = dynamicQuestionAnswers.map(
    (answer) => `- ${answer.question}: ${answer.answer}`
  );
  const candidates = recommendationCandidates.map(
    (candidate) => `- ${candidate.title} (${candidate.templateId}): ${candidate.reason}`
  );

  return [
    "Template recommendation fallback request.",
    "The user did not choose any recommended Template.",
    `Repository: ${repository.owner}/${repository.name}`,
    `Repository Analysis: ${JSON.stringify(repository.analysis?.aiHandoff ?? null)}`,
    `Deployment path: ${deploymentType}`,
    `CI/CD requested: ${ciCdEnabled ? "true" : "false"}`,
    "Dynamic question answers:",
    ...(answers.length > 0 ? answers : ["- none"]),
    "Recommendation candidates that were not selected:",
    ...(candidates.length > 0 ? candidates : ["- none"]),
    "Additional requirements:",
    additionalRequirements || "- none",
    "Generate an AI Architecture Draft without templateId, while treating the repository analysis, deployment path, CI/CD choice, and dynamic answers as hard constraints."
  ].join("\n");
}
