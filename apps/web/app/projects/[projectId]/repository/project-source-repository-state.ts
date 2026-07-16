import type {
  AnalyzeSourceRepositoryResponse,
  GitHubInstalledRepositoryCandidate,
  SourceRepository
} from "@sketchcatch/types";

export type RepositoryAnalysisState = "idle" | "loading" | "error";

export function findActiveGitHubRepository(
  repositories: readonly SourceRepository[]
): SourceRepository | null {
  return (
    repositories.find(
      (repository) => repository.provider === "github" && repository.status === "active"
    ) ?? null
  );
}

export function canRunRepositoryAnalysis(
  repository: SourceRepository | null,
  state: RepositoryAnalysisState
): repository is SourceRepository {
  return repository !== null && state !== "loading";
}

export function applyRepositoryAnalysis(
  repositories: readonly SourceRepository[],
  result: AnalyzeSourceRepositoryResponse
): SourceRepository[] {
  return repositories.map((repository) =>
    repository.id === result.sourceRepositoryId
      ? {
          ...repository,
          analysis: {
            repositoryRevision: result.repositoryRevision,
            analyzedAt: result.analyzedAt,
            aiHandoff: result.aiHandoff
          }
        }
      : repository
  );
}

export function shouldLoadProjectSourceRepository(authStatus: string): boolean {
  return authStatus === "authenticated";
}

export function shouldConfirmRepositoryChange(
  activeRepository: SourceRepository | null,
  candidate: GitHubInstalledRepositoryCandidate
): boolean {
  return Boolean(
    activeRepository &&
      activeRepository.githubRepositoryId !== candidate.githubRepositoryId
  );
}
