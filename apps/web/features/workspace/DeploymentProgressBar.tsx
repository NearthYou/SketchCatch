import { useEffect, useState } from "react";
import type { Deployment, DeploymentProgressSnapshot } from "@sketchcatch/types";
import { Code2 } from "lucide-react";
import { getDeploymentProgressSnapshot } from "./api";
import { DeploymentProgressPoller } from "./deployment-progress-poller";
import {
  getDeploymentProgressPresentation,
  type DeploymentProgressOperation
} from "./deployment-progress";
import styles from "./workspace.module.css";

export type DeploymentProgressBarProps = {
  readonly deployment: Deployment | null;
  readonly isStarting: boolean;
  readonly operationHint: DeploymentProgressOperation | null;
};

export function DeploymentProgressBar({
  deployment,
  isStarting,
  operationHint
}: DeploymentProgressBarProps) {
  const [snapshot, setSnapshot] = useState<DeploymentProgressSnapshot | null>(null);
  const [poller] = useState(
    () => new DeploymentProgressPoller({ fetchSnapshot: getDeploymentProgressSnapshot })
  );

  useEffect(() => {
    if (!deployment) {
      poller.stop();
      setSnapshot(null);
      return;
    }

    const deploymentId = deployment.id;

    if (deployment.status !== "RUNNING") {
      poller.stop();
      setSnapshot((current) =>
        reconcileTerminalSnapshot(current, deployment)
      );
      return;
    }

    setSnapshot((current) =>
      current?.deploymentId === deploymentId && current.status === "RUNNING"
        ? current
        : null
    );
    poller.start(deploymentId, setSnapshot, () => undefined);

    return () => poller.stop();
  }, [deployment?.id, deployment?.status, poller]);

  const progress = getDeploymentProgressPresentation({
    deployment,
    isStarting,
    operationHint,
    snapshot
  });

  if (!progress) {
    return null;
  }

  const isEstimated = progress.mode === "estimated";
  const progressWidth = progress.percent === null ? undefined : `${progress.percent}%`;

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
          aria-label={`${progress.title} 진행 상태`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress.percent ?? undefined}
          aria-valuetext={`${progress.valueLabel} · ${progress.detail}`}
          className={styles.deploymentProgressTrack}
          data-estimated={isEstimated ? "true" : undefined}
          data-state={progress.mode}
          role="progressbar"
        >
          <span style={progressWidth ? { width: progressWidth } : undefined} />
        </div>
      </div>
      <output aria-label="진행 상태">{progress.valueLabel}</output>
    </section>
  );
}

function reconcileTerminalSnapshot(
  current: DeploymentProgressSnapshot | null,
  deployment: Deployment
): DeploymentProgressSnapshot | null {
  if (!current || current.deploymentId !== deployment.id) {
    return null;
  }

  const measurement =
    deployment.status === "SUCCESS" || deployment.status === "DESTROYED"
      ? ({ kind: "complete", percent: 100 } as const)
      : ({ kind: "indeterminate" } as const);

  return {
    deploymentId: deployment.id,
    status: deployment.status,
    activeStage: deployment.activeStage,
    failureStage: deployment.failureStage,
    measurement,
    updatedAt: deployment.updatedAt
  };
}
