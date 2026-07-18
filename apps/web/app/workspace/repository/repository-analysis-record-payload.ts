import type {
  RepositoryAnalysisTemplateId,
  SaveRepositoryAnalysisRecordRequest,
  SourceRepository,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

export function createConnectedRepositoryAnalysisResult(
  repository: SourceRepository,
  selectedTemplateId: RepositoryAnalysisTemplateId | null
): SourceRepositoryAnalysisResult {
  if (!repository.repositoryUrl || !repository.analysis) {
    throw new Error("Connected Repository analysis is required");
  }
  const handoff = repository.analysis.aiHandoff;
  const recommendationReason = handoff.status === "template_selected"
    ? handoff.selectionReasons.join(" ")
    : handoff.mismatchReasons.join(" ");

  return {
    repositoryUrl: repository.repositoryUrl,
    repositoryRevision: repository.analysis.repositoryRevision,
    defaultBranch: repository.defaultBranch,
    availableBranches: [repository.defaultBranch],
    evidenceFiles: handoff.evidence.slice(0, 2_000).map((evidence) => ({
      path: evidence.path,
      found: true
    })),
    detectedSignals: [...new Set(
      handoff.evidence.flatMap((evidence) => evidence.signals)
    )].slice(0, 2_000),
    recommendedTemplateId: selectedTemplateId,
    recommendationReason,
    aiHandoff: handoff
  };
}

export function createRepositoryAnalysisRecordPayload(input: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly analyzedAt: string;
  readonly selectedTemplateId: RepositoryAnalysisTemplateId | null;
}): SaveRepositoryAnalysisRecordRequest {
  const identity = parseGitHubRepositoryUrl(input.analysis.repositoryUrl);
  const repositoryUrl = `https://github.com/${identity.owner}/${identity.name}`;
  const repositoryRevision = input.analysis.repositoryRevision.toLowerCase();

  return {
    provider: "github",
    repositoryUrl,
    owner: identity.owner,
    name: identity.name,
    branch: input.analysis.defaultBranch,
    repositoryRevision,
    analysisResult: {
      ...input.analysis,
      repositoryUrl,
      repositoryRevision
    },
    selectedTemplateId: input.selectedTemplateId,
    analyzedAt: input.analyzedAt
  };
}

function parseGitHubRepositoryUrl(repositoryUrl: string): { owner: string; name: string } {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error("Invalid GitHub Repository URL");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const owner = segments[0]?.toLowerCase();
  const name = segments[1]?.replace(/\.git$/iu, "").toLowerCase();

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    segments.length !== 2 ||
    !owner ||
    !name
  ) {
    throw new Error("Invalid GitHub Repository URL");
  }
  return { owner, name };
}
