export type DeploymentWorkerSignalSource = {
  on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  off(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
};

export function installDeploymentWorkerSignalHandlers(
  controller: AbortController,
  signalSource: DeploymentWorkerSignalSource = process
): () => void {
  const abortFromSignal = (signal: "SIGTERM" | "SIGINT") => () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error(`Deployment worker received ${signal}`));
    }
  };
  const onSigterm = abortFromSignal("SIGTERM");
  const onSigint = abortFromSignal("SIGINT");
  signalSource.on("SIGTERM", onSigterm);
  signalSource.on("SIGINT", onSigint);

  return () => {
    signalSource.off("SIGTERM", onSigterm);
    signalSource.off("SIGINT", onSigint);
  };
}
