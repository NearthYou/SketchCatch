"use client";

import { ArrowLeft, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import { ProductBrand } from "../../../../components/ui/ProductBrand";
import {
  connectGitHubSourceRepository,
  createGitHubInstallationUserAuthorization,
  listGitHubInstallationRepositories
} from "../../../../features/workspace/api";
import { getApiErrorMessage } from "../../../../lib/api-client";
import { readRepositoryAnalysisResume } from "../../../workspace/repository/repository-analysis-resume";
import { selectCallbackTarget } from "./github-callback-state";
import styles from "./github-callback.module.css";

type CallbackState =
  | { readonly status: "loading" | "connecting" }
  | { readonly message: string; readonly status: "error" };

// callback은 정확한 Repository만 연결하고, 배포 설정은 원래 분석을 마친 뒤 Delivery에서 받는다.
export default function GitHubIntegrationCallbackPage() {
  const router = useRouter();
  const [callbackState, setCallbackState] = useState<CallbackState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function connectTargetRepository(): Promise<void> {
      const searchParams = new URLSearchParams(window.location.search);
      const installationId = searchParams.get("installation_id")?.trim();
      const state = searchParams.get("state")?.trim();
      const authorization = searchParams.get("authorization")?.trim();

      if (!installationId || !state) {
        setCallbackState({
          status: "error",
          message: "GitHub 연결 정보가 없습니다. Repository 시작 화면에서 다시 연결해주세요."
        });
        return;
      }

      try {
        if (authorization !== "verified") {
          const result = await createGitHubInstallationUserAuthorization({ installationId, state });
          if (!cancelled) window.location.assign(result.authorizationUrl);
          return;
        }

        const result = await listGitHubInstallationRepositories({ installationId, state });
        if (cancelled) return;
        if (result.scope === "account") {
          router.replace("/dashboard/settings?github=connected");
          return;
        }
        if (!result.targetRepository || !result.resumeKey) {
          throw new Error("분석한 Repository 복귀 정보가 GitHub 연결에 포함되지 않았습니다.");
        }

        const target = selectCallbackTarget(result.repositories, result.targetRepository);
        if (!target || target.archived) {
          throw new Error(
            "분석한 Repository에 대한 GitHub App 권한이 없습니다. GitHub 설정에서 해당 Repository 접근 권한을 추가해주세요."
          );
        }
        const resume = readRepositoryAnalysisResume(window.sessionStorage, {
          resumeKey: result.resumeKey,
          projectId: result.projectId,
          repositoryUrl: getRepositoryUrl(target)
        });
        if (!resume) {
          throw new Error("이전 Repository 분석 정보가 만료되었거나 현재 연결 대상과 일치하지 않습니다.");
        }

        setCallbackState({ status: "connecting" });
        await connectGitHubSourceRepository({
          githubRepositoryId: target.githubRepositoryId,
          installationId,
          projectId: result.projectId,
          state
        });
        if (cancelled) return;

        const params = new URLSearchParams({
          projectId: result.projectId,
          projectName: resume.projectName,
          resumeKey: result.resumeKey
        });
        router.replace(`/workspace/repository?${params.toString()}`);
      } catch (error) {
        if (!cancelled) {
          setCallbackState({ status: "error", message: getCallbackErrorMessage(error) });
        }
      }
    }

    void connectTargetRepository();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <Link href="/workspace/new"><ArrowLeft aria-hidden="true" size={16} />새 프로젝트</Link>
      </header>
      <section aria-labelledby="github-callback-title" className={styles.content}>
        <header className={styles.heading}>
          <span>GitHub App</span>
          <h1 id="github-callback-title">Repository 연결</h1>
          <p>권한을 확인한 뒤 입력했던 Repository 분석으로 돌아갑니다.</p>
        </header>
        {callbackState.status === "loading" || callbackState.status === "connecting" ? (
          <div aria-live="polite" className={styles.progress} role="status">
            <LoaderCircle aria-hidden="true" size={18} />
            <div>
              <strong>{callbackState.status === "loading" ? "GitHub 권한을 확인하는 중" : "분석한 Repository 연결 중"}</strong>
              <span>다른 Repository를 임의로 선택하지 않고 입력한 대상만 확인합니다.</span>
            </div>
          </div>
        ) : null}
        {callbackState.status === "error" ? (
          <div className={styles.errorState} role="alert">
            <TriangleAlert aria-hidden="true" size={18} />
            <div><strong>연결을 완료하지 못했습니다</strong><span>{callbackState.message}</span></div>
            <Link href="/dashboard/settings">GitHub 권한 설정</Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function getRepositoryUrl(repository: GitHubRepositoryCandidate): string {
  return repository.repositoryUrl ?? `https://github.com/${repository.owner}/${repository.name}`;
}

function getCallbackErrorMessage(error: unknown): string {
  if (error instanceof Error && /[가-힣]/u.test(error.message)) return error.message;
  return getApiErrorMessage(error, "분석한 Repository를 연결하지 못했습니다.");
}
