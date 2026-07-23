import React from "react";
import type { LiveObservationLogGroup } from "./live-observation-log-groups";
import styles from "./live-observation-signal-dashboard.module.css";

/** Shows a compact repeated-log summary and keeps the already-masked representative line collapsed by default. */
export function LiveObservationLogGroups({
  groups
}: {
  readonly groups: readonly LiveObservationLogGroup[];
}) {
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="live-observation-log-groups-heading" className={styles.logGroups}>
      <h3 id="live-observation-log-groups-heading">관련 로그</h3>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            <div className={styles.logGroupSummary}>
              <strong>{group.summary}</strong>
              <span>{group.count}회</span>
            </div>
            <p>{formatLogRange(group.firstObservedAt, group.lastObservedAt)}</p>
            <details>
              <summary>로그 보기</summary>
              <pre>{group.normalizedMessage}</pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Presents the stored timestamps as one compact range while the detailed raw line remains intentionally collapsed. */
function formatLogRange(firstObservedAt: string, lastObservedAt: string): string {
  if (firstObservedAt === lastObservedAt) return `최근 기록 ${formatTime(lastObservedAt)}`;
  return `${formatTime(firstObservedAt)} ~ ${formatTime(lastObservedAt)}`;
}

/** Falls back gracefully when an upstream timestamp cannot be parsed instead of emitting an internal error. */
function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "시간 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}
