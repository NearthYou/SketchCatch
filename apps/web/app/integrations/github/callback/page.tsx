"use client";

import { ArrowLeft, FileCode2, LoaderCircle, Settings2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import { ProductBrand } from "../../../../components/ui/ProductBrand";
import {
  connectGitHubSourceRepository,
  listGitHubInstallationRepositories
} from "../../../../features/workspace/api";
import { getApiErrorMessage } from "../../../../lib/api-client";
import styles from "./github-callback.module.css";

type CallbackState =
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "error" }
  | {
      readonly installationId: string;
      readonly projectId: string;
      readonly repositories: readonly GitHubRepositoryCandidate[];
      readonly state: string;
      readonly status: "ready";
    }
  | { readonly status: "saving" };

// GitHub App에서 돌아온 사용자가 Repository 하나를 골라 프로젝트 시작 흐름을 이어가게 합니다.
export default function GitHubIntegrationCallbackPage() {
  const router = useRouter();
  const [callbackState, setCallbackState] = useState<CallbackState>({ status: "loading" });
  const selectableCount = useMemo(
    () =>
      callbackState.status === "ready"
        ? callbackState.repositories.filter((repository) => !repository.archived).length
        : 0,
    [callbackState]
  );

  // URL의 GitHub callback 값을 서버에 보내 선택 가능한 Repository를 불러옵니다.
  useEffect(() => {
    let cancelled = false;

    async function loadRepositories(): Promise<void> {
      const searchParams = new URLSearchParams(window.location.search);
      const installationId = searchParams.get("installation_id")?.trim();
      const state = searchParams.get("state")?.trim();

      if (!installationId || !state) {
        setCallbackState({
          status: "error",
          message: "GitHub 연결 정보가 없습니다. Repository 시작 화면에서 다시 연결해주세요."
        });
        return;
      }

      try {
        const result = await listGitHubInstallationRepositories({ installationId, state });
        if (cancelled) return;
        setCallbackState({
          installationId,
          projectId: result.projectId,
          repositories: result.repositories,
          state,
          status: "ready"
        });
      } catch (error) {
        if (cancelled) return;
        setCallbackState({
          status: "error",
          message: getApiErrorMessage(error, "Repository 목록을 불러오지 못했습니다.")
        });
      }
    }

    void loadRepositories();
    return () => {
      cancelled = true;
    };
  }, []);

  // 사용자가 고른 Repository만 프로젝트에 연결하고 분석 시작 화면으로 돌아갑니다.
  async function selectRepository(repository: GitHubRepositoryCandidate): Promise<void> {
    if (callbackState.status !== "ready" || repository.archived) return;
    setCallbackState({ status: "saving" });

    try {
      const connected = await connectGitHubSourceRepository({
        githubRepositoryId: repository.githubRepositoryId,
        installationId: callbackState.installationId,
        projectId: callbackState.projectId,
        state: callbackState.state
      });
      const params = new URLSearchParams({
        projectId: connected.projectId,
        projectName: connected.name,
        sourceRepositoryId: connected.id
      });
      router.replace(`/workspace/repository?${params.toString()}`);
    } catch (error) {
      setCallbackState({
        status: "error",
        message: getApiErrorMessage(error, "Repository를 연결하지 못했습니다.")
      });
    }
  }

  // Repository access expansion is managed from project settings.
  async function openProjectGitHubSettings(): Promise<void> {
    if (callbackState.status !== "ready") return;

    router.push(createProjectGitHubSettingsHref(callbackState.projectId));
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <Link href="/workspace/new">
          <ArrowLeft aria-hidden="true" size={16} />
          새 프로젝트
        </Link>
      </header>

      <section aria-labelledby="github-callback-title" className={styles.content}>
        <header className={styles.heading}>
          <span>GitHub App</span>
          <h1 id="github-callback-title">Repository 선택</h1>
          <p>Architecture 초안을 만들 코드 저장소 하나를 고르세요.</p>
        </header>

        {callbackState.status === "loading" || callbackState.status === "saving" ? (
          <div aria-live="polite" className={styles.progress} role="status">
            <LoaderCircle aria-hidden="true" size={18} />
            <div>
              <strong>{callbackState.status === "loading" ? "목록을 불러오는 중" : "Repository 연결 중"}</strong>
              <span>이 화면을 닫지 마세요.</span>
            </div>
          </div>
        ) : null}

        {callbackState.status === "error" ? (
          <div className={styles.errorState} role="alert">
            <TriangleAlert aria-hidden="true" size={18} />
            <div><strong>연결을 완료하지 못했습니다</strong><span>{callbackState.message}</span></div>
            <Link href="/workspace/new">시작 방식 다시 선택</Link>
          </div>
        ) : null}

        {callbackState.status === "ready" ? (
          <>
            <div className={styles.listHeader}>
              <span>선택 가능 {selectableCount}개</span>
              <button onClick={() => void openProjectGitHubSettings()} type="button">
                <Settings2 aria-hidden="true" size={15} />
                Manage permissions in settings
              </button>
            </div>
            <div className={styles.repositoryList}>
              {callbackState.repositories.map((repository) => (
                <button
                  disabled={repository.archived}
                  key={repository.githubRepositoryId}
                  onClick={() => void selectRepository(repository)}
                  type="button"
                >
                  <FileCode2 aria-hidden="true" size={18} />
                  <span>
                    <strong>{repository.fullName}</strong>
                    <small>{repository.defaultBranch} · {repository.visibility}</small>
                  </span>
                  <b>{repository.archived ? "Archived" : "선택"}</b>
                </button>
              ))}
            </div>
            {selectableCount === 0 ? (
              <div className={styles.emptyState}>
                <strong>선택 가능한 Repository가 없습니다.</strong>
                <span>Manage repository access from project settings.</span>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function createProjectGitHubSettingsHref(projectId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}/settings?tab=github`;
}
