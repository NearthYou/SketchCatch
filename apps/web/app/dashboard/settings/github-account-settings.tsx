"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { GitHubInstallationConnection } from "@sketchcatch/types";
import { DashboardIcon } from "../../../components/dashboard/dashboard-icons";
import {
  createGitHubAccountInstallUrl
} from "../../../features/workspace/api";
import { getApiErrorMessage } from "../../../lib/api-client";
import { useGitHubInstallationsQuery } from "../../../features/dashboard/connection-queries";
import styles from "../dashboard-tools.module.css";

// GitHub App installation과 repository 접근 권한을 사용자 계정 단위로 관리합니다.
export function GitHubAccountSettings({ embedded = false }: { readonly embedded?: boolean }) {
  const installationsQuery = useGitHubInstallationsQuery();
  const installations: readonly GitHubInstallationConnection[] =
    installationsQuery.data?.installations ?? [];
  const availability = installationsQuery.data?.availability;
  const connectionSetupAvailability = availability?.connectionSetup;
  const installationReadAvailability = availability?.installationRead;
  const [actionPending, setActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function openGitHubInstallation(): Promise<void> {
    if (connectionSetupAvailability !== "ready") return;

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

  return (
    <section
      aria-labelledby="github-account-settings-title"
      className={embedded ? styles.embeddedSettingsSection : styles.settingsSection}
      id="github-account-connection"
    >
      {embedded ? (
        <p className={styles.embeddedSettingsDescription}>
          SketchCatch 로그인 방식과 관계없이 모든 프로젝트에서 사용할 GitHub App 권한을 관리합니다.
        </p>
      ) : (
        <header>
          <DashboardIcon name="github" />
          <div>
            <h2 id="github-account-settings-title">GitHub App 연결</h2>
            <p>SketchCatch 로그인 방식과 관계없이 모든 프로젝트에서 사용할 GitHub App 권한을 관리합니다.</p>
          </div>
        </header>
      )}

      {installationsQuery.isPending && installations.length === 0 ? (
        <p className={styles.githubSettingsMessage} role="status">
          GitHub 연결 상태를 확인하고 있습니다.
        </p>
      ) : null}

      {installationsQuery.isError ? (
        <div className={styles.githubSettingsError} role="alert">
          <p>{getApiErrorMessage(installationsQuery.error, "GitHub 연결 정보를 불러오지 못했습니다.")}</p>
          <button disabled={actionPending} onClick={() => void installationsQuery.refetch()} type="button">
            다시 시도
          </button>
        </div>
      ) : null}

      {installationsQuery.isSuccess && installationReadAvailability === "not_configured" ? (
        <p className={styles.githubSettingsMessage} role="status">
          GitHub App 서버 설정이 필요합니다. 설정이 완료되면 이 화면에서 연결할 수 있습니다.
        </p>
      ) : null}

      {installationsQuery.isSuccess &&
      installationReadAvailability === "ready" &&
      connectionSetupAvailability === "not_configured" ? (
        <p className={styles.githubSettingsMessage} role="status">
          새 GitHub 연결을 추가하려면 GitHub App 사용자 승인 서버 설정이 필요합니다.
        </p>
      ) : null}

      {installationsQuery.isSuccess &&
      installationReadAvailability === "ready" &&
      connectionSetupAvailability === "ready" &&
      installations.length === 0 ? (
        <p className={styles.githubSettingsMessage} role="status">
          아직 연결된 GitHub App installation이 없습니다.
        </p>
      ) : null}

      {errorMessage ? (
        <div className={styles.githubSettingsError} role="alert">
          <p>{errorMessage}</p>
        </div>
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

      {installations.length > 1 ? (
        <div className={styles.githubSettingsError} role="alert">
          <p>
            GitHub 연결 정리 필요: AWS CodeBuild 승인 대상을 하나로 확정하려면 활성 연결을 하나만 남겨 주세요.
          </p>
        </div>
      ) : null}

      <div className={styles.githubSettingsActions}>
        <button
          className={styles.primaryAction}
          disabled={actionPending || connectionSetupAvailability !== "ready"}
          onClick={() => void openGitHubInstallation()}
          type="button"
        >
          <DashboardIcon name="github" />
          {connectionSetupAvailability === "not_configured"
            ? "GitHub App 설정 대기"
            : actionPending
            ? "GitHub로 이동 중"
            : installations.length > 0
              ? "권한 추가"
              : "GitHub 연결하기"}
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
