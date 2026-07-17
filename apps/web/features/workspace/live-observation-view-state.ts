export type LiveObservationViewport = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

export type LiveObservationViewState = {
  readonly projectId: string;
  readonly selectedDeploymentId: string;
  readonly viewportByDeploymentId: Readonly<Record<string, LiveObservationViewport>>;
};

export function createLiveObservationViewState(projectId: string): LiveObservationViewState {
  return {
    projectId,
    selectedDeploymentId: "",
    viewportByDeploymentId: {}
  };
}

export function selectLiveObservationDeployment(
  state: LiveObservationViewState,
  projectId: string,
  deploymentId: string
): LiveObservationViewState {
  const current = state.projectId === projectId ? state : createLiveObservationViewState(projectId);

  return current.selectedDeploymentId === deploymentId
    ? current
    : { ...current, selectedDeploymentId: deploymentId };
}

export function storeLiveObservationViewport(
  state: LiveObservationViewState,
  projectId: string,
  deploymentId: string,
  viewport: LiveObservationViewport
): LiveObservationViewState {
  const current = state.projectId === projectId ? state : createLiveObservationViewState(projectId);

  if (!deploymentId) return current;

  return {
    ...current,
    viewportByDeploymentId: {
      ...current.viewportByDeploymentId,
      [deploymentId]: viewport
    }
  };
}

export function readLiveObservationViewState(
  state: LiveObservationViewState,
  projectId: string
): {
  readonly selectedDeploymentId: string;
  readonly viewport: LiveObservationViewport | null;
} {
  if (state.projectId !== projectId) {
    return { selectedDeploymentId: "", viewport: null };
  }

  return {
    selectedDeploymentId: state.selectedDeploymentId,
    viewport: state.viewportByDeploymentId[state.selectedDeploymentId] ?? null
  };
}
