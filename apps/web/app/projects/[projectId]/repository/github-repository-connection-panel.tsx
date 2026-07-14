import type { GitHubInstalledRepositoryCandidate } from "@sketchcatch/types";
import { DashboardIcon } from "../../../../components/dashboard/dashboard-icons";

type RequestState = "idle" | "loading" | "error";

type GitHubRepositoryConnectionPanelProps = {
  readonly actionState: RequestState;
  readonly installationState: string;
  readonly installedRepositories: readonly GitHubInstalledRepositoryCandidate[];
  readonly onLoadInstalledRepositories: () => void;
  readonly onSelectRepository: (repository: GitHubInstalledRepositoryCandidate) => void;
  readonly repositoryState: RequestState;
};

// GitHub App이 접근 가능한 후보만 보여주고 프로젝트 repository 선택은 부모에 위임합니다.
export function GitHubRepositoryConnectionPanel({
  actionState,
  installationState,
  installedRepositories,
  onLoadInstalledRepositories,
  onSelectRepository,
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
          <span>{repositoryState === "loading" ? "불러오는 중" : "연결 가능한 repository 보기"}</span>
        </button>
      </div>

      {installedRepositories.length > 0 ? (
        <div className="settingsInfoGrid" aria-label="GitHub repository 후보">
          {installedRepositories.map((repository) => (
            <article key={`${repository.installationId}-${repository.githubRepositoryId}`}>
              <span>{repository.installationAccountLogin}</span>
              <strong>{repository.fullName}</strong>
              <small>
                {repository.defaultBranch} · {repository.visibility === "private" ? "Private" : repository.visibility}
              </small>
              {repository.archived ? (
                <p role="status">Archived repository는 연결할 수 없습니다.</p>
              ) : null}
              <button
                className="dashboardSecondaryButton"
                disabled={
                  actionState === "loading" ||
                  repository.archived ||
                  repository.connectedStatus === "active"
                }
                onClick={() => onSelectRepository(repository)}
                type="button"
              >
                <DashboardIcon name="link" />
                <span>
                  {repository.connectedStatus === "active" ? "연결됨" : "이 repository 선택"}
                </span>
              </button>
            </article>
          ))}
        </div>
      ) : repositoryState === "idle" && installationState ? (
        <p className="dashboardMessage" role="status">
          GitHub App이 접근할 수 있는 repository가 없습니다. 전역 설정에서 권한을 확인하세요.
        </p>
      ) : null}
    </>
  );
}
