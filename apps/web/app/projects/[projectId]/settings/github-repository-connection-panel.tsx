import type { GitHubInstalledRepositoryCandidate } from "@sketchcatch/types";
import { DashboardIcon } from "../../../../components/dashboard/dashboard-icons";

type RequestState = "idle" | "loading" | "error";

type GitHubRepositoryConnectionPanelProps = {
  readonly actionState: RequestState;
  readonly installationState: string;
  readonly installedRepositories: readonly GitHubInstalledRepositoryCandidate[];
  readonly onConnectRepository: (repository: GitHubInstalledRepositoryCandidate) => void;
  readonly onLoadInstalledRepositories: () => void;
  readonly onOpenGitHubInstallation: () => void;
  readonly repositoryState: RequestState;
};

// GitHub App repository 후보와 설치·연결 동작을 표시하고 API 상태는 부모가 소유합니다.
export function GitHubRepositoryConnectionPanel({
  actionState,
  installationState,
  installedRepositories,
  onConnectRepository,
  onLoadInstalledRepositories,
  onOpenGitHubInstallation,
  repositoryState
}: GitHubRepositoryConnectionPanelProps) {
  return (
    <>
      <div className="settingsActionRow">
        <button
          className="dashboardSecondaryButton"
          disabled={repositoryState === "loading" || actionState === "loading"}
          onClick={onLoadInstalledRepositories}
          type="button"
        >
          <DashboardIcon name="github" />
          <span>
            {repositoryState === "loading" ? "불러오는 중" : "연결 가능한 repository 보기"}
          </span>
        </button>
        <button
          className="dashboardTopbarAction"
          disabled={actionState === "loading"}
          onClick={onOpenGitHubInstallation}
          type="button"
        >
          <DashboardIcon name="link" />
          <span>GitHub App 설치/권한 추가</span>
        </button>
      </div>

      {installedRepositories.length > 0 ? (
        <div className="settingsInfoGrid" aria-label="GitHub repository 후보">
          {installedRepositories.map((repository) => (
            <article key={`${repository.installationId}-${repository.githubRepositoryId}`}>
              <span>{repository.installationAccountLogin}</span>
              <strong>{repository.fullName}</strong>
              <button
                className="dashboardSecondaryButton"
                disabled={
                  actionState === "loading" ||
                  repository.archived ||
                  repository.connectedStatus === "active"
                }
                onClick={() => onConnectRepository(repository)}
                type="button"
              >
                <DashboardIcon name="link" />
                <span>
                  {repository.connectedStatus === "active"
                    ? "연결됨"
                    : repository.archived
                      ? "Archived"
                      : "이 repository 연결"}
                </span>
              </button>
            </article>
          ))}
        </div>
      ) : repositoryState === "idle" && installationState ? (
        <p className="dashboardMessage" role="status">
          현재 GitHub App 권한으로 접근 가능한 repository가 없습니다.
        </p>
      ) : null}
    </>
  );
}
