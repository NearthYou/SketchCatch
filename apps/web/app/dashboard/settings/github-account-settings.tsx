"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { GitHubInstallationConnection } from "@sketchcatch/types";
import { useAuth } from "../../../components/auth/auth-provider";
import { DashboardIcon } from "../../../components/dashboard/dashboard-icons";
import {
  createGitHubAccountInstallUrl,
  listGitHubAccountInstallations
} from "../../../features/workspace/api";
import { getApiErrorMessage } from "../../../lib/api-client";
import styles from "../dashboard-tools.module.css";

type GitHubSettingsState = "loading" | "ready" | "error";

// GitHub App installation과 repository 접근 권한을 사용자 계정 단위로 관리합니다.
export function GitHubAccountSettings() {
  const { status: authStatus } = useAuth();
  const [installations, setInstallations] = useState<readonly GitHubInstallationConnection[]>([]);
  const [loadState, setLoadState] = useState<GitHubSettingsState>("loading");
  const [actionPending, setActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadInstallations(): Promise<void> {
    setLoadState("loading");
    setErrorMessage("");

    try {
      setInstallations(await listGitHubAccountInstallations());
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(getApiErrorMessage(error, "GitHub 연결 정보를 불러오지 못했습니다."));
    }
  }

  async function openGitHubInstallation(): Promise<void> {
    setActionPending(true);
    setErrorMessage("");

    try {
      const { installUrl } = await createGitHubAccountInstallUrl();
      window.location.assign(installUrl);
    } catch (error) {
      setActionPending(false);
      setErrorMessage(getApiErrorMessage(error, "GitHub App 설치 화면을 열지 못했습니다."));
    }
  }

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadInstallations();
    }
  }, [authStatus]);

  return (
    <section className={styles.settingsSection} aria-labelledby="github-account-settings-title">
      <header>
        <DashboardIcon name="github" />
        <div>
          <h2 id="github-account-settings-title">GitHub App 연결</h2>
          <p>SketchCatch 로그인 방식과 관계없이 모든 프로젝트에서 사용할 GitHub App 권한을 관리합니다.</p>
        </div>
      </header>

      {loadState === "loading" ? (
        <p className={styles.githubSettingsMessage} role="status">
          GitHub 연결 상태를 확인하고 있습니다.
        </p>
      ) : null}

      {loadState === "error" ? (
        <div className={styles.githubSettingsError} role="alert">
          <p>{errorMessage}</p>
          <button disabled={actionPending} onClick={() => void loadInstallations()} type="button">
            다시 시도
          </button>
        </div>
      ) : null}

      {loadState === "ready" && installations.length === 0 ? (
        <p className={styles.githubSettingsMessage} role="status">
          아직 연결된 GitHub App installation이 없습니다.
        </p>
      ) : null}

      {installations.length > 0 ? (
        <div className={styles.githubInstallationList} aria-label="연결된 GitHub App installation">
          {installations.map((installation) => (
            <article className={styles.githubInstallationCard} key={installation.installationId}>
              <div className={styles.connectionStatus} data-status="verified">
                <CheckCircle2 aria-hidden="true" size={16} />
                <span>연결됨</span>
              </div>
              <div className={styles.githubInstallationDetails}>
                <strong>{installation.accountLogin}</strong>
                <p>
                  {installation.accountType ?? "GitHub account"} · {formatRepositorySelection(
                    installation.repositorySelection
                  )} · repository {installation.repositoryCount}개
                </p>
              </div>
              {installation.htmlUrl ? (
                <a href={installation.htmlUrl} rel="noreferrer" target="_blank">
                  GitHub 권한 관리
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className={styles.githubSettingsActions}>
        <button
          className={styles.primaryAction}
          disabled={actionPending}
          onClick={() => void openGitHubInstallation()}
          type="button"
        >
          <DashboardIcon name="github" />
          {actionPending ? "GitHub로 이동 중" : "GitHub App 설치/권한 추가"}
        </button>
      </div>
    </section>
  );
}

function formatRepositorySelection(selection: GitHubInstallationConnection["repositorySelection"]): string {
  if (selection === "all") return "모든 repository";
  if (selection === "selected") return "선택한 repository";
  return "권한 범위 확인 필요";
}
