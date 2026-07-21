"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type { GitHubInstalledRepositoryCandidate, ProjectDeliveryProfile } from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  connectGitHubSourceRepository,
  listGitHubInstalledRepositories
} from "./api";
import styles from "./delivery-center.module.css";

type RequestState = "idle" | "loading" | "submitting" | "error";

export function CicdRepositoryConnectionForm({
  onCancel,
  onSaved,
  profile,
  projectId
}: {
  readonly onCancel: () => void;
  readonly onSaved: () => void;
  readonly profile: Pick<ProjectDeliveryProfile, "githubInstallations" | "sourceRepository">;
  readonly projectId: string;
}) {
  const accountId = useId();
  const repositoryId = useId();
  const branchId = useId();
  const sourceRepository = profile.sourceRepository;
  const [repositories, setRepositories] = useState<GitHubInstalledRepositoryCandidate[]>([]);
  const [installationState, setInstallationState] = useState("");
  const [selectedInstallationId, setSelectedInstallationId] = useState(
    sourceRepository?.githubInstallationId ??
      profile.githubInstallations[0]?.installationId ??
      ""
  );
  const [selectedRepositoryKey, setSelectedRepositoryKey] = useState("");
  const [requestState, setRequestState] = useState<RequestState>(
    profile.githubInstallations.length > 0 ? "loading" : "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [loadRequestId, setLoadRequestId] = useState(0);

  useEffect(() => {
    if (profile.githubInstallations.length === 0) return;
    let isCurrent = true;

    async function loadRepositories(): Promise<void> {
      setRequestState("loading");
      setErrorMessage("");

      try {
        const response = await listGitHubInstalledRepositories(projectId);
        if (!isCurrent) return;

        const availableRepositories = response.repositories.filter((repository) => !repository.archived);
        const currentRepository = availableRepositories.find(
          (repository) =>
            repository.installationId === sourceRepository?.githubInstallationId &&
            repository.githubRepositoryId === sourceRepository?.githubRepositoryId
        );
        const configuredInstallationId =
          sourceRepository?.githubInstallationId ??
          profile.githubInstallations[0]?.installationId ??
          "";
        const preferredInstallationId =
          currentRepository?.installationId ??
          (availableRepositories.some(
            (repository) => repository.installationId === configuredInstallationId
          )
            ? configuredInstallationId
            : (availableRepositories[0]?.installationId ?? configuredInstallationId));
        const preferredRepository =
          currentRepository ??
          availableRepositories.find(
            (repository) => repository.installationId === preferredInstallationId
          ) ??
          null;

        setRepositories(availableRepositories);
        setInstallationState(response.state);
        setSelectedInstallationId(preferredInstallationId);
        setSelectedRepositoryKey(preferredRepository ? getRepositoryKey(preferredRepository) : "");
        setRequestState("idle");
      } catch (error) {
        if (!isCurrent) return;
        setRequestState("error");
        setErrorMessage(
          getApiErrorMessage(error, "GitHub Repository 목록을 불러오지 못했습니다.")
        );
      }
    }

    void loadRepositories();
    return () => {
      isCurrent = false;
    };
  }, [
    loadRequestId,
    profile.githubInstallations,
    projectId,
    sourceRepository
  ]);

  const accountRepositories = useMemo(
    () =>
      repositories.filter((repository) => repository.installationId === selectedInstallationId),
    [repositories, selectedInstallationId]
  );
  const selectedRepository = useMemo(
    () =>
      repositories.find((repository) => getRepositoryKey(repository) === selectedRepositoryKey) ??
      null,
    [repositories, selectedRepositoryKey]
  );
  const selectedRepositoryIsCurrent =
    selectedRepository !== null &&
    selectedRepository.installationId === sourceRepository?.githubInstallationId &&
    selectedRepository.githubRepositoryId === sourceRepository?.githubRepositoryId;
  const isBusy = requestState === "loading" || requestState === "submitting";

  function handleAccountChange(installationId: string): void {
    const firstRepository = repositories.find(
      (repository) => repository.installationId === installationId
    );
    setSelectedInstallationId(installationId);
    setSelectedRepositoryKey(firstRepository ? getRepositoryKey(firstRepository) : "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedRepository || !installationState || isBusy || selectedRepositoryIsCurrent) return;

    setRequestState("submitting");
    setErrorMessage("");

    try {
      await connectGitHubSourceRepository({
        projectId,
        installationId: selectedRepository.installationId,
        githubRepositoryId: selectedRepository.githubRepositoryId,
        state: installationState
      });
      onSaved();
    } catch (error) {
      setRequestState("error");
      setErrorMessage(
        getApiErrorMessage(error, "GitHub Repository를 프로젝트에 연결하지 못했습니다.")
      );
    }
  }

  if (profile.githubInstallations.length === 0) {
    return (
      <div className={styles.repositoryConnectionNotice}>
        <strong>GitHub 계정 연결이 필요합니다.</strong>
        <p>먼저 SketchCatch가 접근할 GitHub 계정을 연결해 주세요.</p>
        <Link
          className={styles.repositorySettingsLink}
          href="/dashboard/settings#github-account-settings-title"
        >
          GitHub 계정 설정 열기
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.repositoryConnectionForm} onSubmit={handleSubmit}>
      <div className={styles.repositoryFields}>
        <label className={styles.repositoryField} htmlFor={accountId}>
          <span>GitHub 계정</span>
          <select
            disabled={isBusy}
            id={accountId}
            onChange={(event) => handleAccountChange(event.target.value)}
            value={selectedInstallationId}
          >
            {profile.githubInstallations.map((installation) => (
              <option key={installation.installationId} value={installation.installationId}>
                {installation.accountLogin}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.repositoryField} htmlFor={repositoryId}>
          <span>Repository</span>
          <select
            disabled={isBusy || accountRepositories.length === 0}
            id={repositoryId}
            onChange={(event) => setSelectedRepositoryKey(event.target.value)}
            value={selectedRepositoryKey}
          >
            {accountRepositories.length === 0 ? (
              <option value="">연결 가능한 Repository가 없습니다</option>
            ) : null}
            {accountRepositories.map((repository) => (
              <option key={getRepositoryKey(repository)} value={getRepositoryKey(repository)}>
                {repository.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.repositoryField} htmlFor={branchId}>
          <span>Branch</span>
          <input
            id={branchId}
            readOnly
            value={selectedRepository?.defaultBranch ?? "Repository를 먼저 선택하세요"}
          />
        </label>
        <p className={styles.repositoryFieldHint}>
          기본 Branch를 연결하며, 변경 감지 Branch는 다음 단계에서 따로 설정할 수 있습니다.
        </p>
      </div>

      {requestState === "loading" ? (
        <p className={styles.repositoryInlineStatus} role="status">
          GitHub Repository를 불러오는 중입니다.
        </p>
      ) : null}
      {errorMessage ? (
        <div className={styles.repositoryFormError} role="alert">
          <p>{errorMessage}</p>
          <button onClick={() => setLoadRequestId((requestId) => requestId + 1)} type="button">
            다시 시도
          </button>
        </div>
      ) : null}

      <div className={styles.repositoryFormActions}>
        <button
          className={styles.repositorySecondaryButton}
          disabled={requestState === "submitting"}
          onClick={onCancel}
          type="button"
        >
          취소
        </button>
        <button
          className={styles.repositoryPrimaryButton}
          disabled={!selectedRepository || !installationState || isBusy || selectedRepositoryIsCurrent}
          type="submit"
        >
          {requestState === "submitting"
            ? "연결 중"
            : selectedRepositoryIsCurrent
              ? "연결됨"
              : "연결"}
        </button>
      </div>
    </form>
  );
}

function getRepositoryKey(repository: GitHubInstalledRepositoryCandidate): string {
  return `${repository.installationId}:${repository.githubRepositoryId}`;
}
