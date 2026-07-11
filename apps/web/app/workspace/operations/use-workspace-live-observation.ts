"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Deployment,
  LiveObservationSession,
  LiveObservationSnapshot
} from "@sketchcatch/types";
import {
  createLiveObservation,
  stopLiveObservation,
  streamLiveObservationSnapshots
} from "../../../features/workspace/api";
import { getEligibleLiveObservationDeployments } from "../../../features/workspace/live-observation";

type LiveObservationRequestState = "idle" | "loading";

export type WorkspaceLiveObservationState = {
  readonly eligibleDeployments: readonly Deployment[];
  readonly errorMessage: string;
  readonly requestState: LiveObservationRequestState;
  readonly selectedDeploymentId: string;
  readonly session: LiveObservationSession | null;
  readonly snapshot: LiveObservationSnapshot | null;
  readonly selectDeployment: (deploymentId: string) => void;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

// 성공한 시연용 배포의 실시간 관찰 session과 snapshot stream을 관리합니다.
export function useWorkspaceLiveObservation(
  deployments: readonly Deployment[]
): WorkspaceLiveObservationState {
  const eligibleDeployments = useMemo(
    () => getEligibleLiveObservationDeployments(deployments),
    [deployments]
  );
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [session, setSession] = useState<LiveObservationSession | null>(null);
  const [snapshot, setSnapshot] = useState<LiveObservationSnapshot | null>(null);
  const [requestState, setRequestState] = useState<LiveObservationRequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // 배포 목록이 바뀌면 선택 가능한 최신 배포를 유지하거나 새로 고릅니다.
  useEffect(() => {
    setSelectedDeploymentId((current) =>
      eligibleDeployments.some((deployment) => deployment.id === current)
        ? current
        : eligibleDeployments[0]?.id ?? ""
    );
  }, [eligibleDeployments]);

  // 사용자가 고른 성공 배포에서 새 관찰 session을 시작합니다.
  const start = useCallback(async (): Promise<void> => {
    if (!selectedDeploymentId || requestState !== "idle") return;
    setRequestState("loading");
    setErrorMessage("");
    try {
      const result = await createLiveObservation(selectedDeploymentId);
      setSession(result.session);
      setSnapshot(result.snapshot);
    } catch (error) {
      setErrorMessage(toLiveObservationError(error));
    } finally {
      setRequestState("idle");
    }
  }, [requestState, selectedDeploymentId]);

  // 사용자가 중지한 session의 마지막 snapshot을 보존합니다.
  const stop = useCallback(async (): Promise<void> => {
    if (!session || requestState !== "idle") return;
    setRequestState("loading");
    setErrorMessage("");
    try {
      const stoppedSnapshot = await stopLiveObservation(session.deploymentId, session.id);
      setSnapshot(stoppedSnapshot);
      setSession((current) => current ? { ...current, status: stoppedSnapshot.status } : null);
    } catch (error) {
      setErrorMessage(toLiveObservationError(error));
    } finally {
      setRequestState("idle");
    }
  }, [requestState, session]);

  // 활성 session은 SSE와 polling fallback으로 snapshot을 계속 갱신합니다.
  useEffect(() => {
    if (!session || session.status !== "active") return;
    const controller = new AbortController();
    void streamLiveObservationSnapshots({
      deploymentId: session.deploymentId,
      observationId: session.id,
      signal: controller.signal,
      onSnapshot: (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        if (nextSnapshot.status !== "active") {
          setSession((current) => current ? { ...current, status: nextSnapshot.status } : null);
        }
      },
      onError: () => setErrorMessage("실시간 연결이 지연되어 snapshot 조회로 다시 시도하고 있습니다.")
    });
    return () => controller.abort();
  }, [session]);

  return {
    eligibleDeployments,
    errorMessage,
    requestState,
    selectedDeploymentId,
    session,
    snapshot,
    selectDeployment: setSelectedDeploymentId,
    start,
    stop
  };
}

// 실시간 관찰 API 오류를 다음 행동을 판단할 수 있는 한 문장으로 바꿉니다.
function toLiveObservationError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "실시간 관찰을 시작하지 못했습니다.";
}
