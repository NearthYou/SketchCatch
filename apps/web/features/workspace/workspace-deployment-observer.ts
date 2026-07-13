import type { Deployment, GitCicdPipelineRun } from "@sketchcatch/types";
import {
  getNotifiablePipelineRunTransitions,
  isTerminalPipelineTransition
} from "./cicd-console-state";
import { getNotifiableDirectDeploymentTransitions } from "./workspace-notifications";

export const ACTIVE_WORKSPACE_OBSERVER_INTERVAL_MS = 5_000;
export const IDLE_WORKSPACE_OBSERVER_INTERVAL_MS = 30_000;

export type WorkspaceDeploymentObservationState = {
  readonly deployments: readonly Deployment[] | null;
  readonly pipelineRuns: readonly GitCicdPipelineRun[] | null;
};

export type WorkspaceDeploymentSnapshotUpdate = {
  readonly deployments?: readonly Deployment[] | undefined;
  readonly pipelineRuns?: readonly GitCicdPipelineRun[] | undefined;
};

export type WorkspaceDeploymentObservationResult = {
  readonly state: WorkspaceDeploymentObservationState;
  readonly directTransitions: readonly Deployment[];
  readonly pipelineTransitions: readonly GitCicdPipelineRun[];
};

export function createInitialWorkspaceDeploymentObservation(): WorkspaceDeploymentObservationState {
  return { deployments: null, pipelineRuns: null };
}

export function observeWorkspaceDeploymentSnapshots(
  state: WorkspaceDeploymentObservationState,
  update: WorkspaceDeploymentSnapshotUpdate
): WorkspaceDeploymentObservationResult {
  if (update.deployments === undefined && update.pipelineRuns === undefined) {
    return { state, directTransitions: [], pipelineTransitions: [] };
  }

  const directTransitions =
    update.deployments !== undefined && state.deployments !== null
      ? getNotifiableDirectDeploymentTransitions(state.deployments, update.deployments)
      : [];
  const pipelineTransitions =
    update.pipelineRuns !== undefined && state.pipelineRuns !== null
      ? getNotifiablePipelineRunTransitions(state.pipelineRuns, update.pipelineRuns)
      : [];

  return {
    state: {
      deployments: update.deployments ?? state.deployments,
      pipelineRuns: update.pipelineRuns ?? state.pipelineRuns
    },
    directTransitions,
    pipelineTransitions
  };
}

export function getWorkspaceDeploymentObserverIntervalMs(
  state: WorkspaceDeploymentObservationState
): number {
  const hasActiveDirect = state.deployments?.some(
    (deployment) => deployment.status === "RUNNING"
  ) ?? false;
  const hasActivePipeline = state.pipelineRuns?.some(
    (run) => !isPipelineRunTerminal(run.status)
  ) ?? false;
  return hasActiveDirect || hasActivePipeline
    ? ACTIVE_WORKSPACE_OBSERVER_INTERVAL_MS
    : IDLE_WORKSPACE_OBSERVER_INTERVAL_MS;
}

function isPipelineRunTerminal(status: GitCicdPipelineRun["status"]): boolean {
  return isTerminalPipelineTransition("running", status) || status === "cancelled";
}
