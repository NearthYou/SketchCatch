import React from "react";
import type { LiveObservationTimelineEvent } from "./live-observation-signal-dashboard";
import styles from "./live-observation-signal-dashboard.module.css";

/** Reveals a compact chronology only when multiple directly observed event categories can be compared without assigning causality. */
export function LiveObservationIncidentTimeline({
  events
}: {
  readonly events: readonly LiveObservationTimelineEvent[];
}) {
  if (events.length < 2) return null;

  return (
    <details className={styles.incidentTimeline}>
      <summary>사고 흐름 보기</summary>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <time dateTime={event.occurredAt}>{formatTimelineTime(event.occurredAt)}</time>
            <span>{event.label}</span>
          </li>
        ))}
      </ol>
      <p>시간이 가깝다고 원인 관계를 뜻하지는 않아요.</p>
    </details>
  );
}

/** Formats actual timestamps for a compact Korean chronology while preserving the ISO time attribute. */
function formatTimelineTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "시간 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric"
  }).format(timestamp);
}
