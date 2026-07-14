import type {
  GitHubProjectConnectionTarget,
  GitHubRepositoryCandidate
} from "@sketchcatch/types";

export function canResumeRepositoryAnalysis(input: {
  readonly deploymentTargetSaved: boolean;
  readonly gitOpsMonitoringSaved: boolean;
}): boolean {
  return input.deploymentTargetSaved && input.gitOpsMonitoringSaved;
}

export function selectCallbackTarget(
  repositories: readonly GitHubRepositoryCandidate[],
  target: GitHubProjectConnectionTarget
): GitHubRepositoryCandidate | null {
  const owner = target.owner.trim().toLowerCase();
  const name = target.name.trim().toLowerCase();

  return repositories.find(
    (repository) =>
      repository.owner.toLowerCase() === owner &&
      repository.name.toLowerCase() === name
  ) ?? null;
}
