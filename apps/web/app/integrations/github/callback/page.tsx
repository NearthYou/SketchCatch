"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import { ArrowLeft, FileCode2, LoaderCircle, Plus, TriangleAlert } from "lucide-react";
import {
  connectGitHubSourceRepository,
  createGitHubSourceRepositoryInstallUrl,
  listGitHubInstallationRepositories
} from "../../../../features/workspace/api";
import { getApiErrorMessage } from "../../../../lib/api-client";
import styles from "./github-callback.module.css";

type CallbackState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      installationId: string;
      state: string;
      projectId: string;
      repositories: GitHubRepositoryCandidate[];
    }
  | { status: "saving"; projectId: string };

export default function GitHubIntegrationCallbackPage() {
  const router = useRouter();
  const [callbackState, setCallbackState] = useState<CallbackState>({ status: "loading" });
  const selectableRepositories = useMemo(
    () =>
      callbackState.status === "ready"
        ? callbackState.repositories.filter((repository) => !repository.archived)
        : [],
    [callbackState]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRepositories(): Promise<void> {
      const searchParams = new URLSearchParams(window.location.search);
      const installationId = searchParams.get("installation_id")?.trim();
      const state = searchParams.get("state")?.trim();

      if (!installationId || !state) {
        setCallbackState({
          status: "error",
          message:
            "GitHub 연결 정보가 없습니다. SketchCatch의 GitHub 연결 버튼에서 다시 시작해주세요."
        });
        return;
      }

      try {
        const result = await listGitHubInstallationRepositories({
          installationId,
          state
        });

        if (cancelled) {
          return;
        }

        setCallbackState({
          status: "ready",
          installationId,
          state,
          projectId: result.projectId,
          repositories: result.repositories
        });
      } catch (error) {
        if (!cancelled) {
          setCallbackState({
            status: "error",
            message: getApiErrorMessage(error, "GitHub repository 목록을 불러오지 못했습니다.")
          });
        }
      }
    }

    void loadRepositories();

    return () => {
      cancelled = true;
    };
  }, []);

  async function selectRepository(repository: GitHubRepositoryCandidate): Promise<void> {
    if (callbackState.status !== "ready") {
      return;
    }

    setCallbackState({
      status: "saving",
      projectId: callbackState.projectId
    });

    try {
      const connectedRepository = await connectGitHubSourceRepository({
        projectId: callbackState.projectId,
        installationId: callbackState.installationId,
        githubRepositoryId: repository.githubRepositoryId,
        state: callbackState.state
      });

      router.replace(`/workspace?projectId=${encodeURIComponent(connectedRepository.projectId)}`);
    } catch (error) {
      setCallbackState({
        status: "error",
        message: getApiErrorMessage(error, "GitHub repository를 프로젝트에 연결하지 못했습니다.")
      });
    }
  }

  async function startGitHubInstallationFromCallback(): Promise<void> {
    if (callbackState.status !== "ready") {
      return;
    }

    try {
      const { installUrl } = await createGitHubSourceRepositoryInstallUrl(
        callbackState.projectId
      );

      window.location.assign(installUrl);
    } catch (error) {
      setCallbackState({
        status: "error",
        message: getApiErrorMessage(error, "GitHub App 설치 화면을 열지 못했습니다.")
      });
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/dashboard" aria-label="SketchCatch Dashboard">
          <Image alt="" height={24} priority src="/sketchcatch-logo.png" width={16} />
          <span>SketchCatch</span>
        </Link>
        <strong>Source Repository</strong>
        <Link className={styles.backLink} href="/workspace/new">
          <ArrowLeft aria-hidden="true" size={16} />
          새 프로젝트
        </Link>
      </header>

      <section className={styles.panel} aria-labelledby="repository-connect-title">
        <header className={styles.heading}>
          <span>GITHUB APP</span>
          <h1 id="repository-connect-title">Repository 선택</h1>
        </header>

        {callbackState.status === "loading" ? (
          <div className={styles.progress} role="status">
            <LoaderCircle aria-hidden="true" size={18} />
            Repository 목록을 불러오는 중입니다.
          </div>
        ) : null}

        {callbackState.status === "saving" ? (
          <div className={styles.progress} role="status">
            <LoaderCircle aria-hidden="true" size={18} />
            선택한 Repository를 연결하는 중입니다.
          </div>
        ) : null}

        {callbackState.status === "error" ? (
          <div className={styles.errorState} role="alert">
            <TriangleAlert aria-hidden="true" size={18} />
            <span>{callbackState.message}</span>
          </div>
        ) : null}

        {callbackState.status === "ready" ? (
          <>
            <p className={styles.instruction}>연결할 Repository 하나를 선택하세요.</p>
            <div className={styles.repositoryList}>
              {callbackState.repositories.map((repository) => (
                <button
                  className={styles.repositoryButton}
                  disabled={repository.archived}
                  key={repository.githubRepositoryId}
                  onClick={() => void selectRepository(repository)}
                  type="button"
                >
                  <span className={styles.repositoryIcon}>
                    <FileCode2 aria-hidden="true" size={18} />
                  </span>
                  <span className={styles.repositoryCopy}>
                    <strong>{repository.fullName}</strong>
                    <small>
                      {repository.defaultBranch} · {repository.visibility}
                      {repository.archived ? " · archived" : ""}
                    </small>
                  </span>
                  <span className={styles.selectLabel}>선택</span>
                </button>
              ))}
            </div>
            {selectableRepositories.length === 0 ? (
              <div className={styles.emptyState}>선택 가능한 Repository가 없습니다.</div>
            ) : null}
            <footer className={styles.actions}>
              <button
                className={styles.secondaryButton}
                onClick={() => void startGitHubInstallationFromCallback()}
                type="button"
              >
                <Plus aria-hidden="true" size={16} />
                Repository 권한 추가
              </button>
            </footer>
          </>
        ) : null}
      </section>
    </main>
  );
}
