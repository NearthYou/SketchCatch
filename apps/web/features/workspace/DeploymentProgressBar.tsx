import { useEffect, useMemo, useState } from "react";
import type { Deployment, DeploymentLog } from "@sketchcatch/types";
import { Code2 } from "lucide-react";
import {
  advanceDisplayedDeploymentProgress,
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
  const [displayedProgress, setDisplayedProgress] = useState({
    key: "",
    percent: 0
  });

  useEffect(() => {
    if (!isActive) return;

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 500);

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
  const hasProgress = progress !== null;
  const targetPercent = progress?.percent ?? 0;
  const progressRunKey =
    requestedAtMs !== null
      ? `${operationHint ?? "operation"}:${requestedAtMs}`
      : `${deployment?.id ?? "deployment"}:${progress?.operation ?? operationHint ?? "operation"}`;

  useEffect(() => {
    if (!hasProgress) {
      return;
    }

    const advance = () => {
      setDisplayedProgress((current) => {
        const currentPercent = current.key === progressRunKey ? current.percent : 0;
        const percent = advanceDisplayedDeploymentProgress(currentPercent, targetPercent);

        if (current.key === progressRunKey && current.percent === percent) {
          return current;
        }

        return { key: progressRunKey, percent };
      });
    };

    advance();
    const intervalId = window.setInterval(advance, 120);

    return () => window.clearInterval(intervalId);
  }, [hasProgress, progressRunKey, targetPercent]);

  const displayedPercent = displayedProgress.key === progressRunKey ? displayedProgress.percent : 0;

  if (!progress) {
    return null;
  }

  return (
    <section className={styles.deploymentExecutionPanel} aria-live="polite">
      <div className={styles.deploymentExecutionIcon} aria-hidden="true">
        <Code2 size={26} />
      </div>
      <div className={styles.deploymentExecutionBody}>
        <div>
          <strong>{progress.title}</strong>
          <p>{progress.detail}</p>
        </div>
        <div
          aria-label={`${progress.title} 예상 진행률`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={displayedPercent}
          aria-valuetext={`${displayedPercent}% · ${progress.detail}`}
          className={styles.deploymentProgressTrack}
          role="progressbar"
        >
          <span style={{ width: `${displayedPercent}%` }} />
        </div>
      </div>
      <output aria-label="예상 진행률">{displayedPercent}%</output>
    </section>
  );
}
