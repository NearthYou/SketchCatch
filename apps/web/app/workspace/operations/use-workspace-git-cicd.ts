"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deployment, GitCicdHandoff, SourceRepository } from "@sketchcatch/types";
import {
  applyGitCicdAwsRoleDiff,
  applyGitCicdRepositorySettings,
  applyGitCicdRepositorySettingsWithGitHubOAuth,
  createGitCicdGitHubOAuthStartUrl,
  createGitCicdHandoff,
  getGitCicdHandoffPipelineStatus,
  listGitCicdHandoffs,
  listSourceRepositories
} from "../../../features/workspace/api";
import { shouldAutoRefreshGitCicdHandoff } from "../../../features/workspace/deployment-actions";
import {
  mergeGitCicdPipelineStatus,
  selectActiveGitHubRepositories,
  selectCurrentGitCicdHandoff
} from "../../../features/workspace/workspace-git-cicd-state";

type GitCicdRequestState = "idle" | "loading";

export type WorkspaceGitCicdState = {
  readonly current: GitCicdHandoff | null;
  readonly errorMessage: string;
  readonly handoffs: readonly GitCicdHandoff[];
  readonly repositories: readonly SourceRepository[];
  readonly requestState: GitCicdRequestState;
  readonly selectedRepositoryId: string;
  readonly setSelectedRepositoryId: (repositoryId: string) => void;
  readonly create: (userAcceptedChangeId: string) => Promise<void>;
  readonly applyRepositorySettings: () => Promise<void>;
  readonly startGitHubOAuth: () => Promise<void>;
  readonly applyRepositorySettingsWithOAuth: () => Promise<void>;
  readonly applyAwsRoleDiff: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly select: (handoffId: string) => void;
};

// 연결된 Repository와 현재 배포 결과를 Git/CI/CD handoff로 이어줍니다.
export function useWorkspaceGitCicd({
  deployment,
  projectId
}: {
  readonly deployment: Deployment | null;
  readonly projectId: string;
}): WorkspaceGitCicdState {
  const [repositories, setRepositories] = useState<readonly SourceRepository[]>([]);
  const [handoffs, setHandoffs] = useState<readonly GitCicdHandoff[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("");
  const [selectedHandoffId, setSelectedHandoffId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [requestState, setRequestState] = useState<GitCicdRequestState>("idle");
  const current = useMemo(
    () => selectCurrentGitCicdHandoff(handoffs, selectedHandoffId),
    [handoffs, selectedHandoffId]
  );

  // Repository와 handoff 목록을 함께 새로 읽고 유효한 선택을 유지합니다.
  const refresh = useCallback(async (): Promise<void> => {
    const [loadedRepositories, loadedHandoffs] = await Promise.all([
      listSourceRepositories(projectId),
      listGitCicdHandoffs(projectId)
    ]);
    const activeRepositories = selectActiveGitHubRepositories(loadedRepositories);
    setRepositories(activeRepositories);
    setHandoffs(loadedHandoffs);
    setSelectedRepositoryId((selected) =>
      activeRepositories.some((repository) => repository.id === selected)
        ? selected
        : activeRepositories[0]?.id ?? ""
    );
    setSelectedHandoffId((selected) =>
      selectCurrentGitCicdHandoff(loadedHandoffs, selected)?.id ?? ""
    );
  }, [projectId]);

  // 모든 handoff 작업에 같은 loading과 오류 처리를 적용합니다.
  const runAction = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setRequestState("loading");
    setErrorMessage("");
    try {
      await action();
    } catch (error) {
      setErrorMessage(toGitCicdError(error));
    } finally {
      setRequestState("idle");
    }
  }, []);

  // 현재 Plan 기준 artifact와 선택한 Repository로 새 handoff를 만듭니다.
  const create = useCallback(async (userAcceptedChangeId: string): Promise<void> => {
    if (!deployment || !selectedRepositoryId || !userAcceptedChangeId) return;
    await runAction(async () => {
      const created = await createGitCicdHandoff({
        projectId,
        architectureId: deployment.architectureId,
        terraformArtifactId: deployment.terraformArtifactId,
        handoffKind: "terraform_iac",
        deploymentMode: "infra_and_app",
        sourceDeploymentId: deployment.id,
        sourceRepositoryId: selectedRepositoryId,
        environmentName: "sketchcatch-production",
        rdsEnabled: false,
        awsRegion: deployment.approvedAwsRegion ?? "ap-northeast-2",
        pullRequestTitle: "SketchCatch infrastructure update",
        commitMessage: "Apply SketchCatch infrastructure changes",
        userAcceptedChangeId
      });
      setSelectedHandoffId(created.id);
      await refresh();
    });
  }, [deployment, projectId, refresh, runAction, selectedRepositoryId]);

  // handoff가 계산한 Repository variable, secret, workflow 변경을 적용합니다.
  const applyRepositorySettings = useCallback(async (): Promise<void> => {
    if (!current) return;
    await runAction(async () => {
      await applyGitCicdRepositorySettings(current.id);
      await refresh();
    });
  }, [current, refresh, runAction]);

  // GitHub 추가 권한이 필요할 때 짧게 유효한 OAuth 승인 화면으로 이동합니다.
  const startGitHubOAuth = useCallback(async (): Promise<void> => {
    if (!current) return;
    await runAction(async () => {
      const result = await createGitCicdGitHubOAuthStartUrl(current.id);
      window.location.assign(result.authorizationUrl);
    });
  }, [current, runAction]);

  // OAuth 승인을 마친 뒤 같은 Repository 설정을 다시 적용합니다.
  const applyRepositorySettingsWithOAuth = useCallback(async (): Promise<void> => {
    if (!current) return;
    await runAction(async () => {
      await applyGitCicdRepositorySettingsWithGitHubOAuth(current.id);
      await refresh();
    });
  }, [current, refresh, runAction]);

  // GitHub Actions가 AWS Role을 맡을 수 있도록 승인된 trust 변경만 적용합니다.
  const applyAwsRoleDiff = useCallback(async (): Promise<void> => {
    if (!current) return;
    await runAction(async () => {
      await applyGitCicdAwsRoleDiff(current.id);
      await refresh();
    });
  }, [current, refresh, runAction]);

  // 화면을 열면 저장된 Repository와 handoff를 복원합니다.
  useEffect(() => {
    void refresh().catch((error: unknown) => setErrorMessage(toGitCicdError(error)));
  }, [refresh]);

  // PR 또는 Pipeline이 진행 중이면 서버 상태를 주기적으로 합칩니다.
  useEffect(() => {
    if (!current || !shouldAutoRefreshGitCicdHandoff(current)) return;
    const intervalId = window.setInterval(() => {
      void getGitCicdHandoffPipelineStatus(current.id)
        .then((status) => {
          setHandoffs((existing) =>
            existing.map((handoff) =>
              handoff.id === status.id ? mergeGitCicdPipelineStatus(handoff, status) : handoff
            )
          );
        })
        .catch((error: unknown) => setErrorMessage(toGitCicdError(error)));
    }, 5_000);
    return () => window.clearInterval(intervalId);
  }, [current]);

  return {
    current,
    errorMessage,
    handoffs,
    repositories,
    requestState,
    selectedRepositoryId,
    setSelectedRepositoryId,
    create,
    applyRepositorySettings,
    startGitHubOAuth,
    applyRepositorySettingsWithOAuth,
    applyAwsRoleDiff,
    refresh,
    select: setSelectedHandoffId
  };
}

// Git/CI/CD API 오류를 다음 행동을 판단할 수 있는 한 문장으로 바꿉니다.
function toGitCicdError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Git/CI/CD 연결 작업을 완료하지 못했습니다.";
}
