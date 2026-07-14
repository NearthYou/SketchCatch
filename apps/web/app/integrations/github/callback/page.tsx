"use client";

import { ArrowLeft, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { GitHubRepositoryCandidate, SourceRepository } from "@sketchcatch/types";
import { ProductBrand } from "../../../../components/ui/ProductBrand";
import {
  connectGitHubSourceRepository,
  listGitHubInstallationRepositories
} from "../../../../features/workspace/api";
import { getApiErrorMessage } from "../../../../lib/api-client";
import { ProjectCicdMonitoringSettingsClient } from "../../../projects/[projectId]/settings/project-cicd-monitoring-settings-client";
import { ProjectDeploymentTargetSettingsClient } from "../../../projects/[projectId]/settings/project-deployment-target-settings-client";
import {
  readRepositoryAnalysisResume,
  type RepositoryAnalysisResumeState
} from "../../../workspace/repository/repository-analysis-resume";
import {
  canResumeRepositoryAnalysis,
  createCallbackEcsDefaults,
  selectCallbackTarget
} from "./github-callback-state";
import styles from "./github-callback.module.css";

type CallbackState =
  | { readonly status: "loading" | "connecting" }
  | { readonly message: string; readonly status: "error" }
  | {
      readonly projectId: string;
      readonly repository: SourceRepository;
      readonly resume: RepositoryAnalysisResumeState;
      readonly resumeKey: string;
      readonly status: "configuring";
    };

// GitHub App callback은 분석했던 Repository만 연결하고 두 필수 설정을 저장한 뒤 분석 화면으로 돌아갑니다.
export default function GitHubIntegrationCallbackPage() {
  const router = useRouter();
  const [callbackState, setCallbackState] = useState<CallbackState>({ status: "loading" });
  const [deploymentTargetSaved, setDeploymentTargetSaved] = useState(false);
  const [gitOpsMonitoringSaved, setGitOpsMonitoringSaved] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const ecsDefaults = useMemo(
    () => callbackState.status === "configuring"
      ? createCallbackEcsDefaults(callbackState.resume)
      : null,
    [callbackState]
  );
  const monitoringDefaults = useMemo(
    () => callbackState.status === "configuring"
      ? createCallbackMonitoringDefaults(callbackState.resume, ecsDefaults?.sourceRoot ?? ".")
      : undefined,
    [callbackState, ecsDefaults?.sourceRoot]
  );

  useEffect(() => {
    let cancelled = false;

    async function connectTargetRepository(): Promise<void> {
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
        const repositoryUrl = getRepositoryUrl(target);
        const resume = readRepositoryAnalysisResume(window.sessionStorage, {
          resumeKey: result.resumeKey,
          projectId: result.projectId,
          repositoryUrl
        });
        if (!resume) {
          throw new Error("이전 Repository 분석 정보가 만료되었거나 현재 연결 대상과 일치하지 않습니다.");
        }

        setCallbackState({ status: "connecting" });
        const connected = await connectGitHubSourceRepository({
          githubRepositoryId: target.githubRepositoryId,
          installationId,
          projectId: result.projectId,
          state
        });
        if (cancelled) return;

        window.history.replaceState(null, "", window.location.pathname);
        setCallbackState({
          status: "configuring",
          projectId: result.projectId,
          repository: connected,
          resume,
          resumeKey: result.resumeKey
        });
      } catch (error) {
        if (cancelled) return;
        setCallbackState({
          status: "error",
          message: getCallbackErrorMessage(error)
        });
      }
    }

    void connectTargetRepository();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (
      callbackState.status !== "configuring" ||
      !canResumeRepositoryAnalysis({ deploymentTargetSaved, gitOpsMonitoringSaved })
    ) {
      return;
    }

    setIsReturning(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        projectId: callbackState.projectId,
        projectName: callbackState.resume.projectName,
        resumeKey: callbackState.resumeKey
      });
      router.replace(`/workspace/repository?${params.toString()}`);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [callbackState, deploymentTargetSaved, gitOpsMonitoringSaved, router]);

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
          <h1 id="github-callback-title">필수 배포 설정</h1>
          <p>분석한 Repository를 연결했습니다. 두 설정을 모두 저장하면 보드 생성 흐름으로 돌아갑니다.</p>
        </header>

        {callbackState.status === "loading" || callbackState.status === "connecting" ? (
          <div aria-live="polite" className={styles.progress} role="status">
            <LoaderCircle aria-hidden="true" size={18} />
            <div>
              <strong>{callbackState.status === "loading" ? "연결 대상을 확인하는 중" : "분석한 Repository 연결 중"}</strong>
              <span>Repository를 다시 선택하거나 분석하지 않습니다.</span>
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

        {callbackState.status === "configuring" ? (
          <>
            <div className={styles.connectedRepository}>
              <Check aria-hidden="true" size={18} />
              <div>
                <strong>{callbackState.repository.owner}/{callbackState.repository.name}</strong>
                <span>{callbackState.resume.defaultBranch} · {callbackState.resume.publicAnalysis.repositoryRevision.slice(0, 12)}</span>
              </div>
            </div>

            <div className={styles.requiredSummary} aria-live="polite">
              <span data-saved={deploymentTargetSaved}>1. 프로젝트 배포 타깃 {deploymentTargetSaved ? "저장 완료" : "저장 필요"}</span>
              <span data-saved={gitOpsMonitoringSaved}>2. GitOps 감시 설정 {gitOpsMonitoringSaved ? "저장 완료" : "저장 필요"}</span>
            </div>

            {isReturning ? (
              <div className={styles.progress} role="status">
                <Check aria-hidden="true" size={18} />
                <div>
                  <strong>설정을 저장했습니다. Repository 분석으로 돌아갑니다.</strong>
                  <span>기존 분석 결과와 ECS Fargate 선택을 그대로 복원합니다.</span>
                </div>
              </div>
            ) : null}

            <div className={styles.settingsStack}>
              <ProjectDeploymentTargetSettingsClient
                ecsDefaults={ecsDefaults}
                onDirty={() => setDeploymentTargetSaved(false)}
                onSaved={() => setDeploymentTargetSaved(true)}
                preferEcsDefaults
                projectId={callbackState.projectId}
              />
              <ProjectCicdMonitoringSettingsClient
                initialDraft={monitoringDefaults}
                onDirty={() => setGitOpsMonitoringSaved(false)}
                onSaved={() => setGitOpsMonitoringSaved(true)}
                projectId={callbackState.projectId}
              />
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function getRepositoryUrl(repository: GitHubRepositoryCandidate): string {
  return repository.repositoryUrl ?? `https://github.com/${repository.owner}/${repository.name}`;
}

function getCallbackErrorMessage(error: unknown): string {
  if (error instanceof Error && /[가-힣]/u.test(error.message)) {
    return error.message;
  }

  return getApiErrorMessage(error, "분석한 Repository를 연결하지 못했습니다.");
}

function createCallbackMonitoringDefaults(
  resume: RepositoryAnalysisResumeState,
  sourceRoot: string
) {
  return {
    enabled: true,
    monitorBranch: resume.defaultBranch,
    appPath: sourceRoot === "."
      ? { mode: "repository_root" as const, path: "." }
      : { mode: "subdirectory" as const, path: sourceRoot },
    infraPath: { mode: "repository_root" as const, path: "." }
  };
}
