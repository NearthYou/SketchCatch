"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GitHubInstalledRepositoryCandidate, SourceRepository } from "@sketchcatch/types";
import { useAuth } from "../../../../components/auth/auth-provider";
import { DashboardIcon } from "../../../../components/dashboard/dashboard-icons";
import { getApiErrorMessage } from "../../../../lib/api-client";
import {
  analyzeSourceRepository,
  connectGitHubSourceRepository,
  getProject,
  listGitHubAccountInstallations,
  listGitHubInstalledRepositories,
  listSourceRepositories
} from "../../../../features/workspace/api";
import { GitHubRepositoryConnectionPanel } from "../settings/github-repository-connection-panel";
import { RepositoryAnalysisResult } from "../settings/repository-analysis-result";
import {
  applyRepositoryAnalysis,
  canRunRepositoryAnalysis,
  findActiveGitHubRepository,
  shouldLoadProjectSourceRepository
} from "./project-source-repository-state";
import styles from "../settings/project-github-settings.module.css";

type RequestState = "idle" | "loading" | "error";

// 프로젝트의 source repository 선택과 분석만 담당하며 GitHub App 권한은 전역 설정에 맡깁니다.
export function ProjectSourceRepositoryClient({ projectId }: { readonly projectId: string }) {
  const { status: authStatus } = useAuth();
  const [projectName, setProjectName] = useState("Project");
  const [sourceRepositories, setSourceRepositories] = useState<SourceRepository[]>([]);
  const [installedRepositories, setInstalledRepositories] = useState<
    GitHubInstalledRepositoryCandidate[]
  >([]);
  const [installationState, setInstallationState] = useState("");
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const [accountState, setAccountState] = useState<RequestState>("loading");
  const [repositoryState, setRepositoryState] = useState<RequestState>("idle");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [analysisState, setAnalysisState] = useState<RequestState>("idle");
  const [hasGitHubAccountConnection, setHasGitHubAccountConnection] = useState<boolean | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [accountErrorMessage, setAccountErrorMessage] = useState("");

  const activeRepository = useMemo(
    () => findActiveGitHubRepository(sourceRepositories),
    [sourceRepositories]
  );

  useEffect(() => {
    if (!shouldLoadProjectSourceRepository(authStatus)) return;

    void loadProjectRepository();
    void loadGitHubAccountConnection();
  }, [authStatus, projectId]);

  async function loadProjectRepository(): Promise<void> {
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
      setErrorMessage(getApiErrorMessage(error, "프로젝트 소스 저장소를 불러오지 못했습니다."));
    }
  }

  async function loadGitHubAccountConnection(): Promise<void> {
    setAccountState("loading");
    setAccountErrorMessage("");

    try {
      const installations = await listGitHubAccountInstallations();
      setHasGitHubAccountConnection(installations.length > 0);
      setAccountState("idle");
    } catch (error) {
      setHasGitHubAccountConnection(null);
      setAccountState("error");
      setAccountErrorMessage(
        getApiErrorMessage(error, "GitHub 계정 연결 상태를 불러오지 못했습니다.")
      );
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
      setErrorMessage(getApiErrorMessage(error, "GitHub repository 목록을 불러오지 못했습니다."));
    }
  }

  async function connectRepository(repository: GitHubInstalledRepositoryCandidate): Promise<void> {
    if (!installationState || repository.archived) return;

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

  async function runRepositoryAnalysis(): Promise<void> {
    if (!canRunRepositoryAnalysis(activeRepository, analysisState)) return;

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
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Source repository</p>
          <h1>소스 저장소</h1>
          <p>이 프로젝트의 아키텍처 분석과 Git/CI/CD에 사용할 repository를 선택합니다.</p>
        </div>
      </header>

      <section
        aria-labelledby="project-source-repository-title"
        className={`dashboardPanel integrationPanel ${styles.scope}`}
      >
        <div className="integrationHeader">
          <span className="integrationIcon">
            <DashboardIcon name="github" />
          </span>
          <div>
            <p className="dashboardPanelKicker">GitHub</p>
            <h2 className={styles.title} id="project-source-repository-title">
              {projectName} repository
            </h2>
          </div>
        </div>

        {loadState === "loading" ? (
          <p className="dashboardMessage" role="status">프로젝트 repository를 불러오는 중입니다.</p>
        ) : null}

        {activeRepository ? (
          <>
            <div className="settingsInfoGrid">
              <article>
                <span>현재 repository</span>
                <strong>{activeRepository.owner}/{activeRepository.name}</strong>
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
            {activeRepository.analysis ? (
              <RepositoryAnalysisResult
                analysis={activeRepository.analysis}
                projectId={projectId}
                repository={activeRepository}
              />
            ) : null}
          </>
        ) : loadState === "idle" ? (
          <p className="dashboardMessage" role="status">
            아직 이 프로젝트에 연결된 GitHub repository가 없습니다.
          </p>
        ) : null}

        {accountState === "loading" ? (
          <p className="dashboardMessage" role="status">GitHub 계정 연결 상태를 확인하는 중입니다.</p>
        ) : null}

        {hasGitHubAccountConnection === false ? (
          <div className="dashboardStateBand">
            <strong>GitHub 계정 연결이 필요합니다.</strong>
            <p>전역 설정에서 GitHub App을 연결한 뒤 프로젝트 repository를 선택할 수 있습니다.</p>
            <Link
              className="dashboardPrimaryAction"
              href="/dashboard/settings#github-account-settings-title"
            >
              GitHub 계정 연결
            </Link>
          </div>
        ) : null}

        {accountState === "error" ? (
          <div className="dashboardStateBand">
            <p role="alert">{accountErrorMessage}</p>
            <button
              className="dashboardSecondaryButton"
              onClick={() => void loadGitHubAccountConnection()}
              type="button"
            >
              계정 상태 다시 확인
            </button>
          </div>
        ) : null}

        {hasGitHubAccountConnection ? (
          <GitHubRepositoryConnectionPanel
            actionState={actionState}
            installationState={installationState}
            installedRepositories={installedRepositories}
            onConnectRepository={(repository) => void connectRepository(repository)}
            onLoadInstalledRepositories={() => void loadInstalledRepositories()}
            repositoryState={repositoryState}
          />
        ) : null}

        {errorMessage ? <p className="dashboardMessage" role="alert">{errorMessage}</p> : null}
      </section>
    </div>
  );
}
