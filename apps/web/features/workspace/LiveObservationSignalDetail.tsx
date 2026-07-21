import React from "react";
import type { LiveObservationSignal } from "./live-observation-signal-dashboard";
import { LiveObservationEvidencePanel } from "./LiveObservationEvidencePanel";
import { LiveObservationIncidentTimeline } from "./LiveObservationIncidentTimeline";
import { LiveObservationLogGroups } from "./LiveObservationLogGroups";
import {
  LiveObservationNextActions,
  type LiveObservationRecommendedAction
} from "./LiveObservationNextActions";
import type { LiveObservationLogGroup } from "./live-observation-log-groups";
import styles from "./live-observation-signal-dashboard.module.css";

/** Presents impact, evidence, logs, and only available next checks for the signal the user selected. */
export function LiveObservationSignalDetail({
  logGroups,
  recommendedAction,
  signal
}: {
  readonly logGroups: readonly LiveObservationLogGroup[];
  readonly recommendedAction?: LiveObservationRecommendedAction | null | undefined;
  readonly signal: LiveObservationSignal;
}) {
  return (
    <section
      aria-labelledby="live-observation-signal-detail-heading"
      className={styles.signalDetail}
    >
      <div className={styles.detailIntro}>
        <p className={styles.eyebrow}>선택한 신호</p>
        <h2 id="live-observation-signal-detail-heading">{signal.title}</h2>
        <p>{signal.userImpact}</p>
      </div>
      {signal.history.length >= 2 ? (
        <LiveObservationSignalSparkline points={signal.history} />
      ) : null}
      <div className={styles.detailGrid}>
        <div className={styles.detailPrimaryColumn}>
          <LiveObservationEvidencePanel signal={signal} />
          <LiveObservationIncidentTimeline events={signal.timeline} />
        </div>
        <div className={styles.detailSecondaryColumn}>
          <LiveObservationLogGroups groups={logGroups} />
          <LiveObservationNextActions
            hasLogDetails={logGroups.length > 0}
            recommendedAction={recommendedAction}
          />
        </div>
      </div>
    </section>
  );
}

/** Draws a small static SVG from actual in-session samples only; no line is rendered when the session lacks history. */
function LiveObservationSignalSparkline({
  points
}: {
  readonly points: LiveObservationSignal["history"];
}) {
  const pathPoints = getSparklinePoints(points);
  return (
    <figure className={styles.sparkline}>
      <figcaption>최근 이 세션에서 확인한 값</figcaption>
      <svg
        aria-label="최근 실제 관측값 변화"
        height="44"
        role="img"
        viewBox="0 0 160 44"
        width="160"
      >
        <polyline
          fill="none"
          points={pathPoints}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </figure>
  );
}

/** Normalizes bounded actual points into the SVG viewport without inventing missing samples or a comparison baseline. */
function getSparklinePoints(points: LiveObservationSignal["history"]): string {
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const lastIndex = Math.max(points.length - 1, 1);

  return points
    .map((point, index) => {
      const x = (index / lastIndex) * 156 + 2;
      const y = 38 - ((point.value - minimum) / range) * 32;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
