"use client";

import Link from "next/link";
import { GitBranch, LoaderCircle, Search, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GitHubInstalledRepositoryCandidate, SourceRepository } from "@sketchcatch/types";
import { ProductBrand } from "../../../components/ui/ProductBrand";
import { ProductState } from "../../../components/ui/ProductState";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  analyzeSourceRepository,
  connectGitHubSourceRepository,
  createGitHubSourceRepositoryInstallUrl,
  listGitHubInstalledRepositories,
  listSourceRepositories
} from "../../../features/workspace/api";
import {
  applyRepositoryAnalysis,
  findActiveGitHubRepository
} from "../../projects/[projectId]/settings/project-github-settings-state";
import styles from "./repository-start.module.css";

type RequestState = "idle" | "loading" | "error";

type RepositoryStartClientProps = {
  readonly projectId: string;
  readonly projectName: string;
};

// Repository 연결부터 분석 결과 확인과 Board 이동까지 한 흐름으로 제공합니다.
export function RepositoryStartClient({ projectId, projectName }: RepositoryStartClientProps) {
  const [repositories, setRepositories] = useState<SourceRepository[]>([]);
  const [candidates, setCandidates] = useState<GitHubInstalledRepositoryCandidate[]>([]);
  const [installationState, setInstallationState] = useState("");
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const activeRepository = useMemo(
    () => findActiveGitHubRepository(repositories),
    [repositories]
  );

  useEffect(() => {
    if (!projectId) {
      setLoadState("error");
      setErrorMessage("프로젝트 정보가 없습니다. 새 프로젝트 화면에서 다시 시작해주세요.");
      return;
    }

    void loadRepositories();
  }, [projectId]);

  // 이미 연결된 Repository를 복원해 callback 뒤에도 같은 단계에서 이어갑니다.
  async function loadRepositories(): Promise<void> {
    setLoadState("loading");
    setErrorMessage("");

    try {
      setRepositories(await listSourceRepositories(projectId));
      setLoadState("idle");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository 연결 상태를 불러오지 못했습니다."));
    }
  }

  // 현재 GitHub App 권한으로 선택할 수 있는 Repository만 불러옵니다.
  async function loadCandidates(): Promise<void> {
    setActionState("loading");
    setErrorMessage("");

    try {
      const result = await listGitHubInstalledRepositories(projectId);
      setCandidates(result.repositories);
      setInstallationState(result.state);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "연결 가능한 Repository를 불러오지 못했습니다."));
    }
  }

  // 권한이 없는 경우 GitHub App 설치 화면으로 이동합니다.
  async function openGitHubInstallation(): Promise<void> {
    setActionState("loading");
    setErrorMessage("");

    try {
      const { installUrl } = await createGitHubSourceRepositoryInstallUrl(projectId);
      window.location.assign(installUrl);
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "GitHub 연결 화면을 열지 못했습니다."));
    }
  }

  // 사용자가 고른 Repository 하나만 현재 프로젝트에 연결합니다.
  async function connectRepository(candidate: GitHubInstalledRepositoryCandidate): Promise<void> {
    if (!installationState || candidate.archived) return;
    setActionState("loading");
    setErrorMessage("");

    try {
      const connected = await connectGitHubSourceRepository({
        githubRepositoryId: candidate.githubRepositoryId,
        installationId: candidate.installationId,
        projectId,
        state: installationState
      });
      setRepositories([connected]);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository를 연결하지 못했습니다."));
    }
  }

  // 연결된 Repository의 근거 파일을 분석해 적합한 Template을 찾습니다.
  async function analyzeRepository(): Promise<void> {
    if (!activeRepository || actionState === "loading") return;
    setActionState("loading");
    setErrorMessage("");

    try {
      const result = await analyzeSourceRepository(projectId, activeRepository.id);
      setRepositories((current) => applyRepositoryAnalysis(current, result));
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository를 분석하지 못했습니다."));
    }
  }

  const boardHref = createRepositoryBoardHref(projectId, projectName, activeRepository);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <Link href="/workspace/new">시작 방식 다시 선택</Link>
      </header>

      <section className={styles.content} aria-labelledby="repository-start-title">
        <header className={styles.heading}>
          <span>GitHub Repository</span>
          <h1 id="repository-start-title">코드를 기준으로 시작하기</h1>
          <p>{projectName}</p>
        </header>

        {loadState === "loading" ? (
          <ProductState description="연결 정보를 확인하고 있습니다." kind="loading" title="불러오는 중" />
        ) : null}

        {loadState === "error" ? (
          <ProductState
            action={<button onClick={() => void loadRepositories()} type="button">다시 시도</button>}
            description={errorMessage}
            kind="error"
            title="연결 상태를 불러오지 못했습니다"
          />
        ) : null}

        {loadState === "idle" && !activeRepository ? (
          <section className={styles.connectionPanel}>
            <GitBranch aria-hidden="true" size={24} />
            <h2>Repository를 선택하세요</h2>
            <div className={styles.actions}>
              <button disabled={actionState === "loading"} onClick={() => void loadCandidates()} type="button">
                연결 가능한 Repository 보기
              </button>
              <button className={styles.secondaryAction} disabled={actionState === "loading"} onClick={() => void openGitHubInstallation()} type="button">
                <SquareArrowOutUpRight aria-hidden="true" size={16} /> GitHub 권한 추가
              </button>
            </div>
            <RepositoryCandidates
              actionState={actionState}
              candidates={candidates}
              onConnect={(candidate) => void connectRepository(candidate)}
            />
          </section>
        ) : null}

        {activeRepository ? (
          <section className={styles.analysisPanel}>
            <div>
              <span>연결된 Repository</span>
              <h2>{activeRepository.owner}/{activeRepository.name}</h2>
              <p>{activeRepository.defaultBranch}</p>
            </div>
            <button disabled={actionState === "loading"} onClick={() => void analyzeRepository()} type="button">
              {actionState === "loading" ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
              {actionState === "loading" ? "분석 중" : "Repository 분석"}
            </button>
            {boardHref ? <Link className={styles.boardAction} href={boardHref}>추천 구조로 Board 열기</Link> : null}
          </section>
        ) : null}

        {errorMessage && loadState !== "error" ? (
          <ProductState compact description={errorMessage} kind="error" title="작업을 완료하지 못했습니다" />
        ) : null}
      </section>
    </main>
  );
}

// 사용 가능한 Repository 목록과 각 연결 행동만 표시합니다.
function RepositoryCandidates({
  actionState,
  candidates,
  onConnect
}: {
  readonly actionState: RequestState;
  readonly candidates: readonly GitHubInstalledRepositoryCandidate[];
  readonly onConnect: (candidate: GitHubInstalledRepositoryCandidate) => void;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className={styles.candidateList}>
      {candidates.map((candidate) => (
        <article key={`${candidate.installationId}-${candidate.githubRepositoryId}`}>
          <div><strong>{candidate.fullName}</strong><span>{candidate.defaultBranch}</span></div>
          <button disabled={actionState === "loading" || candidate.archived} onClick={() => onConnect(candidate)} type="button">
            {candidate.archived ? "Archived" : "연결"}
          </button>
        </article>
      ))}
    </div>
  );
}

// 분석에서 Template이 확정된 경우에만 변조하기 어려운 Board 이동 주소를 만듭니다.
function createRepositoryBoardHref(
  projectId: string,
  projectName: string,
  repository: SourceRepository | null
): string | null {
  const handoff = repository?.analysis?.aiHandoff;
  if (!repository || handoff?.status !== "template_selected") return null;

  return `/workspace?${new URLSearchParams({
    projectId,
    projectName,
    sourceRepositoryId: repository.id,
    templateId: handoff.templateId
  }).toString()}`;
}
