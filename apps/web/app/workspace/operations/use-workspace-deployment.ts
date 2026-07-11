"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deployment, DeploymentLog, DiagramJson } from "@sketchcatch/types";
import type { WorkspaceSafetyState } from "./use-workspace-safety";
import type { WorkspaceTerraformState } from "./use-workspace-terraform";
import {
  approveDeploymentPlan,
  cancelDeployment,
  createDeployment,
  listAwsConnections,
  listDeploymentLogs,
  listDeployments,
  runDeploymentApply,
  runDeploymentDestroy,
  runDeploymentDestroyPlan,
  runDeploymentInit,
  runDeploymentPlan,
  streamDeploymentLogs
} from "../../../features/workspace/api";
import {
  getDeploymentActionState,
  getRecommendedDeploymentLiveProfile
} from "../../../features/workspace/deployment-actions";
import { saveWorkspaceTerraformArtifact } from "../../../features/workspace/workspace-deployment-artifacts";
import { selectCurrentDeployment } from "../../../features/workspace/workspace-operations-state";

type DeploymentRequestState = "idle" | "loading";

export type WorkspaceDeploymentState = {
  readonly actionState: ReturnType<typeof getDeploymentActionState>;
  readonly current: Deployment | null;
  readonly deployments: readonly Deployment[];
  readonly errorMessage: string;
  readonly logs: readonly DeploymentLog[];
  readonly requestState: DeploymentRequestState;
  readonly prepare: () => Promise<void>;
  readonly runPlan: () => Promise<void>;
  readonly approvePlan: () => Promise<void>;
  readonly apply: () => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly planCleanup: () => Promise<void>;
  readonly cleanup: () => Promise<void>;
  readonly select: (deployment: Deployment) => void;
};

// 저장, Plan, 승인, Apply, Cleanup과 실시간 log를 한 배포 상태로 관리합니다.
export function useWorkspaceDeployment({
  diagram,
  projectId,
  safety,
  saveDiagram,
  terraform
}: {
  readonly diagram: DiagramJson;
  readonly projectId: string;
  readonly safety: WorkspaceSafetyState;
  readonly saveDiagram: (() => Promise<unknown>) | undefined;
  readonly terraform: WorkspaceTerraformState;
}): WorkspaceDeploymentState {
  const [current, setCurrent] = useState<Deployment | null>(null);
  const [deployments, setDeployments] = useState<readonly Deployment[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [logs, setLogs] = useState<readonly DeploymentLog[]>([]);
  const [requestState, setRequestState] = useState<DeploymentRequestState>("idle");
  const lastLogSequenceRef = useRef(0);
  const actionState = useMemo(
    () => getDeploymentActionState(current, requestState),
    [current, requestState]
  );

  // 서버의 배포 이력을 새로 읽고 최신 실행을 기본 선택합니다.
  const refreshDeployments = useCallback(async (): Promise<void> => {
    const loaded = await listDeployments(projectId);
    setDeployments(loaded);
    setCurrent((selected) =>
      selected ? loaded.find((deployment) => deployment.id === selected.id) ?? selected : selectCurrentDeployment(loaded)
    );
  }, [projectId]);

  // 선택한 실행의 저장된 log를 다시 읽습니다.
  const refreshLogs = useCallback(async (deployment: Deployment | null): Promise<void> => {
    if (!deployment) {
      setLogs([]);
      lastLogSequenceRef.current = 0;
      return;
    }
    const loadedLogs = await listDeploymentLogs(deployment.id);
    setLogs(loadedLogs);
    lastLogSequenceRef.current = loadedLogs.at(-1)?.sequence ?? 0;
  }, []);

  // 중복된 요청 상태와 오류 처리를 한곳에서 관리하며 배포 작업을 실행합니다.
  const runAction = useCallback(async (
    action: () => Promise<Deployment>
  ): Promise<void> => {
    setRequestState("loading");
    setErrorMessage("");
    try {
      const deployment = await action();
      setCurrent(deployment);
      await refreshDeployments();
      await refreshLogs(deployment);
    } catch (error) {
      setErrorMessage(toDeploymentError(error));
    } finally {
      setRequestState("idle");
    }
  }, [refreshDeployments, refreshLogs]);

  // 저장된 Board와 최신 Terraform artifact를 기준으로 새 배포 실행을 준비합니다.
  const prepare = useCallback(async (): Promise<void> => {
    if (terraform.previewState !== "current") {
      setErrorMessage("현재 Board 기준으로 Terraform 코드를 다시 생성해주세요.");
      return;
    }
    if (safety.gate.kind === "not-checked" || safety.gate.kind === "blocked") {
      setErrorMessage(safety.gate.reason);
      return;
    }

    await runAction(async () => {
      await saveDiagram?.();
      const connections = await listAwsConnections();
      const connection = connections.find((candidate) => candidate.status === "verified");
      if (!connection) throw new Error("검증된 AWS 연결이 없습니다. 환경설정에서 먼저 연결해주세요.");

      const saved = await saveWorkspaceTerraformArtifact({
        diagramJson: diagram,
        projectId,
        terraformCode: terraform.code
      });
      const created = await createDeployment({
        projectId,
        architectureId: saved.architecture.id,
        terraformArtifactId: saved.terraformArtifact.id,
        awsConnectionId: connection.id,
        liveProfile: getRecommendedDeploymentLiveProfile(diagram)
      });
      return runDeploymentInit(created.id);
    });
  }, [diagram, projectId, runAction, safety.gate, saveDiagram, terraform.code, terraform.previewState]);

  // 저장과 검사가 끝난 실행에 실제 AWS 변경 계획만 생성합니다.
  const runPlan = useCallback(async (): Promise<void> => {
    if (current) await runAction(() => runDeploymentPlan(current.id));
  }, [current, runAction]);

  // 사용자가 Plan 경고를 확인한 뒤 현재 Plan snapshot을 승인합니다.
  const approvePlan = useCallback(async (): Promise<void> => {
    if (!current) return;
    const warningIds = current.planSummary?.warnings
      .filter((warning) => warning.requiresAcknowledgement)
      .map((warning) => warning.id) ?? [];
    await runAction(() => approveDeploymentPlan(current.id, warningIds));
  }, [current, runAction]);

  // 승인 snapshot과 안전 게이트가 모두 유효할 때만 Apply를 실행합니다.
  const apply = useCallback(async (): Promise<void> => {
    if (!current || safety.gate.kind === "blocked") return;
    await runAction(() => runDeploymentApply(current.id));
  }, [current, runAction, safety.gate.kind]);

  // 현재 실행 중인 Terraform 작업에 취소 요청을 보냅니다.
  const cancel = useCallback(async (): Promise<void> => {
    if (current) await runAction(() => cancelDeployment(current.id));
  }, [current, runAction]);

  // 성공 또는 부분 실패한 배포에서 삭제 예정 Resource 계획을 먼저 만듭니다.
  const planCleanup = useCallback(async (): Promise<void> => {
    if (current) await runAction(() => runDeploymentDestroyPlan(current.id));
  }, [current, runAction]);

  // 사용자가 승인한 Cleanup Plan만 실제로 실행합니다.
  const cleanup = useCallback(async (): Promise<void> => {
    if (current) await runAction(() => runDeploymentDestroy(current.id));
  }, [current, runAction]);

  // 이력에서 고른 실행을 현재 상세와 log 대상으로 바꿉니다.
  const select = useCallback((deployment: Deployment): void => {
    setCurrent(deployment);
    void refreshLogs(deployment).catch((error: unknown) => setErrorMessage(toDeploymentError(error)));
  }, [refreshLogs]);

  // 프로젝트가 열리면 기존 배포 이력을 한 번 복원합니다.
  useEffect(() => {
    void refreshDeployments().catch((error: unknown) => setErrorMessage(toDeploymentError(error)));
  }, [refreshDeployments]);

  // 실행 중에는 SSE log를 이어 받고 종료되면 최종 배포 상태를 다시 읽습니다.
  useEffect(() => {
    if (current?.status !== "RUNNING") return;
    const controller = new AbortController();
    void streamDeploymentLogs({
      deploymentId: current.id,
      sinceSequence: lastLogSequenceRef.current,
      signal: controller.signal,
      onLog: (log) => {
        lastLogSequenceRef.current = Math.max(lastLogSequenceRef.current, log.sequence);
        setLogs((existing) => mergeDeploymentLog(existing, log));
      }
    }).then(refreshDeployments).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage("실시간 log 연결이 끊겼습니다. 배포 상태와는 별개로 다시 연결할 수 있습니다.");
    });
    return () => controller.abort();
  }, [current?.id, current?.status, refreshDeployments]);

  return {
    actionState,
    current,
    deployments,
    errorMessage,
    logs,
    requestState,
    prepare,
    runPlan,
    approvePlan,
    apply,
    cancel,
    planCleanup,
    cleanup,
    select
  };
}

// 같은 sequence log를 중복하지 않고 시간 순서대로 유지합니다.
function mergeDeploymentLog(logs: readonly DeploymentLog[], next: DeploymentLog): DeploymentLog[] {
  if (logs.some((log) => log.sequence === next.sequence)) return [...logs];
  return [...logs, next].sort((left, right) => left.sequence - right.sequence);
}

// 배포 API 오류를 사용자가 다음 행동을 판단할 수 있는 문장으로 바꿉니다.
function toDeploymentError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "배포 작업을 완료하지 못했습니다.";
}
