import { useEffect, useMemo, useState } from "react";
import type { Deployment, DeploymentLog } from "@sketchcatch/types";
import {
  getDeploymentProgress,
  type DeploymentProgressOperation
} from "./deployment-progress";
import styles from "./workspace.module.css";

export type DeploymentProgressBarProps = {
  readonly deployment: Deployment | null;
  readonly isStarting: boolean;
  readonly logs: readonly DeploymentLog[];
  readonly operationHint: DeploymentProgressOperation | null;
  readonly requestedAtMs: number | null;
};

export function DeploymentProgressBar({
  deployment,
  isStarting,
  logs,
  operationHint,
  requestedAtMs
}: DeploymentProgressBarProps) {
  const isActive = isStarting || deployment?.status === "RUNNING";
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) return;

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, [deployment?.activeStage, deployment?.id, isActive, operationHint]);

  const progress = useMemo(
    () =>
      getDeploymentProgress({
        deployment,
        isStarting,
        logs,
        nowMs,
        operationHint,
        requestedAtMs
      }),
    [deployment, isStarting, logs, nowMs, operationHint, requestedAtMs]
  );

  if (!progress) {
    return null;
  }

  return (
    <section className={styles.deploymentProgress} aria-live="polite">
      <strong>{progress.title}</strong>
      <div
        aria-label={`${progress.title} 예상 진행률`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        aria-valuetext={`${progress.percent}% · ${progress.detail}`}
        className={styles.deploymentProgressTrack}
        role="progressbar"
      >
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <output aria-label="예상 진행률">{progress.percent}%</output>
    </section>
  );
}
