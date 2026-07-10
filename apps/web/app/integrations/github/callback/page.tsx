"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import {
  connectGitHubSourceRepository,
  createGitHubSourceRepositoryInstallUrl,
  listGitHubInstallationRepositories
} from "../../../../features/workspace/api";
import { getApiErrorMessage } from "../../../../lib/api-client";

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
    <main style={pageStyle}>
      <section style={panelStyle}>
        <header style={headerStyle}>
          <p style={eyebrowStyle}>GitHub App</p>
          <h1 style={titleStyle}>Repository 연결</h1>
        </header>

        {callbackState.status === "loading" ? (
          <p style={mutedStyle}>GitHub repository 목록을 불러오는 중입니다.</p>
        ) : null}

        {callbackState.status === "saving" ? (
          <p style={mutedStyle}>선택한 repository를 프로젝트에 연결하는 중입니다.</p>
        ) : null}

        {callbackState.status === "error" ? (
          <div style={errorStyle}>{callbackState.message}</div>
        ) : null}

        {callbackState.status === "ready" ? (
          <>
            <p style={mutedStyle}>
              설치된 repository 중 프로젝트에 연결할 repository 1개를 선택하세요.
            </p>
            <div style={listStyle}>
              {callbackState.repositories.map((repository) => (
                <button
                  disabled={repository.archived}
                  key={repository.githubRepositoryId}
                  onClick={() => void selectRepository(repository)}
                  style={{
                    ...repoButtonStyle,
                    ...(repository.archived ? disabledRepoButtonStyle : {})
                  }}
                  type="button"
                >
                  <span style={repoNameStyle}>{repository.fullName}</span>
                  <span style={repoMetaStyle}>
                    {repository.defaultBranch} / {repository.visibility}
                    {repository.archived ? " / archived" : ""}
                  </span>
                </button>
              ))}
            </div>
            {selectableRepositories.length === 0 ? (
              <p style={mutedStyle}>선택 가능한 repository가 없습니다.</p>
            ) : null}
            <div style={actionRowStyle}>
              <button
                onClick={() => void startGitHubInstallationFromCallback()}
                style={installButtonStyle}
                type="button"
              >
                GitHub App 설치/권한 추가
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

const pageStyle = {
  alignItems: "flex-start",
  background: "#f6f8fb",
  color: "#172033",
  display: "flex",
  minHeight: "100vh",
  padding: "48px 20px"
} as const;

const panelStyle = {
  margin: "0 auto",
  maxWidth: "720px",
  width: "100%"
} as const;

const headerStyle = {
  marginBottom: "20px"
} as const;

const eyebrowStyle = {
  color: "#2563eb",
  fontSize: "12px",
  fontWeight: 800,
  margin: "0 0 6px",
  textTransform: "uppercase"
} as const;

const titleStyle = {
  fontSize: "28px",
  lineHeight: 1.15,
  margin: 0
} as const;

const mutedStyle = {
  color: "#526071",
  fontSize: "14px",
  lineHeight: 1.6,
  margin: "0 0 16px"
} as const;

const listStyle = {
  display: "grid",
  gap: "10px"
} as const;

const repoButtonStyle = {
  alignItems: "flex-start",
  background: "#ffffff",
  border: "1px solid #d9e1ec",
  borderRadius: "8px",
  color: "#172033",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  minHeight: "68px",
  padding: "14px 16px",
  textAlign: "left",
  width: "100%"
} as const;

const disabledRepoButtonStyle = {
  cursor: "not-allowed",
  opacity: 0.54
} as const;

const repoNameStyle = {
  fontSize: "15px",
  fontWeight: 800,
  overflowWrap: "anywhere"
} as const;

const repoMetaStyle = {
  color: "#64748b",
  fontSize: "13px",
  overflowWrap: "anywhere"
} as const;

const errorStyle = {
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  borderRadius: "8px",
  color: "#9f1239",
  fontSize: "14px",
  lineHeight: 1.5,
  padding: "14px 16px"
} as const;

const actionRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "16px"
} as const;

const installButtonStyle = {
  background: "#2563eb",
  border: "1px solid #2563eb",
  borderRadius: "8px",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 800,
  minHeight: "40px",
  padding: "8px 14px"
} as const;
