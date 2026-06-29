const activeDeploymentRuns = new Map<string, AbortController>();

export function startTrackedDeploymentRun(
  deploymentId: string,
  run: (abortSignal: AbortSignal) => Promise<void>
): void {
  const controller = new AbortController();

  activeDeploymentRuns.set(deploymentId, controller);

  void run(controller.signal).finally(() => {
    if (activeDeploymentRuns.get(deploymentId) === controller) {
      activeDeploymentRuns.delete(deploymentId);
    }
  });
}

export function cancelTrackedDeploymentRun(deploymentId: string): boolean {
  const controller = activeDeploymentRuns.get(deploymentId);

  if (!controller) {
    return false;
  }

  controller.abort();
  return true;
}
