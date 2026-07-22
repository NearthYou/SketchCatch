import React from "react";
import { CheckCircle2, CircleAlert, CircleHelp, LoaderCircle, Radio } from "lucide-react";
import type {
  LiveObservationDashboardStatus,
  LiveObservationSignalStatus
} from "./live-observation-signal-dashboard";
import styles from "./live-observation-signal-dashboard.module.css";

/** Renders the one concise status decision before any metrics, logs, or detailed investigation controls. */
export function LiveObservationStatusSummary({
  status
}: {
  readonly status: LiveObservationDashboardStatus;
}) {
  const Icon = getStatusIcon(status.status);

  return (
    <section
      aria-live="polite"
      className={styles.statusSummary}
      data-status={status.status}
      aria-labelledby="live-observation-status-heading"
    >
      <div className={styles.statusIcon} aria-hidden="true">
        <Icon size={20} />
      </div>
      <div className={styles.statusContent}>
        <p className={styles.eyebrow}>현재 상태</p>
        <h2 id="live-observation-status-heading">{status.title}</h2>
        <p className={styles.statusImpact}>{status.userImpact}</p>
        {status.dataNote ? <p className={styles.statusDataNote}>{status.dataNote}</p> : null}
        {status.lastObservedAt ? (
          <time className={styles.statusTimestamp} dateTime={status.lastObservedAt}>
            마지막 확인 {formatObservedAt(status.lastObservedAt)}
          </time>
        ) : null}
      </div>
    </section>
  );
}

/** Maps each textual state to an icon so status remains understandable without color. */
function getStatusIcon(status: LiveObservationSignalStatus) {
  if (status === "normal") return CheckCircle2;
  if (status === "warning" || status === "critical") return CircleAlert;
  if (status === "observed") return Radio;
  if (status === "checking") return LoaderCircle;
  return CircleHelp;
}

/** Formats an ISO time for people while retaining the original machine-readable time attribute. */
function formatObservedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "시간 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric"
  }).format(timestamp);
}
