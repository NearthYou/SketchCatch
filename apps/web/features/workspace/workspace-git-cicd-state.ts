import type {
  GitCicdHandoff,
  GitCicdHandoffPipelineStatus,
  SourceRepository
} from "@sketchcatch/types";

// Git/CI/CD에서 실제로 선택할 수 있는 활성 GitHub Repository만 남깁니다.
export function selectActiveGitHubRepositories(
  repositories: readonly SourceRepository[]
): SourceRepository[] {
  return repositories.filter(
    (repository) =>
      repository.provider === "github" &&
      repository.status === "active" &&
      !repository.archived
  );
}

// 기존 선택을 지키되 사라졌다면 가장 최근 handoff를 선택합니다.
export function selectCurrentGitCicdHandoff(
  handoffs: readonly GitCicdHandoff[],
  selectedId: string
): GitCicdHandoff | null {
  const sorted = [...handoffs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return sorted.find((handoff) => handoff.id === selectedId) ?? sorted[0] ?? null;
}

// Pipeline 조회 결과를 기존 handoff 상세에 합쳐 화면을 최신 상태로 만듭니다.
export function mergeGitCicdPipelineStatus(
  handoff: GitCicdHandoff,
  status: GitCicdHandoffPipelineStatus
): GitCicdHandoff {
  return {
    ...handoff,
    status: status.status,
    pullRequestUrl: status.pullRequestUrl,
    pullRequestNumber: status.pullRequestNumber,
    mergeCommitSha: status.mergeCommitSha,
    pipelineRunUrl: status.pipelineRunUrl,
    infraPipelineRunUrl: status.infraPipelineRunUrl,
    infraPipelineStatus: status.infraPipelineStatus,
    appPipelineRunUrl: status.appPipelineRunUrl,
    appPipelineStatus: status.appPipelineStatus,
    destroyPipelineRunUrl: status.destroyPipelineRunUrl,
    destroyPipelineStatus: status.destroyPipelineStatus,
    environmentName: status.environmentName,
    staticSiteUrl: status.staticSiteUrl,
    apiBaseUrl: status.apiBaseUrl,
    statusMessage: status.statusMessage,
    updatedAt: status.updatedAt
  };
}
