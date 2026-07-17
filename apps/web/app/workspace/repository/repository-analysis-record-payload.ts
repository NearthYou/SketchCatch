import type {
  RepositoryAnalysisTemplateId,
  SaveRepositoryAnalysisRecordRequest,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

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
