"use client";

import { useEffect, useMemo, useState } from "react";
import type { GitHubInstalledRepositoryCandidate, SourceRepository } from "@sketchcatch/types";
import { useAuth } from "../../../../components/auth/auth-provider";
import { DashboardIcon } from "../../../../components/dashboard/dashboard-icons";
import { getApiErrorMessage } from "../../../../lib/api-client";
import {
  analyzeSourceRepository,
  connectGitHubSourceRepository,
  createGitHubSourceRepositoryInstallUrl,
  getProject,
  listGitHubInstalledRepositories,
  listSourceRepositories
} from "../../../../features/workspace/api";
import { GitHubRepositoryConnectionPanel } from "./github-repository-connection-panel";
import {
  applyRepositoryAnalysis,
  canRunRepositoryAnalysis,
  findActiveGitHubRepository,
  shouldLoadProjectSettings
} from "./project-github-settings-state";
import { RepositoryAnalysisResult } from "./repository-analysis-result";
import styles from "./project-github-settings.module.css";

type RequestState = "idle" | "loading" | "error";

// active GitHub repository 연결, 분석 실행, 저장 결과 복원을 한 화면에서 제공합니다.
export function ProjectGitHubSettingsClient({ projectId }: { readonly projectId: string }) {
  const { status: authStatus } = useAuth();
  const [projectName, setProjectName] = useState("Project");
  const [sourceRepositories, setSourceRepositories] = useState<SourceRepository[]>([]);
  const [installedRepositories, setInstalledRepositories] = useState<
    GitHubInstalledRepositoryCandidate[]
  >([]);
  const [installationState, setInstallationState] = useState("");
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const [repositoryState, setRepositoryState] = useState<RequestState>("idle");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [analysisState, setAnalysisState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const activeRepository = useMemo(
    () => findActiveGitHubRepository(sourceRepositories),
    [sourceRepositories]
  );

  useEffect(() => {
    if (!shouldLoadProjectSettings(authStatus)) {
      return;
    }

    void loadProjectSettings();
  }, [authStatus, projectId]);

  async function loadProjectSettings(): Promise<void> {
    setLoadState("loading");
    setErrorMessage("");

    try {
      const [project, repositories] = await Promise.all([
        getProject(projectId),
        listSourceRepositories(projectId)
      ]);

      setProjectName(project.name);
      setSourceRepositories(repositories);
      setLoadState("idle");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(getApiErrorMessage(error, "프로젝트 GitHub 설정을 불러오지 못했습니다."));
    }
  }

  async function loadInstalledRepositories(): Promise<void> {
    setRepositoryState("loading");
    setErrorMessage("");

    try {
      const result = await listGitHubInstalledRepositories(projectId);

      setInstalledRepositories(result.repositories);
      setInstallationState(result.state);
      setRepositoryState("idle");
    } catch (error) {
      setRepositoryState("error");
      setErrorMessage(getApiErrorMessage(error, "GitHub App repository 목록을 불러오지 못했습니다."));
    }
  }

  async function connectRepository(repository: GitHubInstalledRepositoryCandidate): Promise<void> {
    if (!installationState || repository.archived) {
      return;
    }

    setActionState("loading");
    setErrorMessage("");

    try {
      const connectedRepository = await connectGitHubSourceRepository({
        projectId,
        installationId: repository.installationId,
        githubRepositoryId: repository.githubRepositoryId,
        state: installationState
      });

      setSourceRepositories((currentRepositories) => [
        connectedRepository,
        ...currentRepositories.filter((item) => item.id !== connectedRepository.id)
      ]);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "GitHub repository를 프로젝트에 연결하지 못했습니다."));
    }
  }

  async function openGitHubInstallation(): Promise<void> {
    setActionState("loading");
    setErrorMessage("");

    try {
      const { installUrl } = await createGitHubSourceRepositoryInstallUrl(projectId);

      window.location.assign(installUrl);
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "GitHub App 설치 화면을 열지 못했습니다."));
    }
  }

  // active repository 분석을 한 번만 실행하고 저장된 AI Handoff를 현재 화면에도 반영합니다.
  async function runRepositoryAnalysis(): Promise<void> {
    if (!canRunRepositoryAnalysis(activeRepository, analysisState)) {
      return;
    }

    setAnalysisState("loading");
    setErrorMessage("");

    try {
      const result = await analyzeSourceRepository(projectId, activeRepository.id);

      setSourceRepositories((currentRepositories) =>
        applyRepositoryAnalysis(currentRepositories, result)
      );
      setAnalysisState("idle");
    } catch (error) {
      setAnalysisState("error");
      setErrorMessage(getApiErrorMessage(error, "GitHub repository를 분석하지 못했습니다."));
    }
  }

  return (
    <section
      className={`dashboardPanel integrationPanel ${styles.scope}`}
      aria-labelledby="project-github-title"
    >
      <div className="integrationHeader">
        <span className="integrationIcon">
          <DashboardIcon name="github" />
        </span>
        <div>
          <p className="dashboardPanelKicker">GitHub</p>
          <h2 className={styles.title} id="project-github-title">{projectName} repository 연결</h2>
        </div>
      </div>

      <p>Git/CI/CD handoff에 사용할 source repository를 프로젝트 단위로 연결합니다.</p>

      {loadState === "loading" ? (
        <p className="dashboardMessage" role="status">
          프로젝트 설정을 불러오는 중입니다.
        </p>
      ) : null}

      {activeRepository ? (
        <>
          <div className="settingsInfoGrid">
            <article>
              <span>현재 repository</span>
              <strong>
                {activeRepository.owner}/{activeRepository.name}
              </strong>
            </article>
            <article>
              <span>Default branch</span>
              <strong>{activeRepository.defaultBranch}</strong>
            </article>
            <article>
              <span>Status</span>
              <strong>{activeRepository.status}</strong>
            </article>
          </div>
          <div className="settingsActionRow">
            <button
              className="dashboardTopbarAction"
              disabled={analysisState === "loading" || actionState === "loading"}
              onClick={() => void runRepositoryAnalysis()}
              type="button"
            >
              <DashboardIcon name="search" />
              <span>{analysisState === "loading" ? "Repository 분석 중" : "Repository 분석"}</span>
            </button>
          </div>
          {analysisState === "loading" ? (
            <p className="dashboardMessage" role="status">
              Repository tree와 설정 파일을 정적으로 분석하고 있습니다.
            </p>
          ) : null}
          {activeRepository.analysis ? (
            <RepositoryAnalysisResult
              analysis={activeRepository.analysis}
              projectId={projectId}
              repository={activeRepository}
            />
          ) : null}
        </>
      ) : (
        <p className="dashboardMessage" role="status">
          아직 이 프로젝트에 연결된 GitHub repository가 없습니다.
        </p>
      )}

      <GitHubRepositoryConnectionPanel
        actionState={actionState}
        installationState={installationState}
        installedRepositories={installedRepositories}
        onConnectRepository={(repository) => void connectRepository(repository)}
        onLoadInstalledRepositories={() => void loadInstalledRepositories()}
        onOpenGitHubInstallation={() => void openGitHubInstallation()}
        repositoryState={repositoryState}
      />

      {errorMessage ? (
        <p className="dashboardMessage" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
